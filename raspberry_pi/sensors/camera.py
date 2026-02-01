"""
DroneCommand AI — Kamera Servisi
PiCamera2, USB kamera ve test frame desteği.
"""
import base64
import time
import logging
import numpy as np
import cv2
import random
from datetime import datetime

logger = logging.getLogger('dronecommand.camera')


class CameraBase:
    def __init__(self, width=640, height=480, fps=10, jpeg_quality=75):
        self.width = width
        self.height = height
        self.fps = fps
        self.jpeg_quality = jpeg_quality
        self.is_open = False
        self.frame_count = 0

    def open(self) -> bool:
        raise NotImplementedError

    def read_frame(self) -> np.ndarray | None:
        raise NotImplementedError

    def close(self):
        self.is_open = False

    def capture_jpeg_base64(self) -> str | None:
        frame = self.read_frame()
        if frame is None:
            return None
        self.frame_count += 1
        _, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, self.jpeg_quality])
        return base64.b64encode(buf).decode('utf-8')


# ───── PiCamera2 (Raspberry Pi Kamera Modülü) ─────

class PiCamera2Driver(CameraBase):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._cam = None

    def open(self) -> bool:
        try:
            from picamera2 import Picamera2
            self._cam = Picamera2()
            config = self._cam.create_still_configuration(
                main={'size': (self.width, self.height), 'format': 'RGB888'},
            )
            self._cam.configure(config)
            self._cam.start()
            time.sleep(1)
            self.is_open = True
            logger.info('PiCamera2 açıldı: %dx%d', self.width, self.height)
            return True
        except Exception as e:
            logger.error('PiCamera2 açılamadı: %s', e)
            return False

    def read_frame(self):
        if not self.is_open or self._cam is None:
            return None
        try:
            rgb = self._cam.capture_array()
            return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        except Exception as e:
            logger.error('PiCamera2 frame hatası: %s', e)
            return None

    def close(self):
        if self._cam:
            try:
                self._cam.stop()
                self._cam.close()
            except Exception:
                pass
        super().close()


# ───── USB Kamera ─────

class USBCameraDriver(CameraBase):
    def __init__(self, device='/dev/video0', **kwargs):
        super().__init__(**kwargs)
        self.device = device
        self._cap = None

    def open(self) -> bool:
        try:
            dev = int(self.device) if self.device.isdigit() else self.device
            self._cap = cv2.VideoCapture(dev)
            self._cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
            self._cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
            self._cap.set(cv2.CAP_PROP_FPS, self.fps)
            if not self._cap.isOpened():
                raise RuntimeError(f'Kamera açılamadı: {self.device}')
            self.is_open = True
            logger.info('USB kamera açıldı: %s', self.device)
            return True
        except Exception as e:
            logger.error('USB kamera hatası: %s', e)
            return False

    def read_frame(self):
        if not self.is_open or self._cap is None:
            return None
        ret, frame = self._cap.read()
        return frame if ret else None

    def close(self):
        if self._cap:
            self._cap.release()
        super().close()


# ───── Test Kamera (Simülasyon) ─────

class TestCameraDriver(CameraBase):
    def __init__(self, drone_id='TEST', fire_prob=0.05, smoke_prob=0.05, **kwargs):
        super().__init__(**kwargs)
        self.drone_id = drone_id
        self.fire_prob = fire_prob
        self.smoke_prob = smoke_prob

    def open(self) -> bool:
        self.is_open = True
        logger.info('Test kamera aktif (simülasyon)')
        return True

    def read_frame(self):
        frame = np.zeros((self.height, self.width, 3), dtype=np.uint8)
        for y in range(self.height):
            green = int(40 + (y / self.height) * 80)
            frame[y, :] = [0, green, 0]

        for i in range(0, self.width, 80):
            cv2.line(frame, (i, 0), (i, self.height), (0, 100, 0), 1)
        for i in range(0, self.height, 60):
            cv2.line(frame, (0, i), (self.width, i), (0, 100, 0), 1)

        if random.random() < self.fire_prob:
            fx, fy = random.randint(100, self.width - 100), random.randint(100, self.height - 100)
            cv2.ellipse(frame, (fx, fy), (60, 40), 0, 0, 360, (0, 100, 255), -1)
            cv2.ellipse(frame, (fx, fy - 10), (40, 30), 0, 0, 360, (0, 165, 255), -1)

        if random.random() < self.smoke_prob:
            sx, sy = random.randint(100, self.width - 100), random.randint(50, self.height // 2)
            for i in range(4):
                dx, dy = random.randint(-30, 30), random.randint(-20, 20)
                cv2.ellipse(frame, (sx + dx, sy + dy),
                            (50 + i * 10, 30 + i * 5), 0, 0, 360, (128, 128, 128), -1)

        ts = datetime.now().strftime('%H:%M:%S')
        cv2.putText(frame, f'DRONE: {self.drone_id}', (10, 30),
                     cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        cv2.putText(frame, f'FRAME: {self.frame_count}', (10, 60),
                     cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
        cv2.putText(frame, ts, (self.width - 120, 30),
                     cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        return frame


# ───── Factory ─────

def create_camera(config) -> CameraBase:
    cam_type = config.CAMERA_TYPE.lower()
    common = dict(width=config.CAMERA_WIDTH, height=config.CAMERA_HEIGHT,
                  fps=config.CAMERA_FPS, jpeg_quality=config.JPEG_QUALITY)

    if cam_type == 'picamera2':
        return PiCamera2Driver(**common)
    elif cam_type == 'usb':
        return USBCameraDriver(device=config.CAMERA_DEVICE, **common)
    else:
        return TestCameraDriver(drone_id=config.DRONE_ID,
                                fire_prob=config.MOCK_FIRE_PROB,
                                smoke_prob=config.MOCK_SMOKE_PROB, **common)
