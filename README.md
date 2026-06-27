# cafef-financial-mcp

Local MCP server (Node.js + TypeScript) lấy dữ liệu báo cáo tài chính doanh nghiệp Việt Nam
(Bảng cân đối kế toán, Báo cáo kết quả kinh doanh, Báo cáo lưu chuyển tiền tệ) trực tiếp từ
cafef.vn — không cần PDF, không cần OCR.

## Yêu cầu

- Node.js 18+

## 1. Cài đặt

```bash
npm install
```

## 2. Build

| Lệnh                       | Output                                                           | Dùng khi nào                                                                        |
| --------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `npm run build`           | `build/index.js`, `build/cafefClient.js`, `build/types.js` | Phát triển/debug, code dễ đọc (3 file vì có 3 file`.ts` nguồn)              |
| `npm run build:min`       | `dist/index.js` (1 file, đã gộp + minify)                   | Dùng để chạy thật / publish                                                      |
| `npm run build:obfuscate` | `dist/index.js` (đã obfuscate)                               | Muốn code khó đọc hơn khi chia sẻ (không phải mã hóa, chỉ gây khó đọc) |

Build tối thiểu 1 lần trước khi cấu hình opencode ở bước tiếp theo.

## 3. Cấu hình trong opencode

Có 2 cách trỏ tới MCP server, chọn 1 trong 2. Server này không cần biến môi trường nào
(API của cafef.vn là công khai, không cần API key).

### Cách 1 — Trỏ trực tiếp đến file (đơn giản, không cần publish)

```json
"cafef-financial": {
  "type": "local",
  "command": [
    "node",
    "/duong-dan-tuyet-doi/cafef-financial-mcp/dist/index.js"
  ],
  "enabled": true
}
```

Thay `/duong-dan-tuyet-doi/...` bằng đường dẫn thật trên máy đang chạy opencode.

### Cách 2 — Dùng qua npm package (cần publish trước)

Nếu package đã được publish lên npm registry:

```json
"cafef-financial": {
  "type": "local",
  "command": [
    "npx",
    "-y",
    "@lmdat/cafef-financial-mcp@latest"
  ],
  "timeout": 15000,
  "enabled": true
}
```

> Lưu ý: `npx -y` có độ trễ khởi động (vài giây, do phải resolve package qua registry
> trước khi chạy) — có thể gây race condition với bước opencode hỏi `tools/list` lúc tạo
> session mới. Nếu gặp tình trạng tool không load được, ưu tiên Cách 1, hoặc cài global
> (`npm install -g @lmdat/cafef-financial-mcp`) rồi gọi trực tiếp tên lệnh
> (`"command": ["cafef-financial-mcp"]`) để loại bỏ độ trễ này.

## 4. Danh sách tool

| Tool                     | Mô tả                          |
| ------------------------ | -------------------------------- |
| `get_balance_sheet`    | Bảng cân đối kế toán       |
| `get_income_statement` | Báo cáo kết quả kinh doanh   |
| `get_cash_flow`        | Báo cáo lưu chuyển tiền tệ |

**Tham số chung cho cả 3 tool:**

| Tham số     | Bắt buộc | Default | Ghi chú                                                        |
| ------------ | ---------- | ------- | --------------------------------------------------------------- |
| `ticker`   | Có        | —      | Mã cổ phiếu, ví dụ`FPT`, `VNM`, `HPG` (1-10 ký tự) |
| `typeTime` | Không     | `QUY` | `QUY` = theo quý, `NAM` = theo năm                        |
| `pageSize` | Không     | `4`   | Số kỳ gần nhất cần lấy (1-20)                             |

## 5. Ví dụ câu lệnh trong opencode

```
Lấy bảng cân đối kế toán của FPT 4 quý gần nhất
Lấy báo cáo kết quả kinh doanh VNM theo năm, 5 năm gần nhất
So sánh lưu chuyển tiền từ hoạt động kinh doanh của HPG và FPT
```

## 6. Cấu trúc dữ liệu trả về

Mỗi tool trả về 1 object `NormalizedReport` (xem `src/types.ts`) gồm:

- `periods`: danh sách kỳ, đã sắp xếp tăng dần theo thời gian
- `items`: toàn bộ chỉ tiêu đọc được, mỗi item có `code`, `name`, `values` (mảng theo kỳ)
- `keyMetrics`: các chỉ tiêu quan trọng đã trích sẵn theo tên dễ đọc (ví dụ `tong_tai_san`,
  `doanh_thu_thuan`, `luu_chuyen_tu_hdkd`...)
- `missingPeriods`: danh sách kỳ bị phát hiện thiếu dữ liệu (toàn 0 bất thường) — giá trị ở
  các kỳ này được trả về `null`, không dùng số 0 thật để tính toán

## 7. Lưu ý quan trọng

- Mã chỉ tiêu (`code`) của Cash Flow có tiền tố theo nhóm (`HDKD_xx`, `HDDT_xx`, `HDTC_xx`),
  khác với Balance Sheet/Income Statement (code số thuần như `270`, `10`).
- Dữ liệu lấy từ API công khai cafef.vn — là dữ liệu tổng hợp bởi bên thứ ba, nên đối chiếu
  lại với BCTC gốc nếu cần độ chính xác cao (ví dụ dùng cho quyết định đầu tư thật).

## 8. (Tùy chọn) Publish lên npm để dùng theo Cách 2

```bash
npm login                       # nếu chưa đăng nhập npm
npm run build:min
npm publish                     # đã có publishConfig.access=public trong package.json
```

Kiểm tra trước khi publish thật:

```bash
npm run build:min && npm pack --dry-run
```

## 9. Phát triển thêm

```bash
npm run dev   # tsc --watch, tự build lại khi sửa code trong src/
```
