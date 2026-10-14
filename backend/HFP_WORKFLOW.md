# Vận hành HFP và offline

Chạy backend chính bằng `python run.py` trong thư mục `backend`.
Không có máy ảnh: chạy `python run_test.py` thay cho `run.py`. Script tự dùng `backend/venv` nếu môi trường này có sẵn; đây là môi trường chứa boto3 để đồng bộ R2.
Server test dùng cùng router/service và cấu hình thật, chỉ thay camera bằng ảnh giả lập có chuyển động.
Không cần Canon DLL, webcam hay OpenCV. Nếu muốn dùng webcam, chạy `python run_test.py --webcam`;
không mở được webcam sẽ tự tạo ảnh giả lập. Không chạy hai server cùng cổng 8000.
Mở frontend như bình thường bằng `npm.cmd start` ở thư mục dự án hoặc Electron.
Ảnh giả lập chỉ dùng cho camera khi kiểm tra. Để mô phỏng HFP trong môi trường phát triển, chạy `python mock_hfp.py`; script này không được chạy cùng DNP HFP vì nó sẽ chuyển file in sang `ptb_data/mock_printed`.

- Admin lưu cấu hình tại `ptb_data/config/settings.json`. Các thay đổi riêng lẻ giữ nguyên các khóa khác.
- Hot Folder là `ptb_data/hot_folder`; model mặc định là `RX1HS`. Với DNP HFP 3.x, đặt Hot Folder là thư mục `Prints`; mỗi lệnh in được gửi vào `<Hot Folder>/<print_format>/<printer_model>`, ví dụ `Prints/s4x6/RX1HS`. Format `s6x2_2` nhận từng file 2x6 độc lập ở kích thước 600x1800 px, HFP sẽ ghép hai job lên một tờ 4x6 rồi cắt; không đưa file 1200x1800 vào queue này.
- Khi bật Review, khách có một lần chụp lại. Auto-Print ẩn bộ chọn số lượng và nút in; gửi một bản khi khách tiếp tục hoặc hết thời gian Review. Khi tắt Review, Capture gửi lệnh Auto-Print trực tiếp.
- Khi Auto-Print tắt, khách bấm In ảnh ở Review để in 1–4 bản. Tiếp tục không in vẫn cho phép nhận QR. Màn kết thúc chỉ báo đang in khi API đã nhận lệnh.
- Phiên mới có mã `YYMMDD-HHMMSS`. File Hot Folder dùng `<session_id>.jpg`; các bản in thêm dùng `<session_id>_2.jpg`, `<session_id>_3.jpg`.
- Màn Kiosk `/download` quay về trang chủ sau 15 giây. QR trỏ tới `/#/photo/<session_id>`, nơi khách xem và tải ảnh final cùng từng pose trên điện thoại.
- Offline vẫn tạo QR nhưng không gọi R2. Ảnh final đã nén nằm tại `ptb_data/offline_queue/<session_id>.jpg`; pose nằm tại `ptb_data/offline_queue/<session_id>_pose_<index>.jpg`.
- R2 dùng cấu trúc `photo/<session_id>/<session_id>.jpg`, `photo/<session_id>/pose_<index>.jpg` và `photo/<session_id>/metadata.json`.
- `PUBLIC_URL` ở backend phải là URL website public, không có `#` hoặc dấu `/` ở cuối; ví dụ `https://simplex-photobooth.pages.dev`. `REACT_APP_R2_PUBLIC_URL` ở frontend phải trùng với `R2_PUBLIC_URL` ở backend. Bucket R2 phải cho phép trình duyệt đọc các object từ domain website để trang QR tải được `metadata.json` và ảnh.
- Script đồng bộ có sẵn: `python sync_offline_queue.py --dry-run` để xem queue, `python sync_offline_queue.py` để upload tất cả phiên pending/failed, hoặc `python sync_offline_queue.py --session <session_id>` để upload một phiên. Script không xóa ảnh cục bộ; chỉ dùng `--force` khi cần upload lại phiên đã hoàn tất.
- Bản chất lượng in trong `backend/prints/export` không bị nén lại. Chất lượng JPEG web mặc định 82, rộng tối đa 1920; dung lượng phụ thuộc nội dung ảnh.

Khi upload R2 đang bật nhưng gặp lỗi mạng hoặc lỗi dịch vụ, `finalize_session` ghi ảnh web đã nén và các pose vào `ptb_data/offline_queue` trước khi kết thúc. Chạy `python sync_offline_queue.py` khi kết nối đã ổn định để tải lại các phiên này lên R2. `BackgroundTasks` vẫn cần backend tiếp tục chạy cho đến khi tác vụ hoàn tất; cơ chế queue bảo vệ ảnh sau một lỗi upload, không thay thế nguồn điện ổn định.

Kiểm tra không cần camera hoặc máy in: `python -m unittest discover -s tests -v`.
