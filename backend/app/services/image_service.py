import threading
import time
import ctypes
from ctypes import wintypes
import os
from PIL import Image, ImageOps
import json
import qrcode
import subprocess

# =====================================================================
# 1. KHỞI TẠO VÀ NẠP THƯ VIỆN CANON EDSDK
# =====================================================================
dll_path = os.path.join(os.getcwd(), 'EDSDK.dll')
if os.path.exists(dll_path):
    edsdk = ctypes.WinDLL(dll_path)
else:
    edsdk = None
    print("⚠️ CẢNH BÁO: Không tìm thấy file EDSDK.dll trong thư mục gốc!")

class EdsDirectoryItemInfo(ctypes.Structure):
    _fields_ = [("size", ctypes.c_uint64), ("isFolder", ctypes.c_uint32), ("groupID", ctypes.c_uint32), ("option", ctypes.c_uint32), ("szFileName", ctypes.c_char * 256), ("format", ctypes.c_uint32), ("dateTime", ctypes.c_uint32)]

class EdsCapacity(ctypes.Structure):
    _fields_ = [("numberOfFreeClusters", ctypes.c_int32), ("bytesPerSector", ctypes.c_int32), ("reset", ctypes.c_int32)]

ObjectEventHandlerType = ctypes.WINFUNCTYPE(ctypes.c_uint32, ctypes.c_uint32, ctypes.c_void_p, ctypes.c_void_p)

if edsdk:
    edsdk.EdsGetCameraList.argtypes = [ctypes.c_void_p]
    edsdk.EdsGetChildCount.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
    edsdk.EdsGetChildAtIndex.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_void_p]
    edsdk.EdsOpenSession.argtypes = [ctypes.c_void_p]
    edsdk.EdsSetPropertyData.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_uint32, ctypes.c_uint32, ctypes.c_void_p]
    edsdk.EdsSetCapacity.argtypes = [ctypes.c_void_p, EdsCapacity]
    edsdk.EdsSetObjectEventHandler.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ObjectEventHandlerType, ctypes.c_void_p]
    edsdk.EdsSendCommand.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_uint32]
    edsdk.EdsGetDirectoryItemInfo.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
    edsdk.EdsCreateFileStream.argtypes = [ctypes.c_char_p, ctypes.c_uint32, ctypes.c_uint32, ctypes.c_void_p]
    edsdk.EdsDownload.argtypes = [ctypes.c_void_p, ctypes.c_uint64, ctypes.c_void_p]
    edsdk.EdsDownloadComplete.argtypes = [ctypes.c_void_p]
    edsdk.EdsRelease.argtypes = [ctypes.c_void_p]
    edsdk.EdsCloseSession.argtypes = [ctypes.c_void_p]
    edsdk.EdsCreateMemoryStream.argtypes = [ctypes.c_uint64, ctypes.POINTER(ctypes.c_void_p)]
    edsdk.EdsCreateEvfImageRef.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_void_p)]
    edsdk.EdsDownloadEvfImage.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
    edsdk.EdsGetPointer.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_void_p)]
    edsdk.EdsGetLength.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_uint64)]

