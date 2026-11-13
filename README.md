# AI Agent Xử Lý Cơ Hội Bán Hàng B2B — Công Ty Minh An (AI301 Đề 01)

Giải pháp hoàn chỉnh cho **Task 1** (Phân tích quy trình & Thiết kế kiến trúc AI Agent) và **Task 2** (Ứng dụng Web AI Agent chạy trực tiếp, hỗ trợ nạp Google Sheet / CSV / XLSX, phối hợp 4 kỹ năng nghiệp vụ, lưu Audit Log và tự kiểm thử).

## Cấu trúc thư mục
- `docs/TASK1_PHAN_TICH_THIET_KE.md` — Tài liệu phân tích hiện trạng, quy trình đề xuất, các bước AI thực hiện, điểm kiểm soát con người và bản thiết kế hệ thống.
- `app/` — Giao diện Web & AI Agent (`index.html`, `styles.css`, `js/dataLoader.js`, `js/agentTools.js`, `js/agentSkills.js`, `js/main.js`).
- `data/` — Bộ dữ liệu mẫu chuẩn (`sample_minh_an_data.json` và `data/csv/*.csv` gồm 12 ca: thông thường, thiếu dữ liệu, ranh giới quy tắc).
- `server.rb` — Máy chủ cục bộ (không cần cài thêm thư viện ngoài trên macOS), hỗ trợ proxy tải Google Sheets và lưu Audit Log vào `logs/`.
- `tests/run_tests.rb` — Script kiểm tra tính toàn vẹn dữ liệu và cấu trúc.

## Cách chạy ứng dụng
1. Mở Terminal tại thư mục dự án và chạy:
   ```bash
   ruby --disable-gems server.rb
   ```
2. Mở trình duyệt tại: **http://127.0.0.1:8080**
3. Trên giao diện:
   - Chọn **"Nạp dữ liệu mẫu Minh An (12 cơ hội)"**, hoặc dán **Link Google Sheet** công khai, hoặc upload **file `.xlsx` / `.csv`**.
   - Nhấn **"Chạy AI Agent (4 Kỹ năng)"** để xem kết quả phân tích, đề xuất kinh doanh, hồ sơ cơ hội, bản nháp phản hồi, phiếu chuyển duyệt và nhật ký truy vết (Audit Log).
   - Nhấn **"Chạy Self-Test (Task 2)"** để chạy kiểm thử tự động 12 ca chuẩn.

