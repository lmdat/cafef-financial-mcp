// Các type mô tả cấu trúc response thật từ API cafef.vn

export interface CafefTemplateItem {
  code: string;
  name: string;
  data?: CafefTemplateItem[]; // dùng cho Balance Sheet / Cash Flow (có nhóm con)
}

export interface CafefDataPoint {
  code: string;
  value: number;
}

export interface CafefDataByTime {
  time: string; // ví dụ "Q1-2026" hoặc "2025"
  data: CafefDataPoint[];
}

export interface CafefDataGroup {
  code: string; // ví dụ "TN", "NV", "HDKD", "HDDT", "HDTC"
  data: CafefDataByTime[];
}

// Income Statement không có nhóm con -> data là CafefDataByTime[] trực tiếp
export type CafefApiValue = {
  templace: CafefTemplateItem[];
  data: CafefDataGroup[] | CafefDataByTime[];
};

export interface CafefApiResponse {
  isSuccess: boolean;
  value: CafefApiValue;
  errors: string[];
}

// ===== Output chuẩn hóa trả về cho agent =====

export interface FinancialLineItem {
  code: string;
  name: string;
  values: (number | null)[]; // theo đúng thứ tự periods
}

export interface NormalizedReport {
  ticker: string;
  reportType: "balance_sheet" | "income_statement" | "cash_flow";
  periods: string[]; // đã sắp xếp tăng dần theo thời gian
  unit: "VND";
  sourceUrl: string;
  items: FinancialLineItem[];
  // Các chỉ tiêu quan trọng đã trích sẵn theo code chuẩn, tiện cho agent dùng ngay
  keyMetrics: Record<string, (number | null)[]>;
  missingPeriods: string[]; // các period bị phát hiện thiếu dữ liệu (toàn 0 bất thường)
}
