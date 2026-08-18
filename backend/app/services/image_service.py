import os
import json
from PIL import Image, ImageOps
import qrcode
from app.config import BASE_SAVE_DIR

def process_and_save_strip(session_id, session_raw_photos, print_export_dir, cloud_sim_dir, template_id):
    print(f"Đang xử lý dán ảnh vào khung: {template_id}...")
    
    config_dir = os.path.join(BASE_SAVE_DIR, "config")
    templates_file = os.path.join(config_dir, "templates.json")
    
    try:
        with open(templates_file, "r", encoding="utf-8") as f:
            templates = json.load(f)
    except Exception:
        print("Lỗi: Không thể đọc file templates.json")
        return None
        
    tpl_config = next((t for t in templates if t["id"] == template_id), None)
    if not tpl_config:
        print("Lỗi: Không tìm thấy cấu hình khung (Template ID sai)!")
        return None

    canvas_w = tpl_config["canvas_size"]["width"]
    canvas_h = tpl_config["canvas_size"]["height"]
    strip_image = Image.new("RGBA", (canvas_w, canvas_h), color=(255, 255, 255, 255))
    
    # 1. DÁN ẢNH KHÁCH VÀO SLOTS CỦA CANVAS
    for i, photo_path in enumerate(session_raw_photos):
        if i < len(tpl_config["slots"]):
            slot = tpl_config["slots"][i]
            try:
                img = Image.open(photo_path).convert("RGBA")
                
                # Cắt ghép tự động chống giãn hình
                target_size = (slot["width"], slot["height"])
                img_fitted = ImageOps.fit(img, target_size, method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
                
                if slot.get("rotation", 0) != 0:
                    img_fitted = img_fitted.rotate(slot["rotation"], expand=True)
                    
                strip_image.paste(img_fitted, (slot["x"], slot["y"]))
            except Exception as e:
                print(f"Lỗi khi dán ảnh số {i}: {e}")
                
    # 2. DÁN KHUNG PNG ĐỤC LỖ LÊN TRÊN CÙNG
    try:
        template_path = os.path.join(BASE_SAVE_DIR, "templates", f"{template_id}.png")
        if os.path.exists(template_path):
            template_img = Image.open(template_path).convert("RGBA")
            template_img = template_img.resize((canvas_w, canvas_h))
            strip_image.paste(template_img, (0, 0), template_img)
        else:
            print(f"Lỗi: Không tìm thấy file khung ảnh {template_path}")
    except Exception as e:
        print(f"Lỗi khi đè khung PNG: {e}")
        
    # 3. VẼ MÃ QR
    qr_conf = tpl_config.get("qr_config", {})
    if qr_conf.get("print_on_photo", False):
        download_url = f"http://127.0.0.1:3000/download/{session_id}"
        qr = qrcode.QRCode(version=1, box_size=10, border=1)
        qr.add_data(download_url)
        qr.make(fit=True)
        qr_img = qr.make_image(fill_color="black", back_color="white").convert("RGBA")
        
        qr_size = qr_conf.get("size", 200)
        qr_img = qr_img.resize((qr_size, qr_size))
        strip_image.paste(qr_img, (qr_conf.get("x", 0), qr_conf.get("y", 0)))

    # 4. LƯU ẢNH THÀNH PHẨM
        # File trong thư mục session (cho giao diện web/tải ảnh)
        cloud_save_path = os.path.join(cloud_sim_dir, "final_photobooth_strip.jpg")
        
        # File trong thư mục gom in (Gắn session_id để KHÔNG BỊ GHI ĐÈ)
        print_filename = f"print_{session_id}.jpg"
        print_save_path = os.path.join(print_export_dir, print_filename)
        
        final_image_rgb = strip_image.convert("RGB")
        final_image_rgb.save(cloud_save_path, "JPEG", quality=95)
        final_image_rgb.save(print_save_path, "JPEG", quality=95)
        
        print(f"Đã lưu ảnh in: {print_save_path}")
        return cloud_save_path