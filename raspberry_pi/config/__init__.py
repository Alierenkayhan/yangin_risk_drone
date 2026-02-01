"""
DroneCommand AI — Configuration Loader
.env dosyasını okur, default değerler sağlar.
"""
import os
from pathlib import Path

# .env yükle
_env_path = Path(__file__).parent / '.env'
try:
    from dotenv import load_dotenv
    load_dotenv(_env_path)
except ImportError:
    if _env_path.exists():
        for line in _env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, _, value = line.partition('=')
                os.environ.setdefault(key.strip(), value.strip())


def _env(key: str, default: str = '') -> str:
    return os.environ.get(key, default)

def _int(key: str, default: int = 0) -> int:
    return int(_env(key, str(default)))

def _float(key: str, default: float = 0.0) -> float:
    return float(_env(key, str(default)))

def _bool(key: str, default: bool = False) -> bool:
    return _env(key, str(default)).lower() in ('true', '1', 'yes')


class Config:
    # Drone
    DRONE_ID: str = _env('DRONE_ID', 'D-01')
    DRONE_NAME: str = _env('DRONE_NAME', 'Kartal-1')
    DRONE_MODEL: str = _env('DRONE_MODEL', 'DJI Matrice 300')

    # Backend API
    API_BASE_URL: str = _env('API_BASE_URL', 'http://localhost:8000/api')

    # RabbitMQ
    RMQ_HOST: str = _env('RABBITMQ_HOST', 'localhost')
    RMQ_PORT: int = _int('RABBITMQ_PORT', 5672)
    RMQ_USERNAME: str = _env('RABBITMQ_USERNAME', 'guest')
    RMQ_PASSWORD: str = _env('RABBITMQ_PASSWORD', 'guest')
    RMQ_VHOST: str = _env('RABBITMQ_VHOST', '/')

    # Kamera
    CAMERA_TYPE: str = _env('CAMERA_TYPE', 'test')
    CAMERA_DEVICE: str = _env('CAMERA_DEVICE', '/dev/video0')
    CAMERA_WIDTH: int = _int('CAMERA_WIDTH', 640)
    CAMERA_HEIGHT: int = _int('CAMERA_HEIGHT', 480)
    CAMERA_FPS: int = _int('CAMERA_FPS', 10)
    JPEG_QUALITY: int = _int('JPEG_QUALITY', 75)

    # GPS
    GPS_TYPE: str = _env('GPS_TYPE', 'mock')
    GPS_HOST: str = _env('GPS_HOST', '127.0.0.1')
    GPS_PORT: int = _int('GPS_PORT', 2947)
    GPS_SERIAL_PORT: str = _env('GPS_SERIAL_PORT', '/dev/ttyAMA0')
    GPS_SERIAL_BAUD: int = _int('GPS_SERIAL_BAUD', 9600)

    # Sensörler
    SENSOR_TYPE: str = _env('SENSOR_TYPE', 'mock')
    BME280_ADDRESS: int = int(_env('BME280_ADDRESS', '0x76'), 16)
    DHT_PIN: int = _int('DHT_PIN', 4)

    # Telemetri
    TELEMETRY_INTERVAL: float = _float('TELEMETRY_INTERVAL', 1.0)
    VIDEO_ENABLED: bool = _bool('VIDEO_ENABLED', True)
    VIDEO_FPS: int = _int('VIDEO_FPS', 10)

    # Simülasyon
    MOCK_FIRE_PROB: float = _float('MOCK_FIRE_PROBABILITY', 0.05)
    MOCK_SMOKE_PROB: float = _float('MOCK_SMOKE_PROBABILITY', 0.05)

    # Loglama
    LOG_LEVEL: str = _env('LOG_LEVEL', 'INFO')
    LOG_FILE: str = _env('LOG_FILE', '/var/log/dronecommand/drone.log')
