import os
import json
import qrcode
from PIL import Image, ImageDraw, ImageOps
from app.config import BASE_SAVE_DIR

CONFIG_DIR = os.path.join(BASE_SAVE_DIR, "config")
TEMPLATES_FILE = os.path.join(CONFIG_DIR, "templates.json")
TEMPLATES_DIR = os.path.join(BASE_SAVE_DIR, "templates")

def process_and_save_strip(session_id, session_raw_photos, print_export_dir, session_dir, template_id="tpl_default"):
    # 1. Đọc cấu hình template
    tpl_config = None
    if os.path.exists(TEMPLATES_FILE):
        try:
            with open(TEMPLATES_FILE, "r", encoding="utf-8") as f:
                templates = json.load(f)
                tpl_config = next((t for t in templates if t["id"] == template_id), None)
                if not tpl_config and templates:
                    tpl_config = templates[0]
        except Exception as e:
            print(f"Lỗi đọc templates.json: {e}")

    # 2. Tìm file ảnh khung thực tế trên đĩa để lấy đúng kích thước thật
    actual_tpl_file = None
    for ext in ["png", "jpg", "jpeg"]:
        test_path = os.path.join(TEMPLATES_DIR, f"{template_id}.{ext}")
        if os.path.exists(test_path):
            actual_tpl_file = test_path
            break

    if actual_tpl_file:
        with Image.open(actual_tpl_file) as img_check:
            canvas_w, canvas_h = img_check.size
    elif tpl_config and "canvas_size" in tpl_config:
        canvas_w = tpl_config["canvas_size"]["width"]
        canvas_h = tpl_config["canvas_size"]["height"]
    else:
        canvas_w, canvas_h = 880, 2650

    print(f"[PRODUCTION IMAGE] Tạo Canvas chuẩn kích thước: {canvas_w}x{canvas_h}")

    # 3. Tạo nền Canvas
    strip_image = Image.new("RGBA", (canvas_w, canvas_h), color=(255, 255, 255, 255))

    # 4. Dán các ảnh chụp vào từng ô
    if tpl_config and "slots" in tpl_config:
        for i, photo_path in enumerate(session_raw_photos):
            if i < len(tpl_config["slots"]):
                slot = tpl_config["slots"][i]
                try:
                    if os.path.exists(photo_path):
                        img = Image.open(photo_path).convert("RGBA")
                        target_size = (slot["width"], slot["height"])
                        # Giữ nguyên tỷ lệ người chụp, crop giữa không méo
                        img_fitted = ImageOps.fit(img, target_size, method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
                        if slot.get("rotation", 0) != 0:
                            img_fitted = img_fitted.rotate(slot["rotation"], expand=True)
                        strip_image.paste(img_fitted, (slot["x"], slot["y"]))
                except Exception as e:
                    print(f"Lỗi dán slot {i}: {e}")

    # 5. Phủ khung viền PNG lên trên
    if actual_tpl_file:
        try:
            tpl_img = Image.open(actual_tpl_file).convert("RGBA")
            if tpl_img.size != (canvas_w, canvas_h):
                tpl_img = tpl_img.resize((canvas_w, canvas_h), Image.Resampling.LANCZOS)
            strip_image.paste(tpl_img, (0, 0), tpl_img)
        except Exception as e:
            print(f"Lỗi dán viền template: {e}")

    # 6. Đóng dấu mã QR tải ảnh
    qr_conf = tpl_config.get("qr_config", {}) if tpl_config else {}
    if qr_conf.get("print_on_photo", True):
        download_url = f"http://127.0.0.1:3000/download/{session_id}"
        qr = qrcode.QRCode(version=1, box_size=10, border=1)
        qr.add_data(download_url)
        qr.make(fit=True)
        qr_img = qr.make_image(fill_color="black", back_color="white").convert("RGBA")
        qr_size = qr_conf.get("size", 150)
        qr_img = qr_img.resize((qr_size, qr_size))
        qr_x = qr_conf.get("x", canvas_w - qr_size - 30)
        qr_y = qr_conf.get("y", canvas_h - qr_size - 30)
        strip_image.paste(qr_img, (qr_x, qr_y), qr_img)

    # 7. Xuất file in và file cloud
    cloud_save_path = os.path.join(session_dir, "final_photobooth_strip.jpg")
    print_save_path = os.path.join(print_export_dir, f"print_{session_id}.jpg")

    final_rgb = strip_image.convert("RGB")
    final_rgb.save(cloud_save_path, "JPEG", quality=95)
    final_rgb.save(print_save_path, "JPEG", quality=95)
    
    return cloud_save_path