# TASK 1: PHÂN TÍCH QUY TRÌNH & THIẾT KẾ AI AGENT
**Dự án:** AI301 — Đề 01: Xử lý cơ hội bán hàng B2B (Công ty Minh An)

---

## 1. Phân tích quy trình hiện tại (As-Is) & Các vấn đề tồn đọng

### 1.1. Luồng quy trình hiện tại
1. **Tiếp nhận yêu cầu:** 6 Nhân viên Kinh doanh (NVKD) tiếp nhận ~180 yêu cầu/tuần từ email và biểu mẫu web (trung bình ~30 yêu cầu/người/tuần).
2. **Đọc & bóc tách thủ công:** NVKD tự đọc văn bản yêu cầu để tìm tên sản phẩm, số lượng, ngân sách, thời hạn triển khai và đề nghị chiết khấu; tự nhắn/gọi hỏi lại khách hàng nếu thấy thiếu.
3. **Tra cứu & xác nhận chéo:** NVKD tự mở file bảng giá để tra giá, gửi email/tin nhắn cho bộ phận Vận hành để hỏi tồn kho khả dụng và thời gian triển khai.
4. **Lập đề xuất & trình duyệt:** NVKD tự tính tổng tiền, tự áp chiết khấu; nếu vượt quyền thì chuyển tiếp email cho Trưởng phòng Kinh doanh duyệt.
5. **Bàn giao quản lý:** Tổng hợp thủ công báo cáo cho Trưởng phòng Kinh doanh / Ban Giám đốc.

### 1.2. Các vấn đề cốt lõi và ảnh hưởng cụ thể

| STT | Vấn đề trong quy trình hiện tại | Ảnh hưởng cụ thể đến vận hành & doanh thu |
|---|---|---|
| **1** | **Bóc tách yêu cầu thủ công từ văn bản phi cấu trúc (~180 yêu cầu/tuần)** | Dễ bỏ sót hạng mục sản phẩm hoặc nhầm số lượng khi yêu cầu có nhiều dòng thiết bị/dịch vụ; tốc độ phản hồi khách hàng chậm (mất 1–3 ngày), làm giảm tỷ lệ chốt đơn. |
| **2** | **Tra cứu bảng giá rời rạc và xác nhận tồn kho/thời hạn thủ công với Vận hành** | NVKD dễ dùng **bảng giá cũ** dẫn đến sai lệch biên lợi nhuận; hứa **thời hạn triển khai không đáp ứng được** (do không đối chiếu lead-time thực tế và tồn khả dụng), gây mất uy tín và phạt hợp đồng. |
| **3** | **Thiếu cơ chế kiểm soát thông tin thiếu và người phê duyệt** | Các yêu cầu thiếu ngân sách, thiếu số lượng hoặc chưa rõ người phê duyệt nội bộ bị **chuyển qua lại giữa các bộ phận mà không có người theo dõi (ownership)**, dẫn đến rơi rớt cơ hội. |
| **4** | **Kiểm soát chiết khấu vượt quyền và báo cáo tổng hợp thiếu nhất quán** | Nguy cơ NVKD tự ý xác nhận mức chiết khấu vượt thẩm quyền hoặc tính sai giá trị cơ hội đủ điều kiện vào pipeline báo cáo Ban Giám đốc. |

---

## 2. Quy trình đề xuất (To-Be) & Phân công trách nhiệm