# =====================================================================
# 2. LỚP ĐIỀU KHIỂN MÁY ẢNH (CHIA LÀM 2 BƯỚC ĐỒNG BỘ)
# =====================================================================
class CanonCamera:
    def __init__(self):
        self.camera = None
        self.is_download_finished = False
        self.target_save_path = ""
        self._callback_ref = ObjectEventHandlerType(self.object_event_handler)
        self.latest_frame = None
        self.is_running = True
        self.action_queue = None
        self.action_done_event = threading.Event()
        self.capture_success = False
        
        if edsdk:
            self.worker_thread = threading.Thread(target=self._camera_worker, daemon=True)
            self.worker_thread.start()

    def _camera_worker(self):
        ctypes.windll.ole32.CoInitialize(None)
        edsdk.EdsInitializeSDK()
        cam_list = ctypes.c_void_p()
        edsdk.EdsGetCameraList(ctypes.byref(cam_list))
        count = ctypes.c_uint32()
        edsdk.EdsGetChildCount(cam_list, ctypes.byref(count))

        if count.value > 0:
            self.camera = ctypes.c_void_p()
            edsdk.EdsGetChildAtIndex(cam_list, 0, ctypes.byref(self.camera))
            edsdk.EdsOpenSession(self.camera)
            save_to = ctypes.c_uint32(2)
            edsdk.EdsSetPropertyData(self.camera, 0x0000000b, 0, 4, ctypes.byref(save_to))
            capacity = EdsCapacity(0x7FFFFFFF, 512, 1)
            edsdk.EdsSetCapacity(self.camera, capacity)
            edsdk.EdsSetObjectEventHandler(self.camera, 0x00000200, self._callback_ref, None)
            print("==> Đã kết nối EDSDK thành công!")

        live_view_on = False

        while self.is_running:
            try:
                if self.action_queue == "START_LIVE_VIEW":
                    if self.camera and not live_view_on:
                        evf_mode = ctypes.c_uint32(1)
                        edsdk.EdsSetPropertyData(self.camera, 0x00000501, 0, 4, ctypes.byref(evf_mode))
                        device = ctypes.c_uint32(2)
                        edsdk.EdsSetPropertyData(self.camera, 0x00000500, 0, 4, ctypes.byref(device))
                        live_view_on = True
                    self.action_queue = None

                # ==========================================
                # HÀNH ĐỘNG 1: PRE-FOCUS (CHUẨN BỊ TẠI GIÂY SỐ 1)
                # ==========================================
                elif self.action_queue == "PRE_FOCUS":
                    if self.camera:
                        print("==> [PRE_FOCUS] Tắt Live View & Khóa nét...")
                        evf_mode_off = ctypes.c_uint32(0)
                        edsdk.EdsSetPropertyData(self.camera, 0x00000501, 0, 4, ctypes.byref(evf_mode_off))
                        time.sleep(0.15) # Đợi xả cáp
                        # Bấm nửa cò (Khóa nét ngay lập tức)
                        edsdk.EdsSendCommand(self.camera, 4, 1)
                    self.action_queue = None

                # ==========================================
                # HÀNH ĐỘNG 2: TRIGGER (BẤM CHỤP TẠI GIÂY SỐ 0)
                # ==========================================
                elif self.action_queue == "TRIGGER_SHUTTER":
                    if self.camera:
                        print("==> [TRIGGER_SHUTTER] Bấm lút cò chụp!")
                        # Chụp ngay lập tức (Vì nét đã khóa ở nhịp Pre-Focus)
                        err_full = edsdk.EdsSendCommand(self.camera, 4, 3) 
                        time.sleep(0.05)
                        edsdk.EdsSendCommand(self.camera, 4, 0) # Nhả ngón tay
                        
                        if err_full == 0:
                            print("==> Đang tải ảnh về...")
                            self.is_download_finished = False
                            user32 = ctypes.windll.user32
                            msg = wintypes.MSG()
                            timeout = time.time() + 10
                            while not self.is_download_finished and time.time() < timeout:
                                if user32.PeekMessageW(ctypes.byref(msg), 0, 0, 0, 1):
                                    user32.TranslateMessage(ctypes.byref(msg))
                                    user32.DispatchMessageW(ctypes.byref(msg))
                                time.sleep(0.01)
                            self.capture_success = self.is_download_finished
                        else:
                            print(f"==> LỖI CÒ: Mã {hex(err_full)}")
                            self.capture_success = False
                            
                        # Bật lại Live View
                        evf_mode_on = ctypes.c_uint32(1)
                        edsdk.EdsSetPropertyData(self.camera, 0x00000501, 0, 4, ctypes.byref(evf_mode_on))
                        device = ctypes.c_uint32(2)
                        edsdk.EdsSetPropertyData(self.camera, 0x00000500, 0, 4, ctypes.byref(device))
                    else:
                        self.capture_success = False

                    self.action_queue = None
                    self.action_done_event.set()

                # Stream Live View giữ nguyên
                if live_view_on and self.action_queue is None:
                    stream = ctypes.c_void_p()
                    edsdk.EdsCreateMemoryStream(0, ctypes.byref(stream))
                    evf_image = ctypes.c_void_p()
                    edsdk.EdsCreateEvfImageRef(stream, ctypes.byref(evf_image))
                    err = edsdk.EdsDownloadEvfImage(self.camera, evf_image)
                    if err == 0:
                        length = ctypes.c_uint64()
                        edsdk.EdsGetLength(stream, ctypes.byref(length))
                        pointer = ctypes.c_void_p()
                        edsdk.EdsGetPointer(stream, ctypes.byref(pointer))
                        if length.value > 0:
                            self.latest_frame = ctypes.string_at(pointer.value, length.value)
                    edsdk.EdsRelease(evf_image)
                    edsdk.EdsRelease(stream)

                user32 = ctypes.windll.user32
                msg = wintypes.MSG()
                if user32.PeekMessageW(ctypes.byref(msg), 0, 0, 0, 1):
                    user32.TranslateMessage(ctypes.byref(msg))
                    user32.DispatchMessageW(ctypes.byref(msg))

            except Exception: pass
            time.sleep(0.03)

        if self.camera: edsdk.EdsCloseSession(self.camera)
        edsdk.EdsTerminateSDK()
        ctypes.windll.ole32.CoUninitialize()

    def object_event_handler(self, inEvent, inRef, inContext):
        if inEvent in (0x00000208, 0x00000204):
            dir_info = EdsDirectoryItemInfo()
            edsdk.EdsGetDirectoryItemInfo(inRef, ctypes.byref(dir_info))
            stream = ctypes.c_void_p()
            edsdk.EdsCreateFileStream(self.target_save_path.encode('utf-8'), 1, 2, ctypes.byref(stream))
            if edsdk.EdsDownload(inRef, dir_info.size, stream) == 0:
                edsdk.EdsDownloadComplete(inRef)
                self.is_download_finished = True
            edsdk.EdsRelease(stream)
        return 0

    def start_live_view_thread(self):
        self.action_queue = "START_LIVE_VIEW"

    def pre_focus(self):
        if self.camera:
            self.action_queue = "PRE_FOCUS"

    def trigger_shutter(self, save_path: str) -> bool:
        if not self.camera: return False
        self.target_save_path = save_path
        self.action_done_event.clear()
        self.action_queue = "TRIGGER_SHUTTER"
        self.action_done_event.wait(timeout=15)
        return self.capture_success

