import os
from datetime import datetime
from app.config import BASE_SAVE_DIR, PRINT_EXPORT_DIR

def create_session_folder():
    """Tạo thư mục phiên chụp mới"""
    # Mã phiên chụp (chính là thời gian hiện tại)
    session_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    session_path = os.path.join(BASE_SAVE_DIR, session_id)
    
    # Chỉ tạo thư mục cloud_simulated bên trong phiên chụp
    cloud_sim_dir = os.path.join(session_path, "cloud_simulated")
    os.makedirs(cloud_sim_dir, exist_ok=True)
    
    # Trả về kèm theo session_id để đặt tên file in không bị trùng
    return session_id, session_path, cloud_sim_dir, PRINT_EXPORT_DIR