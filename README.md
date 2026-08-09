# 📸 Photobooth Kiosk System

Hệ thống phần mềm Photobooth thương mại hiện đại, được xây dựng theo mô hình tách biệt (Decoupled Architecture) giữa Frontend (React) và Backend (FastAPI/Python), hỗ trợ giao tiếp thời gian thực qua WebSocket và quản trị trực tuyến qua Admin Panel.

---

## 🌟 Tính năng chính

* **Màn hình chờ (Attract Mode):** Giao diện thu hút khách hàng với hiệu ứng chạm để bắt đầu.
* **Chọn khung động (Template Selection):** Cho phép người dùng chọn các mẫu khung (templates) được tải lên trực tiếp từ trang quản trị.
* **Trải nghiệm chụp ảnh trực quan (Live View Overlay):** 
  * Hiển thị luồng camera thời gian thực (lật gương tự nhiên).
  * Đè lớp khung ảnh PNG trong suốt lên trên màn hình camera giúp khách hàng dễ dàng căn chỉnh góc chụp.
  * Đếm ngược thời gian linh hoạt (có thể tùy chỉnh qua Admin).
  * Hiệu ứng chớp màn hình (Flash effect) và tự động chụp liên tiếp.
* **Màn hình xem lại & Tải ảnh qua QR (Review & QR):** 
  * Tự động ghép các ảnh gốc vào khung PNG đã chọn thành tấm ảnh hoàn chỉnh (Strip).
  * Tạo mã QR tức thì để khách hàng quét và tải ảnh về điện thoại.
  * Cấu hình thời gian chờ tự động quay về màn hình chính.
* **Trang Quản trị (Admin Panel - `/admin`):**
  * Tùy chỉnh thời gian đếm ngược chụp ảnh và thời gian chờ quét QR.
  * Tải lên khung ảnh mới (định dạng PNG đục lỗ tỷ lệ chuẩn).

---

## 🏗️ Kiến trúc hệ thống

```text
photobooth-app/
├── backend/               # FastAPI Backend (Xử lý API, WebSocket, Ghép ảnh Pillow)
│   ├── app/               # Mã nguồn chính của Backend
│   ├── photobooth_data/   # Thư mục lưu trữ cấu hình, khung ảnh và phiên chụp
│   ├── requirements.txt   # Danh sách thư viện Python
│   └── run.py             # File khởi động Server Python
└── src/                   # React Frontend (Giao diện Kiosk & Admin)
    ├── pages/             # Các màn hình (Home, TemplateSelect, Capture, Review, Admin)
    ├── App.js             # Bộ điều hướng (Router)
    └── App.css            # Tấm phủ giao diện toàn cục
```

---

## ⚙️ Hướng dẫn cài đặt và chạy dự án

### Yêu cầu hệ thống trước khi bắt đầu:
* [Node.js](https://nodejs.org/) (Phiên bản LTS khuyến nghị)
* [Python](https://www.python.org/) (Phiên bản 3.10 trở lên)

---

### Bước 1: Clone dự án về máy
```bash
git clone https://github.com/jimdabest/photobooth-app.git
```
```bash
cd photobooth-app
```

---

### Bước 2: Cài đặt và Khởi động Backend (Python)

1. Di chuyển vào thư mục backend:
   ```bash
   cd backend
   ```

2. Tạo và kích hoạt môi trường ảo (`venv`):
   * Trên Windows (CMD):
     ```bash
     python -m venv venv
     venv\Scripts\activate
     ```
   * Trên Windows (PowerShell):
     ```powershell
     python -m venv venv
     .\venv\Scripts\Activate.ps1
     ```

3. Cài đặt các thư viện phụ thuộc:
   ```bash
   pip install -r requirements.txt
   ```

4. Khởi động Backend Server:
   ```bash
   python run.py
   ```
   *Server sẽ chạy tại địa chỉ:* `http://127.0.0.1:8000`

---

### Bước 3: Cài đặt và Khởi động Frontend (React)

1. Mở một cửa sổ Terminal mới, quay về thư mục gốc của dự án và cài đặt các gói thư viện Node.js:
   ```bash
   npm install
   ```

2. Khởi động giao diện Kiosk:
   ```bash
   npm start
   ```
   *Ứng dụng sẽ tự động mở trình duyệt tại:* `http://localhost:3000`

---

## 🚀 Hướng dẫn sử dụng nhanh

1. **Trải nghiệm Kiosk (Khách hàng):** 
   Truy cập `http://localhost:3000/#/` để trải nghiệm luồng chọn khung, đếm ngược chụp ảnh, và quét mã QR nhận ảnh.
2. **Trang Quản Trị (Admin):** 
   Truy cập `http://localhost:3000/#/admin` để thay đổi thời gian đếm ngược hoặc tải lên các mẫu khung ảnh PNG mới vào hệ thống.