import threading
import time
import ctypes
from ctypes import wintypes
import os
from PIL import Image

dll_path = os.path.join(os.getcwd(), 'EDSDK.dll')
if os.path.exists(dll_path):
    edsdk = ctypes.WinDLL(dll_path)
else:
    edsdk = None
    print("Canh bao: Khong tim thay EDSDK.dll")

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

class CanonCamera:
    def __init__(self):
        self.camera = None
        self.is_download_finished = False
        self.target_save_path = ""
        self._callback_ref = ObjectEventHandlerType(self.object_event_handler)
        
        self.latest_frame = None
        self.is_running = True
        
        # Hang doi lenh giup tranh dung do giua LiveView va Capture
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
            print("Da ket noi va mo phien lam viec voi may anh Canon.")
        else:
            print("Canh bao: Khong tim thay may anh.")

        live_view_on = False

        while self.is_running:
            try:
                # 1. Kiem tra xem co ai ra lenh khong
                if self.action_queue == "START_LIVE_VIEW":
                    if self.camera and not live_view_on:
                        device = ctypes.c_uint32(2)
                        edsdk.EdsSetPropertyData(self.camera, 0x00000500, 0, 4, ctypes.byref(device))
                        live_view_on = True
                    self.action_queue = None
                    
                elif self.action_queue == "CAPTURE":
                    if self.camera:
                        self.is_download_finished = False
                        # Truoc khi chup, may anh se tu dong ngat guong lat
                        edsdk.EdsSendCommand(self.camera, 0x00000000, 0)
                        
                        user32 = ctypes.windll.user32
                        msg = wintypes.MSG()
                        timeout = time.time() + 15
                        
                        while not self.is_download_finished and time.time() < timeout:
                            if user32.PeekMessageW(ctypes.byref(msg), 0, 0, 0, 1):
                                user32.TranslateMessage(ctypes.byref(msg))
                                user32.DispatchMessageW(ctypes.byref(msg))
                            time.sleep(0.01)
                            
                        self.capture_success = self.is_download_finished
                    else:
                        self.capture_success = False
                        
                    self.action_queue = None
                    self.action_done_event.set()

                # 2. Neu khong co lenh gi ma dang bat LiveView thi tiep tuc hut Frame
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

                # 3. Luon luon cao su kien Windows de giu ket noi
                user32 = ctypes.windll.user32
                msg = wintypes.MSG()
                if user32.PeekMessageW(ctypes.byref(msg), 0, 0, 0, 1):
                    user32.TranslateMessage(ctypes.byref(msg))
                    user32.DispatchMessageW(ctypes.byref(msg))

            except Exception as e:
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

    def capture_photo(self, save_path: str) -> bool:
        if not self.camera:
            return False
            
        self.target_save_path = save_path
        self.action_done_event.clear()
        
        # Dat lenh chup vao hang doi va cho worker xu ly
        self.action_queue = "CAPTURE"
        self.action_done_event.wait()
        
        return self.capture_success

canon_cam = CanonCamera()

def capture_raw_photo(cloud_sim_dir, pose_number):
    file_name = f"pose_{pose_number}.jpg"
    file_path = os.path.join(cloud_sim_dir, file_name)
    
    print(f"Dang ra lenh Canon chup dang so {pose_number}...")
    success = canon_cam.capture_photo(file_path)
    
    if not success:
        print("Chup that bai, chuyen sang anh gia lap...")
        img_test = Image.new("RGB", (1920, 1080), color=(40 * pose_number, 120, 200))
        img_test.save(file_path, "JPEG")
        
    return file_path

def process_and_save_strip(session_id, session_raw_photos, print_export_dir, cloud_sim_dir, template_id):
    print(f"Dang xu ly va ghep khung {template_id}...")
    
    strip_height = 1080 * len(session_raw_photos)
    strip_image = Image.new("RGB", (1920, strip_height), color=(255, 255, 255))
    
    for i, photo_path in enumerate(session_raw_photos):
        try:
            img = Image.open(photo_path)
            img = img.resize((1920, 1080))
            strip_image.paste(img, (0, i * 1080))
        except Exception as e:
            print(f"Loi doc anh: {e}")
            
    final_filename = "final_photobooth_strip.jpg"
    cloud_save_path = os.path.join(cloud_sim_dir, final_filename)
    print_save_path = os.path.join(print_export_dir, final_filename)
    
    strip_image.save(cloud_save_path, "JPEG")
    strip_image.save(print_save_path, "JPEG")
    
    return cloud_save_path