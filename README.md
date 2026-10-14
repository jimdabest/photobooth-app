# Photobooth Kiosk

[![Test](https://github.com/jimdabest/photobooth-app/actions/workflows/test.yml/badge.svg)](https://github.com/jimdabest/photobooth-app/actions/workflows/test.yml)

Photobooth Kiosk là ứng dụng chụp ảnh kiosk cho Windows. Giao diện React chạy trong trình duyệt hoặc Electron; FastAPI điều khiển Canon DSLR hoặc camera giả lập, ghép ảnh, gửi job sang DNP Hot Folder Print và đưa ảnh lên Cloudflare R2 để khách tải qua QR.

## Kiến trúc

```text
Kiosk / Electron (React)
  Home -> Chọn khung -> Capture -> Review -> Print / QR
          | REST /api/*
          v
FastAPI backend
  camera_provider -> Canon EDSDK | Mock/Webcam
  image_service   -> Pillow compose -> final image
  print service   -> DNP HFP Hot Folder
  upload service  -> Cloudflare R2 -> public photo page
          |
          +--> ptb_data (settings, templates, sessions, final images, queue)

Điện thoại khách -> QR -> Cloudflare Pages /#/photo/<session_id> -> R2
```

Ba lớp chính:

- Frontend: các trang kiosk, trang Admin và trang download công khai.
- Backend: REST API, camera abstraction, ghép ảnh, print queue và offline queue.
- Services bên ngoài: Canon EDSDK, DNP HFP 3.x, Cloudflare R2 và Cloudflare Pages Function `functions/api/download.js`.

## Tính năng

- [x] Chọn và quản lý template ảnh từ Admin.
- [x] Live View với crop guide theo slot của khung.
- [x] Canon DSLR ở production; Mock hoặc Webcam khi test.
- [x] Countdown, nhiều pose, review, retake một lần và timeout tự động.
- [x] Auto-print, giới hạn bản in và định tuyến job theo `print_format/printer_model`.
- [x] DNP HFP 3.x Hot Folder, ảnh job 4x6 ở 300 DPI.
- [x] Upload ảnh final và từng pose lên Cloudflare R2.
- [x] QR dẫn tới trang khách tải ảnh; trang tải dùng Cloudflare Pages Function.
- [x] Offline Queue và đồng bộ lại R2 khi upload gặp lỗi.
- [x] Rate limit `POST /api/capture` để bảo vệ camera khỏi request lặp.

## Yêu cầu

- Windows 10 hoặc 11 64-bit cho Canon EDSDK và DNP HFP.
- Python 3.10 trở lên.
- Node.js 18 trở lên.
- Canon EDSDK x64 và Canon DSLR khi chạy production.
- DNP Hot Folder Print 3.x cùng máy in DNP nếu dùng in tự động.

## Cài đặt

### 1. Clone và cài Canon EDSDK

```powershell
git clone https://github.com/jimdabest/photobooth-app.git
cd photobooth-app
```

Copy `EDSDK.dll` và các DLL Canon đi kèm từ bộ Canon EDSDK x64 vào `backend/`. Không cần các DLL này khi chạy `run_test.py`.

### 2. Cài backend

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Sửa `backend/.env` để điền R2 và URL public. `PUBLIC_URL` phải là URL Cloudflare Pages không có `#` và không có dấu `/` cuối, ví dụ `https://simplex-photobooth.pages.dev`.

Chạy production với Canon:

```powershell
python run.py
```

Chạy thử không cần Canon:

```powershell
python run_test.py
# Hoặc dùng webcam USB:
python run_test.py --webcam
```

Chỉ chạy một backend trên cổng 8000 tại một thời điểm.

### 3. Cài frontend

Mở PowerShell khác tại thư mục gốc dự án:

```powershell
Copy-Item .env.example .env
npm install
npm start
```

Kiosk chạy tại `http://localhost:3000/#/`; Admin ở `http://localhost:3000/#/admin`.

## Cấu hình HFP và máy in DNP

Đặt Hot Folder Directory của HFP là thư mục `Prints`, ví dụ `C:\DNP\HotFolderPrint\Prints`. Backend tạo job tại:

```text
<Hot Folder>/<print_format>/<printer_model>/<session>_<timestamp>_<copy>.jpg
```

Ví dụ với RX1HS 4x6: `C:\DNP\HotFolderPrint\Prints\s4x6\RX1HS`.

Xem hướng dẫn vận hành và kiểm tra HFP đầy đủ tại [backend/HFP_WORKFLOW.md](backend/HFP_WORKFLOW.md).

## Cloudflare R2 và QR

1. Tạo R2 bucket, ví dụ `photobooth-prints`.
2. Tạo R2 API token có quyền đọc/ghi bucket và điền `R2_ACCOUNT_ID`, `R2_ACCESS_KEY`, `R2_SECRET_KEY` vào `backend/.env`.
3. Bật public access hoặc custom domain cho bucket, điền URL vào `R2_PUBLIC_URL`.
4. Đặt cùng URL này vào `REACT_APP_R2_PUBLIC_URL` ở file `.env` gốc.
5. Đặt `R2_ENABLED=true`, giữ `offline_mode=false` trong Admin để QR hiển thị và phiên chụp mới được upload.

R2 lưu theo cấu trúc `photo/<session_id>/`, gồm ảnh final, các pose và `metadata.json`. Nếu upload lỗi, ảnh web đã nén được ghi vào `ptb_data/offline_queue`. Đồng bộ lại sau khi có mạng:

```powershell
cd backend
python sync_offline_queue.py --dry-run
python sync_offline_queue.py
```

## Cloudflare Pages

Cloudflare Pages host frontend và tự đóng gói route trong thư mục gốc `functions/`. Không upload Function vào R2.

```powershell
npm run build
$env:CLOUDFLARE_API_TOKEN = "<Cloudflare API token có quyền Pages Edit>"
npm run deploy:pages
```

Lệnh deploy tạo production deployment cho project `simplex-photobooth`, đồng thời đưa `functions/api/download.js` lên route `/api/download`.

## Kiểm thử

Backend dùng camera Mock trong test:

```powershell
cd backend
python -m unittest discover -s tests -v
```

Frontend:

```powershell
npm test -- --watchAll=false
```

## Troubleshooting

| Hiện tượng | Kiểm tra và cách xử lý |
| --- | --- |
| Không thấy camera Canon | Kiểm tra USB, pin, tắt ứng dụng Canon khác, copy đúng DLL x64 rồi chạy lại `python run.py`. |
| Cổng 8000 đang dùng | Dừng backend cũ hoặc dùng `python run_test.py --port 8010`; frontend mặc định gọi cổng 8000. |
| R2 trả 401 hoặc QR không tải được | Kiểm tra R2 API token, account ID, public URL, CORS bucket và `R2_ENABLED=true`. |
| Không in tự động | Kiểm tra HFP đang `Ready`, Hot Folder Directory là `Prints`, và đúng thư mục con `s4x6/RX1HS` hoặc format/model đang chọn. |
| Ảnh chờ upload | Chạy `python sync_offline_queue.py` sau khi kết nối mạng được khôi phục. |

## License

Phát hành theo [MIT License](LICENSE).
