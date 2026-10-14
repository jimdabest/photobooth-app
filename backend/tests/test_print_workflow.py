"""Regression checks for the centralized ptb_data file workflow."""

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from app.services import image_service, offline_queue_service, settings_service


class CentralizedFileWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.final_dir = self.root / "final_images"
        self.session_dir = self.root / "session"
        self.hot_folder = self.root / "hot_folder"
        self.offline_queue = self.root / "offline_queue"
        for directory in (self.final_dir, self.session_dir, self.hot_folder, self.offline_queue):
            directory.mkdir()

        patches = (
            (settings_service, "SETTINGS_FILE", self.root / "config" / "settings.json"),
            (image_service, "FINAL_IMAGES_DIR", self.final_dir),
            (image_service, "SESSION_DIR", self.session_dir),
            (image_service, "HOT_FOLDER_DIR", self.hot_folder),
            (image_service, "OFFLINE_QUEUE_DIR", self.offline_queue),
            (offline_queue_service, "OFFLINE_QUEUE_DIR", self.offline_queue),
        )
        for module, attribute, value in patches:
            patcher = patch.object(module, attribute, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def _save_settings(self, **changes):
        return settings_service.save_settings(changes)

    def test_session_url_is_normalized_to_hash_router(self):
        expected = "https://x.com/#/photo/abc"
        for configured_url in (
            "https://x.com",
            "https://x.com/",
            "https://x.com/#/",
            "https://x.com/#",
        ):
            with self.subTest(configured_url=configured_url), patch.object(image_service, "FRONTEND_URL", configured_url):
                self.assertEqual(image_service.get_session_url("abc"), expected)

    def test_settings_default_contains_requested_printer_configuration(self):
        self._save_settings(templates=settings_service.DEFAULT_TEMPLATES)
        settings = settings_service.load_settings()
        self.assertEqual(settings["printer_model"], "RX1HS")
        self.assertTrue(settings["enable_review_page"])
        self.assertFalse(settings["save_session_raw_images"])
        self.assertEqual(settings["max_print_copies"], 10)
        self.assertTrue(settings["enable_retake"])
        self.assertEqual(settings["qr_timeout"], 15)
        self.assertEqual(settings["hot_folder_dir"], "ptb_data/hot_folder")
        self.assertEqual([template["print_format"] for template in settings["templates"]], ["s4x6", "s6x2_2"])

    def test_print_routing_clamps_copies_and_uses_independent_job_names(self):
        session_id = "session-a"
        source = self.final_dir / f"{session_id}.jpg"
        Image.new("RGB", (1200, 1800), "white").save(source)
        self._save_settings(printer_model="RX1HS", max_print_copies=3)

        files = image_service.send_to_hot_folder(session_id, "s4x6", 9)

        self.assertEqual(len(files), 3)
        for index, file_name in enumerate(files, start=1):
            path = Path(file_name)
            self.assertEqual(path.parent, self.hot_folder / "s4x6" / "RX1HS")
            self.assertRegex(path.name, rf"^{session_id}_\d{{8}}-\d{{6}}-\d{{6}}_{index}\.jpg$")
            with Image.open(path) as print_job:
                self.assertEqual(print_job.size, (1200, 1800))
                self.assertEqual(print_job.mode, "RGB")
                self.assertEqual(tuple(round(value) for value in print_job.info["dpi"]), (300, 300))

    def test_composition_keeps_final_and_removes_raw_after_offline_queueing(self):
        session_id = "session-b"
        raw_dir = self.session_dir / session_id
        raw_dir.mkdir()
        raw = raw_dir / "pose_1.jpg"
        Image.new("RGB", (1200, 1800), "blue").save(raw)
        self._save_settings(offline_mode=True, templates=[{
            "id": "tpl_custom", "name": "Khung", "print_format": "s4x6",
            "canvas_size": {"width": 1200, "height": 1800},
            "slots": [{"x": 0, "y": 0, "width": 1200, "height": 1800}],
            "qr_config": {"print_on_photo": False},
        }])

        final_path = image_service.process_and_save_strip(session_id, [str(raw)], "tpl_custom")

        self.assertEqual(final_path, self.final_dir / f"{session_id}.jpg")
        self.assertTrue(final_path.is_file())
        self.assertTrue(raw_dir.exists())
        image_service.finalize_session(session_id)
        self.assertFalse(raw_dir.exists())

    def test_composition_retains_raw_session_when_enabled(self):
        session_id = "session-keep-raw"
        raw_dir = self.session_dir / session_id
        raw_dir.mkdir()
        raw = raw_dir / "pose_1.jpg"
        Image.new("RGB", (1200, 1800), "blue").save(raw)
        self._save_settings(
            save_session_raw_images=True,
            offline_mode=True,
            templates=[{
                "id": "tpl_keep_raw", "name": "Khung", "print_format": "s4x6",
                "canvas_size": {"width": 1200, "height": 1800},
                "slots": [{"x": 0, "y": 0, "width": 1200, "height": 1800}],
                "qr_config": {"print_on_photo": False},
            }],
        )

        image_service.process_and_save_strip(session_id, [str(raw)], "tpl_keep_raw")
        image_service.finalize_session(session_id)

        self.assertTrue(raw_dir.is_dir())
        self.assertTrue(raw.is_file())

    def test_offline_finalization_writes_one_compressed_queue_file(self):
        session_id = "session-c"
        Image.new("RGB", (2400, 1200), "green").save(self.final_dir / f"{session_id}.jpg")
        raw_dir = self.session_dir / session_id
        raw_dir.mkdir()
        Image.new("RGB", (2400, 1200), "blue").save(raw_dir / "pose_1.jpg")
        self._save_settings(offline_mode=True)

        result = image_service.finalize_session(session_id)

        queued = self.offline_queue / f"{session_id}.jpg"
        self.assertEqual(Path(result["queue_file"]), queued)
        self.assertTrue(queued.is_file())
        self.assertTrue((self.offline_queue / f"{session_id}_pose_1.jpg").is_file())
        with Image.open(queued) as image:
            self.assertLessEqual(image.width, 1920)
        self.assertTrue(result["session_url"].endswith(f"/#/photo/{session_id}"))

    def test_online_finalization_removes_temporary_web_file_after_upload(self):
        session_id = "session-d"
        Image.new("RGB", (2400, 1200), "red").save(self.final_dir / f"{session_id}.jpg")
        raw_dir = self.session_dir / session_id
        raw_dir.mkdir()
        Image.new("RGB", (2400, 1200), "blue").save(raw_dir / "pose_1.jpg")
        self._save_settings(offline_mode=False)
        with patch.object(image_service, "upload_final_image_to_r2", return_value={"final": "https://cdn/final.jpg", "metadata": "", "poses": []}) as upload:
            result = image_service.finalize_session(session_id)
        self.assertEqual(result["cloud_url"], "https://cdn/final.jpg")
        self.assertEqual(upload.call_args.args[2][0].name, "pose_1.jpg")
        self.assertFalse(raw_dir.exists())

    def test_offline_sync_uploads_and_removes_queue_file(self):
        session_id = "session-e"
        queued = self.offline_queue / f"{session_id}.jpg"
        Image.new("RGB", (100, 100), "yellow").save(queued)
        Image.new("RGB", (100, 100), "blue").save(self.offline_queue / f"{session_id}_pose_1.jpg")

        class Client:
            def __init__(self):
                self.keys = []

            def upload_file(self, source, bucket, key, ExtraArgs):
                self.keys.append(key)

            def put_object(self, **kwargs):
                self.keys.append(kwargs["Key"])

        client = Client()
        with patch.object(offline_queue_service, "R2_PUBLIC_URL", "https://cdn.example"), \
             patch.object(offline_queue_service, "R2_BUCKET_NAME", "bucket"):
            result = offline_queue_service.sync_queue_item(session_id, client)
        self.assertEqual(result["status"], "uploaded")
        self.assertEqual(client.keys, [
            f"photo/{session_id}/{session_id}.jpg",
            f"photo/{session_id}/pose_1.jpg",
            f"photo/{session_id}/metadata.json",
        ])
        self.assertFalse(queued.exists())
        self.assertFalse((self.offline_queue / f"{session_id}_pose_1.jpg").exists())


if __name__ == "__main__":
    unittest.main()