| Bước | Tên bước | Đầu vào | Công việc thực hiện | Đầu ra | Người / Bộ phận chịu trách nhiệm |
|---|---|---|---|---|---|
| **1** | **Tiếp nhận & chuẩn hóa dữ liệu** | Email / biểu mẫu yêu cầu, Danh mục giá, Tồn kho, Lead-time, Chính sách chiết khấu | Nạp dữ liệu từ Google Sheet / CSV / XLSX; kiểm tra định dạng bảng dữ liệu nguồn | Bộ dữ liệu đầu vào đã chuẩn hóa | **AI Agent** (tự động) + NVKD (nạp nguồn) |
| **2** | **Bóc tách yêu cầu & phát hiện thiếu sót** | Yêu cầu khách hàng dạng văn bản | Trích xuất hạng mục, số lượng, ngân sách, thời hạn, chiết khấu đề nghị, người phê duyệt; liệt kê thông tin còn thiếu | Hồ sơ yêu cầu có cấu trúc + Danh sách điểm thiếu | **AI Agent** (Skill 1) |
| **3** | **Đối chiếu Danh mục, Tồn kho & Thời hạn** | Yêu cầu có cấu trúc + Bảng Sản phẩm/Tồn kho/Lead-time | Khớp mã SP, lấy giá niêm yết mới nhất, kiểm tra tồn khả dụng và tổng thời gian triển khai so với deadline | Kết quả đối chiếu kỹ thuật & giá niêm yết | **AI Agent** (Skill 2) + Bộ phận Vận hành (cập nhật tồn kho nguồn) |
| **4** | **Tính giá đề xuất & Kiểm tra chính sách** | Kết quả đối chiếu + Chính sách chiết khấu & chuyển duyệt | Tính thành tiền, kiểm tra ngân sách, đối chiếu ngưỡng chiết khấu NVKD vs Trưởng phòng, phân loại 4 trạng thái | Bảng tính giá + Trạng thái cơ hội + Căn cứ quy tắc | **AI Agent** (Skill 3) |
| **5** | **Tạo hồ sơ, Bản nháp phản hồi & Phiếu duyệt** | Toàn bộ kết quả phân tích & phân loại | Sinh hồ sơ cơ hội chi tiết, bản nháp email phản hồi khách hàng (theo từng trạng thái), phiếu chuyển duyệt nếu vượt quyền | Hồ sơ cơ hội + Draft Email + Phiếu chuyển duyệt + Báo cáo tổng hợp | **AI Agent** (Skill 4) |
| **6** | **Rà soát & Phê duyệt ngoại lệ (Human-in-the-Loop)** | Hồ sơ `Cần bổ sung`, `Chưa đáp ứng`, `Chờ duyệt` | NVKD liên hệ khách bổ sung thông tin; Trưởng phòng KD duyệt hoặc từ chối chiết khấu vượt quyền / ngoại lệ | Quyết định duyệt chính thức & Email gửi khách hàng | **NVKD** & **Trưởng phòng Kinh doanh** |

---

## 3. Các bước AI Agent tự thực hiện & Lý do lựa chọn

1. **Bước 2 — Bóc tách yêu cầu & phát hiện thông tin thiếu (Skill 1):**
   - *Lý do:* Yêu cầu B2B gửi qua email/form có cấu trúc tự do, số lượng lớn (~180 yêu cầu/tuần). AI Agent xử lý ngôn ngữ tự nhiên nhanh, nhất quán, không bỏ sót hạng mục và tự động gắn cờ các trường bắt buộc bị thiếu.
2. **Bước 3 — Đối chiếu bảng giá, tồn kho & thời gian triển khai (Skill 2):**
   - *Lý do:* Đây là thao tác tra cứu & so sánh dữ liệu chính xác theo quy tắc (deterministic lookup). Giao cho AI Agent gọi công cụ trực tiếp vào dữ liệu hiện hành giúp loại bỏ 100% lỗi dùng giá cũ hoặc hứa sai thời hạn.
3. **Bước 4 & 5 — Tính giá theo chính sách, phân loại trạng thái & sinh bản nháp (Skill 3 & 4):**
   - *Lý do:* Tính toán chiết khấu, so sánh ngưỡng ngân sách/quyền hạn và soạn thảo văn bản mẫu theo template chuẩn có thể tự động hóa hoàn toàn, kèm nhật ký truy vết (audit log) rõ ràng từng quy tắc áp dụng.

---

## 4. Điểm kiểm soát của con người (Human-in-the-Loop), Điều kiện chuyển xử lý & Cách phát hiện sai sót

### 4.1. Hai điểm con người bắt buộc kiểm tra / quyết định
1. **Điểm kiểm soát 1 — Rà soát cơ hội `Cần bổ sung thông tin` / `Chưa đáp ứng` (NVKD):**
   - *Hành động:* NVKD kiểm tra lại bản nháp email hỏi thêm thông tin khách hàng hoặc đề xuất phương án thay thế (chia đợt giao hàng, đổi mã tương đương) trước khi gửi.
2. **Điểm kiểm soát 2 — Phê duyệt cơ hội vượt quyền `Chờ duyệt` (Trưởng phòng Kinh doanh / Ban Giám đốc):**
   - *Hành động:* Xem xét Phiếu chuyển duyệt đối với các cơ hội có đề nghị chiết khấu vượt ngưỡng quyền của NVKD hoặc giá trị đơn hàng lớn cần ngoại lệ thương mại. **AI tuyệt đối không tự xác nhận bán hàng.**

