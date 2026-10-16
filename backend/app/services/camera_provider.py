"""Select the camera adapter before importing any Canon SDK code."""
import os

if os.getenv('PHOTOBOOTH_CAMERA_MODE', 'canon') in {'mock', 'webcam'}:
    from app.services.mock_camera_service import MockCamera

    canon_cam = MockCamera(use_webcam=os.getenv('PHOTOBOOTH_CAMERA_MODE') == 'webcam')

    def pre_focus_camera():
        canon_cam.pre_focus()

    def capture_raw_photo(session_dir, pose_number):
        return canon_cam.capture_photo(session_dir, pose_number)
else:
    from app.services.camera_service import canon_cam, pre_focus_camera, capture_raw_photo
