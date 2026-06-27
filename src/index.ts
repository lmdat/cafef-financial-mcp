#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getBalanceSheet, getIncomeStatement, getCashFlow } from "./cafefClient.js";
import type { NormalizedReport } from "./types.js";
import { createRequire } from "node:module";

// Đọc name/version từ package.json lúc runtime — thay vì ghi cứng, để 2 chỗ
// (MCP protocol serverInfo và npm package) luôn khớp nhau, chỉ cần bump version
// ở 1 nơi duy nhất (package.json).
const require = createRequire(import.meta.url);
const pkg: { name: string; version: string } = require("../package.json");

const MCP_SERVER_NAME = "cafef-financial-mcp";
const MCP_SERVER_VERSION = pkg.version;

const server = new McpServer({
  name: MCP_SERVER_NAME,
  version: MCP_SERVER_VERSION,
});

const tickerSchema = z
  .string()
  .min(1)
  .max(10)
  .describe("Mã cổ phiếu, ví dụ FPT, VNM, HPG");

const typeTimeSchema = z
  .enum(["QUY", "NAM"])
  .default("QUY")
  .describe("QUY = lấy theo quý, NAM = lấy theo năm");

const pageSizeSchema = z
  .number()
  .int()
  .min(1)
  .max(20)
  .default(4)
  .describe("Số kỳ gần nhất cần lấy (mặc định 4)");

function formatResult(report: NormalizedReport) {
  const warning =
    report.missingPeriods.length > 0
      ? `\n\n⚠️ CẢNH BÁO: ${report.missingPeriods.length} kỳ bị phát hiện THIẾU DỮ LIỆU (toàn 0 bất thường): ${report.missingPeriods.join(", ")}. Các giá trị này đã được trả về null, KHÔNG dùng số 0 thật để tính toán cho các kỳ này.`
      : "";

  return {
    content: [
      {
        type: "text" as const,
        text:
          `Báo cáo: ${report.reportType} — Mã: ${report.ticker}\n` +
          `Các kỳ: ${report.periods.join(", ")}\n` +
          `Nguồn: ${report.sourceUrl}\n` +
          `Đơn vị: ${report.unit}${warning}\n\n` +
          JSON.stringify(report, null, 2),
      },
    ],
  };
}

server.registerTool(
  "get_balance_sheet",
  {
    title: "Lấy Bảng cân đối kế toán",
    description:
      "Lấy dữ liệu Bảng cân đối kế toán (Balance Sheet) của 1 mã cổ phiếu Việt Nam từ API công khai cafef.vn. " +
      "Trả về các chỉ tiêu chuẩn (tổng tài sản, nợ phải trả, vốn chủ sở hữu, phải thu ngắn hạn, hàng tồn kho...) " +
      "theo nhiều kỳ gần nhất, đã chuẩn hóa số liệu (number thật) và phát hiện kỳ thiếu dữ liệu.",
    inputSchema: {
      ticker: tickerSchema,
      typeTime: typeTimeSchema,
      pageSize: pageSizeSchema,
    },
  },
  async ({ ticker, typeTime, pageSize }) => {
    try {
      const report = await getBalanceSheet(ticker, typeTime, pageSize);
      return formatResult(report);
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Lỗi khi lấy Bảng cân đối kế toán cho ${ticker}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "get_income_statement",
  {
    title: "Lấy Báo cáo kết quả kinh doanh",
    description:
      "Lấy dữ liệu Báo cáo kết quả hoạt động kinh doanh (Income Statement) của 1 mã cổ phiếu Việt Nam từ API " +
      "công khai cafef.vn. Trả về doanh thu thuần, lợi nhuận gộp, lợi nhuận sau thuế theo nhiều kỳ gần nhất, " +
      "đã chuẩn hóa số liệu và phát hiện kỳ thiếu dữ liệu.",
    inputSchema: {
      ticker: tickerSchema,
      typeTime: typeTimeSchema,
      pageSize: pageSizeSchema,
    },
  },
  async ({ ticker, typeTime, pageSize }) => {
    try {
      const report = await getIncomeStatement(ticker, typeTime, pageSize);
      return formatResult(report);
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Lỗi khi lấy Báo cáo KQKD cho ${ticker}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "get_cash_flow",
  {
    title: "Lấy Báo cáo lưu chuyển tiền tệ",
    description:
      "Lấy dữ liệu Báo cáo lưu chuyển tiền tệ (Cash Flow Statement) của 1 mã cổ phiếu Việt Nam từ API công khai " +
      "cafef.vn. Trả về lưu chuyển tiền thuần từ hoạt động kinh doanh, tiền và tương đương tiền cuối kỳ theo " +
      "nhiều kỳ gần nhất, đã chuẩn hóa số liệu và phát hiện kỳ thiếu dữ liệu. Lưu ý: mã chỉ tiêu (code) trong " +
      "báo cáo này có tiền tố theo nhóm (HDKD_xx, HDDT_xx, HDTC_xx), khác với Balance Sheet/Income Statement.",
    inputSchema: {
      ticker: tickerSchema,
      typeTime: typeTimeSchema,
      pageSize: pageSizeSchema,
    },
  },
  async ({ ticker, typeTime, pageSize }) => {
    try {
      const report = await getCashFlow(ticker, typeTime, pageSize);
      return formatResult(report);
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Lỗi khi lấy Báo cáo lưu chuyển tiền tệ cho ${ticker}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          },
        ],
        isError: true,
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("cafef-financial-mcp server đang chạy qua stdio");
}

main().catch((err) => {
  console.error("Lỗi khởi động server:", err);
  process.exit(1);
});
