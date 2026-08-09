import os
import json
from PIL import Image, ImageOps
from app.config import BASE_SAVE_DIR

def generate_simulated_raw_photo(cloud_sim_dir, pose_number):
    file_name = f"pose_{pose_number}.jpg"
    file_path = os.path.join(cloud_sim_dir, file_name)
    # Ảnh màu xanh mô phỏng (sau này nối máy ảnh thật sẽ thay thế hàm này)
    img_test = Image.new("RGB", (1920, 1080), color=(40 * pose_number, 120, 200))
    img_test.save(file_path, "JPEG")
    return file_path

# Hàm tìm đường dẫn file PNG thật trong ổ cứng dựa vào ID khung
def get_template_path(template_id):
    templates_file = os.path.join(BASE_SAVE_DIR, "config", "templates.json")
    if not os.path.exists(templates_file): return None
    
    with open(templates_file, "r", encoding="utf-8") as f:
        templates = json.load(f)
    
    for tpl in templates:
        if tpl.get("id") == template_id and tpl.get("image_url"):
            # Lấy tên file ảnh từ URL (vd: tách lấy 'khung-cuoi.png')
            filename = tpl["image_url"].split("/")[-1]
            local_path = os.path.join(BASE_SAVE_DIR, "templates", filename)
            if os.path.exists(local_path):
                return local_path
    return None

# Bổ sung tham số template_id vào hàm
def process_and_save_strip(session_id, session_raw_photos, print_export_dir, cloud_sim_dir, template_id):
    canvas_size = (1200, 1800)
    # Lớp nền dưới cùng
    canvas = Image.new("RGBA", canvas_size, "white")
    
    slots = [
        {"x": 200, "y": 150},
        {"x": 200, "y": 650},
        {"x": 200, "y": 1150},
    ]
    
    # 1. Dán 3 tấm ảnh của khách vào đúng tọa độ
    for i, img_p in enumerate(session_raw_photos):
        if i < len(slots) and os.path.exists(img_p):
            raw_img = Image.open(img_p).convert("RGBA")
            cropped = ImageOps.fit(raw_img, (800, 450), centering=(0.5, 0.5))
            canvas.paste(cropped, (slots[i]["x"], slots[i]["y"]))
            
    # 2. ĐÈ KHUNG PNG TRONG SUỐT LÊN TRÊN CÙNG
    template_path = get_template_path(template_id)
    if template_path:
        try:
            template_img = Image.open(template_path).convert("RGBA")
            # Kéo giãn cho vừa đúng 1200x1800 để đề phòng Admin up sai kích thước
            template_img = template_img.resize(canvas_size, Image.Resampling.LANCZOS)
            # Paste dùng chính template_img làm Mask (để giữ nguyên lỗ đục trong suốt)
            canvas.paste(template_img, (0, 0), template_img)
        except Exception as e:
            print(f"Lỗi khi ghép khung: {e}")
    
    # 3. Xuất file in
    print_file_name = f"print_{session_id}.jpg"
    local_final_path = os.path.join(print_export_dir, print_file_name)
    canvas.convert("RGB").save(local_final_path, "JPEG", quality=95)
    
    # 4. Xuất file Cloud để quét mã QR
    cloud_final_name = "final_photobooth_strip.jpg"
    cloud_final_path = os.path.join(cloud_sim_dir, cloud_final_name)
    canvas.convert("RGB").save(cloud_final_path, "JPEG", quality=95)
    
    # (File GIF sẽ được xử lý sau)
    gif_sim_path = os.path.join(cloud_sim_dir, "animation_boomerang.gif")
    with open(gif_sim_path, "w") as f:
        f.write("GIF_SIMULATED_DATA")
        
    return local_final_path, cloud_final_path