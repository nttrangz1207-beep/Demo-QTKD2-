# TASK 1: PHÂN TÍCH QUY TRÌNH & THIẾT KẾ AI AGENT — ĐỀ 09 (CÔNG TY BÌNH MINH)

## 1. Phân tích quy trình hiện tại (As-Is) & Các vấn đề tồn đọng
Công ty Bình Minh có 10 Nhân viên Kinh doanh (NVKD) theo dõi ~300 cơ hội B2B. Hằng tuần, Trưởng phòng Kinh doanh tổng hợp doanh số đã ghi nhận, giá trị cơ hội còn mở và mức hoàn thành mục tiêu để phân công hỗ trợ.

| STT | Vấn đề hiện tại | Ảnh hưởng cụ thể |
|---|---|---|
| **1** | **Dữ liệu phân tán ở nhiều tệp & cập nhật không cùng thời điểm** | Một cơ hội bị ghi nhận trùng ở nhiều file, gây đếm trùng giá trị pipeline khi tổng hợp báo cáo tuần. |
| **2** | **Trạng thái cơ hội không phản ánh thực tế (mất khách chưa đổi trạng thái, quá hạn không có hoạt động mới)** | Làm phình ảo giá trị cơ hội còn mở; Trưởng phòng phân công nguồn lực hỗ trợ nhầm vào các cơ hội đã chết/treo. |
| **3** | **Cộng gộp doanh số đã bán vào cơ hội mở & dùng tỷ lệ dự kiến tùy ý** | Gây tính trùng doanh thu, sai lệch mức hoàn thành mục tiêu và dự báo doanh số thiếu tin cậy. |
| **4** | **Xem mọi cơ hội giá trị lớn là ưu tiên dù thiếu thông tin xác nhận** | Lãng phí thời gian hỗ trợ vào các cơ hội chưa đủ điều kiện chốt, bỏ sót các cơ hội thực sự có khả năng thắng trong tuần tới. |

---

## 2. Quy trình đề xuất (To-Be — 7 Bước)

| Bước | Tên bước | Đầu vào | Công việc | Đầu ra | Chịu trách nhiệm |
|---|---|---|---|---|---|
| **1** | Tiếp nhận dữ liệu | 6 nguồn (Hồ sơ cơ hội, Lịch sử trạng thái, Hoạt động liên hệ, Đơn hàng thực tế, Nhân viên & Mục tiêu, Quy tắc) | Nạp dữ liệu từ Google Sheet / CSV / XLSX, chốt ngày đối chiếu thống nhất | Bộ dữ liệu thô chuẩn hóa | **AI Agent** |
| **2** | Kiểm tra & làm sạch | Bộ dữ liệu thô | Hợp nhất bản ghi trùng mã/tên, phát hiện thiếu trường bắt buộc & dữ kiện mâu thuẫn | Bảng dữ liệu sạch + Danh sách cảnh báo | **AI Agent + Người** |
| **3** | Xác định trạng thái | Dữ liệu sạch + Lịch sử + Hoạt động + Đơn hàng | Chốt trạng thái tại ngày đối chiếu (Mở, Won, Lost, Quá hạn, Mâu thuẫn) | Trạng thái chuẩn từng cơ hội | **AI Agent + Người** |
| **4** | Tính toán doanh số | Cơ hội chuẩn + Đơn hàng + Trọng số giai đoạn | Tách doanh số đã ghi nhận khỏi cơ hội mở; tính giá trị dự kiến theo trọng số quy tắc | Doanh số thực tế & Dự kiến ước tính | **AI Agent** |
| **5** | Đánh giá kết quả | Doanh số + Mục tiêu 10 NVKD | Tổng hợp KPI hoàn thành mục tiêu từng NVKD và cảnh báo bất thường | Báo cáo KPI NVKD + Cảnh báo | **AI Agent + Trưởng phòng** |
| **6** | Xác định ưu tiên | Cơ hội mở hợp lệ + Tiêu chí ưu tiên | Chấm điểm và lọc Top 5 cơ hội ưu tiên tuần tới (nêu rõ nếu < 5 cơ hội hợp lệ) | Danh sách Top 5 + Căn cứ + Việc cần làm | **AI Agent + Trưởng phòng** |
| **7** | Xuất báo cáo | Toàn bộ kết quả & Audit Log | Hiển thị 5 đầu ra chuẩn hóa trên giao diện và lưu nhật ký truy vết | Báo cáo tổng hợp + Audit Log | **AI Agent -> Trưởng phòng** |

---

## 3. Các bước AI Agent tự thực hiện & Điểm kiểm soát con người (HITL)
- **Các bước AI tự thực hiện:** Bước 1 (Tiếp nhận & chuẩn hóa 6 nguồn), Bước 4 (Tách doanh số đã bán & tính giá trị dự kiến theo trọng số cố định), Bước 7 (Tổng hợp báo cáo & xuất Audit Log) — giúp xử lý 300 cơ hội nhất quán tại cùng một ngày đối chiếu, loại bỏ lỗi tính tay và thiên vị tỷ lệ.
- **Điểm kiểm soát con người (HITL):**
  1. **Bước 2–3 (Xác minh dữ kiện mâu thuẫn / quá hạn):** Khi Agent gắn cờ cơ hội trùng lặp, có hoạt động "khách từ chối" nhưng trạng thái vẫn Mở, hoặc quá hạn chốt không có hoạt động mới -> NVKD & Trưởng phòng xác nhận đóng `Lost` hay gia hạn.
  2. **Bước 5–6 (Phê duyệt Top 5 & phân công hỗ trợ):** Trưởng phòng rà soát căn cứ chấm điểm của AI, quyết định phân công hỗ trợ cho tuần tiếp theo.
- **Cách phát hiện kết quả sai:** Đối chiếu Audit Log từng bước, kiểm tra bất biến `Tổng(Won từ orders)` không nằm trong `Giá trị cơ hội mở`, kiểm tra Top 5 không chứa cơ hội thiếu thông tin xác nhận hoặc đang `Lost`/`Conflict`.

---

## 4. Bản thiết kế hệ thống (Mục tiêu – Đầu vào – Quy trình – Đầu ra)
- **Mục tiêu:** Chuẩn hóa báo cáo tuần cho Công ty Bình Minh theo một ngày đối chiếu thống nhất, tách bạch doanh số đã ghi nhận và giá trị dự kiến ước tính theo trọng số, đề xuất đúng Top 5 cơ hội ưu tiên.
- **Đầu vào:** Link Google Sheet hoặc CSV/XLSX gồm 6 nguồn dữ liệu + Ngày đối chiếu.
- **Quy trình:** Kiến trúc Multi-Skill Tool-Calling Agent (4 kỹ năng phối hợp chạy qua 7 bước: Làm sạch & Hợp nhất -> Chốt trạng thái tại ngày báo cáo -> Tính doanh số & KPI NVKD -> Xếp hạng Top 5 & Xuất báo cáo + Audit Log).
- **Đầu ra:** (1) Bảng dữ liệu sạch, (2) Báo cáo KPI 10 nhân viên, (3) Cảnh báo bất thường, (4) Top 5 cơ hội ưu tiên, (5) Báo cáo tổng hợp cho Trưởng phòng & Audit Log.

