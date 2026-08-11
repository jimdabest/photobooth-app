import ctypes
from ctypes import wintypes
import os
import time

# Bật hệ thống giao tiếp COM của Windows (Bắt buộc để nghe được tín hiệu Canon)
ctypes.windll.ole32.CoInitialize(None)

dll_path = os.path.join(os.getcwd(), 'EDSDK.dll')
edsdk = ctypes.WinDLL(dll_path)

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

# Ép kiểu 64-bit pointer
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

EDS_ERR_OK = 0x00000000
kEdsCameraCommand_TakePicture = 0x00000000
kEdsPropID_SaveTo = 0x0000000b          
kEdsSaveTo_Host = 2
kEdsObjectEvent_All = 0x00000200                     # Lắng nghe MỌI sự kiện
kEdsObjectEvent_DirItemRequestTransfer = 0x00000208  # Sự kiện: Yêu cầu tải về
kEdsObjectEvent_DirItemCreated = 0x00000204          # Sự kiện: Đã tạo file (Dự phòng)

is_download_finished = False 

@ObjectEventHandlerType
def object_event_handler(inEvent, inRef, inContext):
    global is_download_finished
    
    print(f"🔔 [SỰ KIỆN] Máy ảnh vừa réo lên mã: {hex(inEvent)}")
    
    if inEvent in (kEdsObjectEvent_DirItemRequestTransfer, kEdsObjectEvent_DirItemCreated):
        print("📥 Đang hút ảnh từ bộ nhớ đệm máy ảnh về PC...")
        
        dir_info = EdsDirectoryItemInfo()
        edsdk.EdsGetDirectoryItemInfo(inRef, ctypes.byref(dir_info))
        filename = dir_info.szFileName.decode('utf-8')
        
        save_path = os.path.join(os.getcwd(), f"photobooth_{filename}")
        
        stream = ctypes.c_void_p()
        
        # --- ĐÃ SỬA LỖI 0x61 Ở ĐÂY (Đổi 2 thành 1) ---
        err = edsdk.EdsCreateFileStream(save_path.encode('utf-8'), 1, 2, ctypes.byref(stream))
        if err != EDS_ERR_OK:
            print(f"❌ Lỗi tạo file trên ổ cứng PC: {hex(err)}")
            return EDS_ERR_OK
            
        # Hút dữ liệu
        err = edsdk.EdsDownload(inRef, dir_info.size, stream)
        if err == EDS_ERR_OK:
            edsdk.EdsDownloadComplete(inRef)
            print(f"🎉 TUYỆT VỜI! Ảnh đã được tải thành công về: {save_path}")
            is_download_finished = True
        else:
            print(f"❌ Lỗi truyền tải: {hex(err)}")
            
        edsdk.EdsRelease(stream)
        
    return EDS_ERR_OK

def test_shoot_and_download():
    print("🚀 Đang khởi tạo Canon EDSDK (Đã bật COM)...")
    edsdk.EdsInitializeSDK()

    try:
        cam_list = ctypes.c_void_p()
        edsdk.EdsGetCameraList(ctypes.byref(cam_list))
        
        count = ctypes.c_uint32()
        edsdk.EdsGetChildCount(cam_list, ctypes.byref(count))

        if count.value == 0:
            print("❌ Không tìm thấy máy ảnh!")
            return

        camera = ctypes.c_void_p()
        edsdk.EdsGetChildAtIndex(cam_list, 0, ctypes.byref(camera))
        
        edsdk.EdsOpenSession(camera)
        
        print("⚙️ Cấu hình lưu thẳng vào ổ cứng PC...")
        save_to = ctypes.c_uint32(kEdsSaveTo_Host)
        edsdk.EdsSetPropertyData(camera, kEdsPropID_SaveTo, 0, ctypes.sizeof(save_to), ctypes.byref(save_to))
        
        capacity = EdsCapacity(0x7FFFFFFF, 512, 1) 
        edsdk.EdsSetCapacity(camera, capacity)
        
        print("🎧 Gắn thiết bị lắng nghe (Bắt mọi sự kiện)...")
        # Gắn màng nhĩ lắng nghe toàn bộ sự kiện kEdsObjectEvent_All (0x200)
        edsdk.EdsSetObjectEventHandler(camera, kEdsObjectEvent_All, object_event_handler, None)

        print("📸 Máy ảnh chuẩn bị Tạch...")
        edsdk.EdsSendCommand(camera, kEdsCameraCommand_TakePicture, 0)

        print("⏳ Đang chờ ảnh... (Nhấn Ctrl+C để thoát nếu đợi quá lâu)")
        
        user32 = ctypes.windll.user32
        msg = wintypes.MSG()
        
        timeout = time.time() + 15  # Tăng thời gian chờ lên 15 giây
        
        while not is_download_finished and time.time() < timeout:
            # Liên tục cào (pump) sự kiện từ hệ thống Windows COM
            if user32.PeekMessageW(ctypes.byref(msg), 0, 0, 0, 1):
                user32.TranslateMessage(ctypes.byref(msg))
                user32.DispatchMessageW(ctypes.byref(msg))
            time.sleep(0.01)

        edsdk.EdsCloseSession(camera)

    except Exception as e:
        print(f"❌ Có lỗi: {e}")
        
    finally:
        edsdk.EdsTerminateSDK()
        ctypes.windll.ole32.CoUninitialize()

if __name__ == "__main__":
    test_shoot_and_download()