### 4.2. Điều kiện chuyển xử lý (Escalation Triggers)
- Đề nghị chiết khấu `>` mức tối đa của NVKD (ví dụ `> 10%`) $\rightarrow$ chuyển **Trưởng phòng Kinh doanh**.
- Đề nghị chiết khấu `>` mức tối đa của Trưởng phòng (ví dụ `> 20%`) $\rightarrow$ chuyển **Ban Giám đốc**.
- Thiếu ngân sách, thiếu thời hạn, thiếu số lượng hoặc chưa rõ người phê duyệt $\rightarrow$ gắn trạng thái `Cần bổ sung thông tin`, gán đích danh NVKD phụ trách theo dõi.
- Không đủ tồn khả dụng hoặc lead-time `>` thời hạn yêu cầu $\rightarrow$ gắn `Chưa đáp ứng`, cảnh báo Vận hành & NVKD.

### 4.3. Cách phát hiện kết quả sai của AI Agent
- **Đối chiếu Audit Log (Nhật ký truy vết):** Kiểm tra từng tool call xem Agent có đọc đúng dòng sản phẩm, đúng đơn giá hiện hành và áp dụng đúng ngưỡng chiết khấu trong bảng `policies` hay không.
- **Kiểm tra chéo số học (Invariant Check):** Tổng giá trị đủ điều kiện báo cáo phải bằng chính xác `Tổng(Có thể tiếp tục) + Tổng(Chờ duyệt)`; không được cộng `Cần bổ sung` hoặc `Chưa đáp ứng`.
- **Kiểm tra biên dữ liệu (Boundary Sanity Check):** Rà soát các cơ hội nằm sát ngưỡng (ví dụ chiết khấu đúng bằng `10%` vs `10.1%`, tồn kho bằng đúng số lượng đặt) và các sản phẩm AI báo "không khớp mã" để tránh lỗi chính tả tên sản phẩm.

---

## 5. Bản thiết kế hệ thống (Mục tiêu – Đầu vào – Quy trình – Đầu ra)

- **Mục tiêu:** Tự động hóa xử lý ~180 yêu cầu B2B/tuần từ văn bản thô thành Hồ sơ cơ hội chuẩn hóa, bản nháp phản hồi khách hàng, phiếu chuyển duyệt và bảng tổng hợp giá trị cơ hội chính xác, có nhật ký truy vết 100%, không tự chốt đơn vượt quyền.
- **Đầu vào:** Hỗ trợ nạp qua **Link Google Sheet** hoặc **File CSV / XLSX** gồm 3–5 bảng:
  1. `requests`: Yêu cầu khách hàng (Mã YC, Khách hàng, NVKD phụ trách, Nội dung yêu cầu văn bản / các trường thông tin).
  2. `products`: Danh mục sản phẩm (Mã SP, Tên SP, Đơn giá hiện hành, Tồn khả dụng, Thời gian triển khai/ngày).
  3. `policies`: Chính sách chiết khấu & chuyển duyệt (Ngưỡng chiết khấu NVKD, Ngưỡng Trưởng phòng, Ngưỡng Ban Giám đốc, Quy tắc ngân sách/thời hạn).
- **Quy trình (Kiến trúc Multi-Skill Tool-Calling Agent):**
  - **Orchestrator (Bộ điều phối Agent):** Chạy lần lượt 4 kỹ năng nghiệp vụ qua cơ chế gọi công cụ (`Tool Calling`), hỗ trợ cả **LLM Function Calling (Gemini / OpenAI)** lẫn **Deterministic Rule Engine** (chạy offline không cần API key).
  - **Audit Logger:** Ghi lại toàn bộ Input $\rightarrow$ Tool Call $\rightarrow$ Rule Applied $\rightarrow$ Output cho từng cơ hội.
- **Đầu ra (Hiển thị trực tiếp trên giao diện Web & xuất file):**
  1. Bảng tổng hợp số lượng theo 4 nhóm: `Có thể tiếp tục`, `Cần bổ sung thông tin`, `Chưa đáp ứng`, `Chờ duyệt`.
  2. Tổng giá trị riêng cho nhóm đủ điều kiện (`Có thể tiếp tục` + `Chờ duyệt`).
  3. Hồ sơ chi tiết từng cơ hội (kết quả đối chiếu từng dòng SP, căn cứ, thông tin thiếu, bước tiếp theo).
  4. Bản nháp phản hồi khách hàng & Phiếu chuyển duyệt (khi cần).
  5. Nhật ký truy vết (Audit Log) đầy đủ.

