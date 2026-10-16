"""Camera adapter for testing the real workflow without Canon hardware.

Synthetic frames require only Pillow. Optional webcam access is owned by one
worker; captures reuse its latest frame instead of reading the device twice.
"""
import io
import threading
import time
from pathlib import Path

from PIL import Image, ImageDraw


class MockCamera:
    def __init__(self, use_webcam=False):
        self.camera = self  # Same availability contract as CanonCamera.
        self.use_webcam = use_webcam
        self.latest_frame = self._synthetic_frame()
        self._webcam_frame = None
        self._stop = threading.Event()
        self._preview = threading.Event()
        self._lock = threading.Lock()
        self._worker = None

    @staticmethod
    def _synthetic_frame(pose=0, size=(1280, 720)):
        image = Image.new('RGB', size, (30 + (pose * 37) % 140, 70, 130))
        draw = ImageDraw.Draw(image)
        width, height = size
        draw.rectangle((40, 40, width - 40, height - 40), outline='white', width=6)
        # Moving marker makes live-view updates visible without a webcam.
        x = 80 + int(time.monotonic() * 90) % (width - 200)
        draw.ellipse((x, height // 2, x + 80, height // 2 + 80), fill='#fbbf24')
        draw.text((80, 80), f'PHOTOBOOTH TEST - POSE {pose}\n{time.strftime("%H:%M:%S")}',
                  fill='white', font_size=36)
        buffer = io.BytesIO()
        image.save(buffer, 'JPEG', quality=90)
        return buffer.getvalue()

    def start_live_view_thread(self):
        with self._lock:
            self._preview.set()
            if self._worker is None or not self._worker.is_alive():
                self._stop.clear()
                self._worker = threading.Thread(target=self._run, daemon=True, name='mock-camera')
                self._worker.start()

    def stop_live_view_thread(self):
        self._preview.clear()

    def _run(self):
        cap = None
        cv2 = None
        try:
            if self.use_webcam:
                try:
                    import cv2
                    cap = cv2.VideoCapture(0)
                    if not cap.isOpened():
                        print('[MOCK] Không có webcam; chuyển sang ảnh giả lập.')
                        cap.release()
                        cap = None
                except Exception as exc:
                    print(f'[MOCK] Không mở được webcam: {exc}; dùng ảnh giả lập.')
            while not self._stop.is_set():
                if self._preview.is_set():
                    frame_bytes = None
                    if cap is not None:
                        success, frame = cap.read()
                        if success:
                            encoded, jpeg = cv2.imencode('.jpg', frame)
                            if encoded:
                                frame_bytes = jpeg.tobytes()
                    self._webcam_frame = frame_bytes
                    self.latest_frame = frame_bytes or self._synthetic_frame()
                self._stop.wait(0.08)
        except Exception as exc:
            # Remain usable for capture even after a webcam driver error.
            self._webcam_frame = None
            self.latest_frame = self._synthetic_frame()
            print(f'[MOCK] Live view: {exc}')
        finally:
            if cap is not None:
                cap.release()

    def pre_focus(self):
        time.sleep(0.05)

    def capture_photo(self, session_dir, pose_number):
        folder = Path(session_dir)
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / f'pose_{pose_number}.jpg'
        frame = self._webcam_frame or self._synthetic_frame(pose_number, (1920, 1080))
        with Image.open(io.BytesIO(frame)) as image:
            image.convert('RGB').save(path, 'JPEG', quality=95)
        return str(path)

    def shutdown(self):
        self._stop.set()
        if self._worker is not None:
            self._worker.join(timeout=3)
