import threading
import time
import ctypes
from ctypes import wintypes
import os
from PIL import Image

# =====================================================================
# 1. KHỞI TẠO VÀ NẠP THƯ VIỆN CANON EDSDK
# =====================================================================
dll_path = os.path.join(os.getcwd(), 'EDSDK.dll')
if os.path.exists(dll_path):
    edsdk = ctypes.WinDLL(dll_path)
else:
    edsdk = None
    print("CẢNH BÁO: Không tìm thấy file EDSDK.dll trong thư mục gốc!")

class EdsDirectoryItemInfo(ctypes.Structure):
    _fields_ = [
        ("size", ctypes.c_uint64),
        ("isFolder", ctypes.c_uint32),
        ("groupID", ctypes.c_uint32),
        ("option", ctypes.c_uint32),
        ("szFileName", ctypes.c_char * 256),
        ("format", ctypes.c_uint32),
        ("dateTime", ctypes.c_uint32)
    ]

class EdsCapacity(ctypes.Structure):
    _fields_ = [
        ("numberOfFreeClusters", ctypes.c_int32),
        ("bytesPerSector", ctypes.c_int32),
        ("reset", ctypes.c_int32)
    ]

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
# 2. LỚP ĐIỀU KHIỂN MÁY ẢNH (CANON EDSDK)
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

    def _connect_camera(self):
        """Hàm phụ trợ để tìm và mở kết nối máy ảnh"""
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
            return True
        return False

    def _camera_worker(self):
        ctypes.windll.ole32.CoInitialize(None)
        edsdk.EdsInitializeSDK()

        if self._connect_camera():
            print("Đã kết nối EDSDK thành công!")
        else:
            print("LỖI: Không tìm thấy máy ảnh lúc khởi động!")

        live_view_on = False

        while self.is_running:
            try:
                # 1. Tự động kết nối lại khi đứt cáp
                if self.camera is None:
                    self.latest_frame = None
                    print("Đang thử kết nối lại với máy ảnh (Auto-Reconnect)...")
                    edsdk.EdsTerminateSDK()
                    time.sleep(1.5)
                    edsdk.EdsInitializeSDK()
                    
                    if self._connect_camera():
                        print("ĐÃ KHÔI PHỤC KẾT NỐI MÁY ẢNH!")
                        self.action_queue = "START_LIVE_VIEW"
                        live_view_on = False
                    else:
                        time.sleep(2)
                        continue

                # 2. Xử lý các Action
                if self.action_queue == "START_LIVE_VIEW":
                    if self.camera and not live_view_on:
                        evf_mode = ctypes.c_uint32(1)
                        edsdk.EdsSetPropertyData(self.camera, 0x00000501, 0, 4, ctypes.byref(evf_mode))
                        device = ctypes.c_uint32(2)
                        edsdk.EdsSetPropertyData(self.camera, 0x00000500, 0, 4, ctypes.byref(device))
                        live_view_on = True
                    self.action_queue = None

                elif self.action_queue == "PRE_FOCUS":
                    if self.camera:
                        evf_mode_off = ctypes.c_uint32(0)
                        edsdk.EdsSetPropertyData(self.camera, 0x00000501, 0, 4, ctypes.byref(evf_mode_off))
                        live_view_on = False
                        time.sleep(0.15)
                        edsdk.EdsSendCommand(self.camera, 4, 1) # Nửa cò
                    self.action_queue = None

                elif self.action_queue == "TRIGGER_SHUTTER":
                    if self.camera:
                        err_full = edsdk.EdsSendCommand(self.camera, 4, 3) 
                        time.sleep(0.05)
                        edsdk.EdsSendCommand(self.camera, 4, 0)
                        
                        if err_full == 0:
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
                            print(f"Lỗi nhả cò (Mã lỗi: {hex(err_full)})")
                            self.capture_success = False
                            if err_full in (0x61, 0x8D07, 0x8D04):
                                self.camera = None
                            
                        # Chụp xong bật lại Live View
                        evf_mode_on = ctypes.c_uint32(1)
                        edsdk.EdsSetPropertyData(self.camera, 0x00000501, 0, 4, ctypes.byref(evf_mode_on))
                        device = ctypes.c_uint32(2)
                        edsdk.EdsSetPropertyData(self.camera, 0x00000500, 0, 4, ctypes.byref(device))
                        live_view_on = True
                    else:
                        self.capture_success = False

                    self.action_queue = None
                    self.action_done_event.set()

                # 3. Luồng nạp frame Live View
                if live_view_on and self.action_queue is None and self.camera:
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
                    elif err != 0x8D01: 
                        print(f"CẢNH BÁO: Mất luồng Live View hoặc Rút cáp (Mã: {hex(err)})!")
                        self.camera = None
                        self.latest_frame = None
                        live_view_on = False
                        
                    edsdk.EdsRelease(evf_image)
                    edsdk.EdsRelease(stream)

                user32 = ctypes.windll.user32
                msg = wintypes.MSG()
                if user32.PeekMessageW(ctypes.byref(msg), 0, 0, 0, 1):
                    user32.TranslateMessage(ctypes.byref(msg))
                    user32.DispatchMessageW(ctypes.byref(msg))

            except Exception:
                pass
                
            time.sleep(0.03)

        if self.camera:
            edsdk.EdsCloseSession(self.camera)
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
        if not self.camera:
            return False
        self.target_save_path = save_path
        self.action_done_event.clear()
        self.action_queue = "TRIGGER_SHUTTER"
        self.action_done_event.wait(timeout=15)
        return self.capture_success

# Global Instance
canon_cam = CanonCamera()

def pre_focus_camera():
    canon_cam.pre_focus()

def capture_raw_photo(cloud_sim_dir, pose_number):
    file_name = f"pose_{pose_number}.jpg"
    file_path = os.path.join(cloud_sim_dir, file_name)
    
    success = canon_cam.trigger_shutter(file_path)
    if not success:
        print(f"[{pose_number}] LỖI: Tạo ảnh dự phòng...")
        img_test = Image.new("RGB", (1920, 1080), color=(40 * pose_number, 120, 200))
        img_test.save(file_path, "JPEG")
        
    return file_path