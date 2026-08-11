import ctypes
import os
import time

# Đường dẫn tới file EDSDK.dll trong thư mục backend
dll_path = os.path.join(os.getcwd(), 'EDSDK.dll')

if not os.path.exists(dll_path):
    print("❌ Không tìm thấy file EDSDK.dll trong thư mục backend!")
    print("👉 Hãy copy các file .dll từ thư mục Canon SDK vào thư mục backend/ trước.")
    exit(1)

# Nạp thư viện DLL của Canon qua ctypes
edsdk = ctypes.WinDLL(dll_path)

EDS_ERR_OK = 0x00000000
kEdsCameraCommand_TakePicture = 0x00000000

def test_shoot():
    print("🚀 Đang khởi tạo Canon EDSDK...")
    
    # 1. Khởi tạo SDK
    err = edsdk.EdsInitializeSDK()
    if err != EDS_ERR_OK:
        print(f"❌ Khởi tạo SDK thất bại. Mã lỗi: {hex(err)}")
        return

    try:
        # 2. Lấy danh sách máy ảnh
        cam_list = ctypes.c_void_p()
        err = edsdk.EdsGetCameraList(ctypes.byref(cam_list))
        if err != EDS_ERR_OK:
            print(f"❌ Lỗi lấy danh sách camera: {hex(err)}")
            return

        # 3. Đếm số lượng máy ảnh
        count = ctypes.c_uint32()
        edsdk.EdsGetChildCount(cam_list, ctypes.byref(count))

        if count.value == 0:
            print("❌ Không tìm thấy máy ảnh Canon nào!")
            print("👉 Kiểm tra:")
            print("   1. Đã bật nguồn máy ảnh chưa?")
            print("   2. Đã cắm cáp USB nối thẳng vào PC chưa?")
            print("   3. Đã TẮT ứng dụng Canon EOS Utility (nếu đang chạy ngầm ở góc màn hình) chưa?")
            return

        # 4. Lấy máy ảnh đầu tiên
        camera = ctypes.c_void_p()
        edsdk.EdsGetChildAtIndex(cam_list, 0, ctypes.byref(camera))
        print(f"✅ Đã tìm thấy {count.value} máy ảnh Canon!")

        # 5. Mở phiên làm việc
        err = edsdk.EdsOpenSession(camera)
        if err != EDS_ERR_OK:
            print(f"❌ Không thể mở session với máy ảnh. Mã lỗi: {hex(err)}")
            return

        print("📸 Đang gửi lệnh chụp (TakePicture)...")
        
        # 6. Ra lệnh chụp
        err = edsdk.EdsSendCommand(camera, kEdsCameraCommand_TakePicture, 0)
        if err == EDS_ERR_OK:
            print("🎉 ĐÃ PHÁT LỆNH CHỤP THÀNH CÔNG! Máy ảnh đã kêu Tạch.")
        else:
            print(f"❌ Lỗi khi phát lệnh chụp: {hex(err)}")

        time.sleep(1)
        edsdk.EdsCloseSession(camera)

    except Exception as e:
        print(f"❌ Có lỗi ngoài dự kiến: {e}")
        
    finally:
        edsdk.EdsTerminateSDK()

if __name__ == "__main__":
    test_shoot()