canon_cam = CanonCamera()

# =====================================================================
# 3. CÁC HÀM XỬ LÝ CHÍNH
# =====================================================================

def pre_focus_camera():
    """Hàm này được gọi ra khi đếm ngược đến giây số 1"""
    canon_cam.pre_focus()

def capture_raw_photo(cloud_sim_dir, pose_number):
    """Hàm này được gọi ra khi đếm ngược chạm mốc số 0"""
    file_name = f"pose_{pose_number}.jpg"
    file_path = os.path.join(cloud_sim_dir, file_name)
    
    success = canon_cam.trigger_shutter(file_path)
    
    if not success:
        print(f"[{pose_number}] LỖI: Tạo ảnh dự phòng...")
        img_test = Image.new("RGB", (1920, 1080), color=(40 * pose_number, 120, 200))
        img_test.save(file_path, "JPEG")
        
    return file_path


def process_and_save_strip(session_id, session_raw_photos, print_export_dir, cloud_sim_dir, template_id):
    print(f"Đang xử lý dán ảnh vào khung: {template_id}...")
    
    from app.config import BASE_SAVE_DIR
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
    
    # DÁN ẢNH KHÁCH VÀO CANVAS
    for i, photo_path in enumerate(session_raw_photos):
        if i < len(tpl_config["slots"]):
            slot = tpl_config["slots"][i]
            try:
                img = Image.open(photo_path).convert("RGBA")
                
                # Cắt ghép tự động chống giãn ảnh
                target_size = (slot["width"], slot["height"])
                img_fitted = ImageOps.fit(img, target_size, method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
                
                if slot.get("rotation", 0) != 0:
                    img_fitted = img_fitted.rotate(slot["rotation"], expand=True)
                    
                strip_image.paste(img_fitted, (slot["x"], slot["y"]))
            except Exception as e:
                print(f"Lỗi khi dán ảnh số {i}: {e}")
                
    # DÁN KHUNG PNG ĐỤC LỖ LÊN TRÊN CÙNG
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
        
    # VẼ MÃ QR
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

    # LƯU ẢNH THÀNH PHẨM
    final_filename = "final_photobooth_strip.jpg"
    cloud_save_path = os.path.join(cloud_sim_dir, final_filename)
    print_save_path = os.path.join(print_export_dir, final_filename)
    
    final_image_rgb = strip_image.convert("RGB")
    final_image_rgb.save(cloud_save_path, "JPEG", quality=95)
    final_image_rgb.save(print_save_path, "JPEG", quality=95)
    
    print("✅ Đã ghép ảnh và lưu thành công!")
    return cloud_save_path