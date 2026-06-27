import type {
  CafefApiResponse,
  CafefDataByTime,
  CafefDataGroup,
  CafefTemplateItem,
  FinancialLineItem,
  NormalizedReport,
} from "./types.js";

const HEADERS = { "User-Agent": "Mozilla/5.0" };

/**
 * Parse "Q1-2026" -> [2026, 1] (theo quý), hoặc "2025" -> [2025, 0] (theo năm).
 * Dùng để sort lại period theo đúng thứ tự thời gian tăng dần — KHÔNG
 * giả định API trả về đúng thứ tự sẵn.
 */
function parsePeriod(time: string): [number, number] {
  if (time.startsWith("Q")) {
    const [q, y] = time.slice(1).split("-");
    return [parseInt(y, 10), parseInt(q, 10)];
  }
  return [parseInt(time, 10), 0];
}

function sortPeriods(periods: string[]): string[] {
  return [...periods].sort((a, b) => {
    const [ya, qa] = parsePeriod(a);
    const [yb, qb] = parsePeriod(b);
    if (ya !== yb) return ya - yb;
    return qa - qb;
  });
}

/** Build map {code: name} từ templace. co_nhom=true cho Balance Sheet/Cash Flow. */
function buildNameMap(
  templace: CafefTemplateItem[],
  coNhom: boolean
): Map<string, string> {
  const map = new Map<string, string>();
  if (coNhom) {
    for (const nhom of templace) {
      for (const item of nhom.data ?? []) {
        map.set(item.code, item.name);
      }
    }
  } else {
    for (const item of templace) {
      map.set(item.code, item.name);
    }
  }
  return map;
}

/** Gộp data theo từng period -> Map<period, Map<code, value>>. */
function buildValuesByPeriod(
  data: CafefDataGroup[] | CafefDataByTime[],
  coNhom: boolean
): Map<string, Map<string, number>> {
  const result = new Map<string, Map<string, number>>();

  const ingest = (entries: CafefDataByTime[]) => {
    for (const ky of entries) {
      if (!result.has(ky.time)) result.set(ky.time, new Map());
      const m = result.get(ky.time)!;
      for (const item of ky.data) {
        m.set(item.code, item.value);
      }
    }
  };

  if (coNhom) {
    for (const nhom of data as CafefDataGroup[]) {
      ingest(nhom.data);
    }
  } else {
    ingest(data as CafefDataByTime[]);
  }
  return result;
}

/**
 * Phát hiện period bị thiếu dữ liệu thật (toàn bộ mã quan trọng đều = 0).
 * Đây KHÔNG phải doanh nghiệp có giá trị 0 thật ở mọi chỉ tiêu — mà là
 * dấu hiệu cafef chưa cập nhật / không có data cho kỳ đó.
 */
function isPeriodMissing(
  valuesForPeriod: Map<string, number> | undefined,
  importantCodes: string[]
): boolean {
  if (!valuesForPeriod) return true;
  const found = importantCodes
    .map((c) => valuesForPeriod.get(c))
    .filter((v) => v !== undefined);
  if (found.length === 0) return true;
  return found.every((v) => v === 0);
}

async function fetchCafefApi(
  endpointUrl: string,
  ticker: string,
  reportTypeParam: string,
  typeTime: "QUY" | "NAM",
  pageSize: number
): Promise<CafefApiResponse> {
  const url = new URL(endpointUrl);
  url.searchParams.set("symbol", ticker.toUpperCase());
  url.searchParams.set("pageIndex", "1");
  url.searchParams.set("pageSize", String(pageSize));
  url.searchParams.set("reportType", reportTypeParam);
  url.searchParams.set("TypeTime", typeTime);

  const res = await fetch(url.toString(), { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`Lỗi HTTP ${res.status} khi gọi ${url.toString()}`);
  }
  const json = (await res.json()) as CafefApiResponse;
  if (!json.isSuccess) {
    throw new Error(`API cafef trả lỗi: ${JSON.stringify(json.errors)}`);
  }
  return json;
}

interface BuildReportOptions {
  ticker: string;
  reportType: "balance_sheet" | "income_statement" | "cash_flow";
  endpointUrl: string;
  reportTypeParam: string; // "ALL" hoặc "KQKD"
  coNhom: boolean; // true cho balance_sheet/cash_flow, false cho income_statement
  typeTime: "QUY" | "NAM";
  pageSize: number;
  importantCodes: string[]; // dùng để phát hiện period thiếu data
  keyMetricCodes: Record<string, string>; // {ten_chi_tieu: code} để build keyMetrics
}

