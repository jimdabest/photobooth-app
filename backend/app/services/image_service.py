import os
from PIL import Image, ImageOps

def generate_simulated_raw_photo(cloud_sim_dir, pose_number):
    file_name = f"pose_{pose_number}.jpg"
    file_path = os.path.join(cloud_sim_dir, file_name)
    img_test = Image.new("RGB", (1920, 1080), color=(40 * pose_number, 120, 200))
    img_test.save(file_path, "JPEG")
    return file_path

def process_and_save_strip(session_id, session_raw_photos, print_export_dir, cloud_sim_dir):
    canvas_size = (1200, 1800)
    canvas = Image.new("RGBA", canvas_size, "white")
    
    slots = [
        {"x": 200, "y": 150},
        {"x": 200, "y": 650},
        {"x": 200, "y": 1150},
    ]
    
    for i, img_p in enumerate(session_raw_photos):
        if i < len(slots) and os.path.exists(img_p):
            raw_img = Image.open(img_p).convert("RGBA")
            cropped = ImageOps.fit(raw_img, (800, 450), centering=(0.5, 0.5))
            canvas.paste(cropped, (slots[i]["x"], slots[i]["y"]))
    
    # 1. Tối ưu In ấn: Lưu vào 1 thư mục chung duy nhất với tên file chứa mã phiên
    print_file_name = f"print_{session_id}.jpg"
    local_final_path = os.path.join(print_export_dir, print_file_name)
    canvas.convert("RGB").save(local_final_path, "JPEG", quality=95)
    
    # 2. Lưu bản khung vào thư mục Cloud (Vẫn giữ cấu trúc cũ để quét QR)
    cloud_final_name = "final_photobooth_strip.jpg"
    cloud_final_path = os.path.join(cloud_sim_dir, cloud_final_name)
    canvas.convert("RGB").save(cloud_final_path, "JPEG", quality=95)
    
    # 3. Giả lập GIF
    gif_sim_path = os.path.join(cloud_sim_dir, "animation_boomerang.gif")
    with open(gif_sim_path, "w") as f:
        f.write("GIF_SIMULATED_DATA")
        
    return local_final_path, cloud_final_path