async function buildNormalizedReport(
  opts: BuildReportOptions
): Promise<NormalizedReport> {
  const apiResp = await fetchCafefApi(
    opts.endpointUrl,
    opts.ticker,
    opts.reportTypeParam,
    opts.typeTime,
    opts.pageSize
  );

  const nameMap = buildNameMap(apiResp.value.templace, opts.coNhom);
  const valuesByPeriod = buildValuesByPeriod(apiResp.value.data, opts.coNhom);

  const periodsRaw = Array.from(valuesByPeriod.keys());
  const periods = sortPeriods(periodsRaw);

  const missingPeriods: string[] = [];
  for (const p of periods) {
    if (isPeriodMissing(valuesByPeriod.get(p), opts.importantCodes)) {
      missingPeriods.push(p);
    }
  }

  // Build danh sách toàn bộ code xuất hiện trong dữ liệu
  const allCodes = new Set<string>();
  for (const m of valuesByPeriod.values()) {
    for (const code of m.keys()) allCodes.add(code);
  }

  const items: FinancialLineItem[] = Array.from(allCodes).map((code) => {
    const values = periods.map((p) => {
      if (missingPeriods.includes(p)) return null;
      const v = valuesByPeriod.get(p)?.get(code);
      return v === undefined ? null : v;
    });
    return { code, name: nameMap.get(code) ?? "", values };
  });

  const itemsByCode = new Map(items.map((it) => [it.code, it]));
  const keyMetrics: Record<string, (number | null)[]> = {};
  for (const [label, code] of Object.entries(opts.keyMetricCodes)) {
    keyMetrics[label] = itemsByCode.get(code)?.values ?? periods.map(() => null);
  }

  const sourceUrl = (() => {
    const u = new URL(opts.endpointUrl);
    u.searchParams.set("symbol", opts.ticker.toUpperCase());
    u.searchParams.set("pageSize", String(opts.pageSize));
    u.searchParams.set("reportType", opts.reportTypeParam);
    u.searchParams.set("TypeTime", opts.typeTime);
    return u.toString();
  })();

  return {
    ticker: opts.ticker.toUpperCase(),
    reportType: opts.reportType,
    periods,
    unit: "VND",
    sourceUrl,
    items,
    keyMetrics,
    missingPeriods,
  };
}

const ENDPOINTS = {
  balanceSheet: "https://apiweb.cafef.vn/api/v2/BCTC/GetReportCDKT",
  incomeStatement: "https://apiweb.cafef.vn/api/v1/BCTC/GetReportDetail",
  cashFlow: "https://apiweb.cafef.vn/api/v1/BCTC/GetReportLCTT",
};

// Mã chỉ tiêu chuẩn theo Thông tư 200/2014/TT-BTC (đa số doanh nghiệp VN)
export async function getBalanceSheet(
  ticker: string,
  typeTime: "QUY" | "NAM" = "QUY",
  pageSize = 4
): Promise<NormalizedReport> {
  return buildNormalizedReport({
    ticker,
    reportType: "balance_sheet",
    endpointUrl: ENDPOINTS.balanceSheet,
    reportTypeParam: "ALL",
    coNhom: true,
    typeTime,
    pageSize,
    importantCodes: ["270", "300", "400"],
    keyMetricCodes: {
      tong_tai_san: "270",
      no_phai_tra: "300",
      von_chu_so_huu: "400",
      tien_va_tuong_duong_tien: "110",
      phai_thu_ngan_han: "130",
      hang_ton_kho: "140",
    },
  });
}

export async function getIncomeStatement(
  ticker: string,
  typeTime: "QUY" | "NAM" = "QUY",
  pageSize = 4
): Promise<NormalizedReport> {
  return buildNormalizedReport({
    ticker,
    reportType: "income_statement",
    endpointUrl: ENDPOINTS.incomeStatement,
    reportTypeParam: "KQKD",
    coNhom: false,
    typeTime,
    pageSize,
    importantCodes: ["10", "20", "60"],
    keyMetricCodes: {
      doanh_thu_thuan: "10",
      loi_nhuan_gop: "20",
      loi_nhuan_sau_thue: "60",
    },
  });
}

export async function getCashFlow(
  ticker: string,
  typeTime: "QUY" | "NAM" = "QUY",
  pageSize = 4
): Promise<NormalizedReport> {
  return buildNormalizedReport({
    ticker,
    reportType: "cash_flow",
    endpointUrl: ENDPOINTS.cashFlow,
    reportTypeParam: "ALL",
    coNhom: true,
    typeTime,
    pageSize,
    importantCodes: ["HDKD_20", "HDTC_42"],
    keyMetricCodes: {
      luu_chuyen_tu_hdkd: "HDKD_20",
      tien_cuoi_ky: "HDTC_42",
    },
  });
}
