#!/usr/bin/env python3
"""
DroneCommand AI — Raspberry Pi Drone İstemcisi

Ana giriş noktası. Akış:
  1. Backend API'ye kayıt ol → gui_token + topic'ler
  2. RabbitMQ'ya AMQP bağlan
  3. Sensörleri başlat (kamera, GPS, çevre)
  4. Telemetri + video döngüsü başlat
  5. Komut dinleme başlat

Kullanım:
  python drone_client.py
  python drone_client.py --drone-id D-02 --name "Kartal-2"
"""
import argparse
import json
import logging
import os
import random
import signal
import sys
import threading
import time
from datetime import datetime
from pathlib import Path

# Proje kökünü path'e ekle
sys.path.insert(0, str(Path(__file__).parent))

from config import Config
from services.api_client import BackendAPI
from services.rabbitmq_client import DroneRabbitMQ
from sensors.camera import create_camera
from sensors.gps import create_gps
from sensors.environment import create_sensor

# ═══════════════════════════════════════════════
#  Logging
# ═══════════════════════════════════════════════

def setup_logging(level: str, log_file: str = None):
    fmt = '[%(asctime)s] %(levelname)s %(name)s: %(message)s'
    handlers = [logging.StreamHandler()]

    if log_file:
        log_dir = os.path.dirname(log_file)
        if log_dir:
            os.makedirs(log_dir, exist_ok=True)
        handlers.append(logging.FileHandler(log_file))

    logging.basicConfig(level=getattr(logging, level.upper(), logging.INFO),
                        format=fmt, handlers=handlers)


logger = logging.getLogger('dronecommand.main')


# ═══════════════════════════════════════════════
#  DroneClient — Ana Sınıf
# ═══════════════════════════════════════════════

class DroneClient:
    """
    Raspberry Pi üzerinde çalışan drone istemcisi.
    Backend'e kayıt olur, RabbitMQ üzerinden haberleşir.
    """

    def __init__(self, config: Config):
        self.config = config
        self.drone_id = config.DRONE_ID
        self.name = config.DRONE_NAME
        self.model = config.DRONE_MODEL

        # Durum
        self.status = 'Beklemede'
        self.battery = 100.0
        self.signal_quality = 100
        self.altitude = 0.0
        self.speed = 0.0
        self.position = {'x': 0, 'y': 0}
        self.flight_path = []

        # Kayıt bilgileri
        self.gui_token = None
        self.topics = {}

        # Servisler
        self.api = BackendAPI(config.API_BASE_URL)
        self.rmq = DroneRabbitMQ(
            host=config.RMQ_HOST, port=config.RMQ_PORT,
            username=config.RMQ_USERNAME, password=config.RMQ_PASSWORD,
            vhost=config.RMQ_VHOST,
        )

        # Sensörler
        self.camera = create_camera(config)
        self.gps = create_gps(config)
        self.env_sensor = create_sensor(config)

        # Kontrol
        self._stop_event = threading.Event()
        self._is_scanning = False
        self._scan_session_id = None

    # ── Başlatma Sekansı ──────────────────────

    def start(self):
        """Tam başlatma sekansı."""
        self._print_banner()

        # 1 — Backend sağlık kontrolü
        logger.info('[1/5] Backend bekleniyor...')
        if not self.api.wait_for_backend(max_retries=60, interval=3):
            logger.critical('Backend erişilemedi! Çıkılıyor.')
            sys.exit(1)

        # 2 — Drone kayıt
        logger.info('[2/5] Drone kaydediliyor...')
        try:
            reg = self.api.register_drone(self.drone_id, self.name, self.model)
            self.gui_token = reg['gui_token']
            self.topics = reg['topics']
            logger.info('  ✓ GUI Token: %s', self.gui_token)
        except Exception as e:
            logger.critical('Kayıt hatası: %s', e)
            sys.exit(1)

        # 3 — RabbitMQ bağlantısı
        logger.info('[3/5] RabbitMQ bağlanılıyor...')
        if not self.rmq.connect():
            logger.critical('RabbitMQ bağlantısı kurulamadı!')
            sys.exit(1)
        self.rmq.set_topics(self.topics)

        # 4 — Sensörler
        logger.info('[4/5] Sensörler başlatılıyor...')
        self._init_sensors()

        # 5 — Komut dinleme
        logger.info('[5/5] Komut dinleme başlatılıyor...')
        self.rmq.start_command_listener(self._handle_command)

        logger.info('═' * 50)
        logger.info('  DRONE HAZIR: %s (%s)', self.name, self.drone_id)
        logger.info('═' * 50)

        # Graceful shutdown
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)

        # Ana döngü
        self._run_loop()

    def _init_sensors(self):
        if not self.camera.open():
            logger.warning('Kamera açılamadı — video devre dışı')
        if not self.gps.open():
            logger.warning('GPS açılamadı — mock koordinatlar kullanılacak')
        if not self.env_sensor.open():
            logger.warning('Çevre sensörü açılamadı — mock değerler kullanılacak')

    # ── Ana Döngü ─────────────────────────────

    def _run_loop(self):
        """Telemetri + video gönderim döngüsü."""
        telemetry_interval = self.config.TELEMETRY_INTERVAL
        video_interval = 1.0 / self.config.VIDEO_FPS if self.config.VIDEO_ENABLED else None
        frame_number = 0

        last_telemetry = 0
        last_video = 0
        last_reconnect_check = 0

        logger.info('Ana döngü başladı (telemetri: %.1fs, video: %s)',
                     telemetry_interval,
                     f'{self.config.VIDEO_FPS} FPS' if video_interval else 'KAPALI')

        while not self._stop_event.is_set():
            now = time.time()

            # Bağlantı kontrolü (her 30s)
            if now - last_reconnect_check > 30:
                if not self.rmq.is_connected:
                    logger.warning('RabbitMQ bağlantısı kopuk, yeniden bağlanılıyor...')
                    if self.rmq.connect():
                        self.rmq.set_topics(self.topics)
                        self.rmq.start_command_listener(self._handle_command)
                last_reconnect_check = now

            # Telemetri
            if now - last_telemetry >= telemetry_interval:
                self._send_telemetry()
                last_telemetry = now

            # Video
            if video_interval and now - last_video >= video_interval:
                if self.camera.is_open:
                    frame_b64 = self.camera.capture_jpeg_base64()
                    if frame_b64:
                        self.rmq.send_video_frame(self.drone_id, frame_b64, frame_number)
                        frame_number += 1
                last_video = now

            # CPU rahatlatma
            time.sleep(0.01)

    # ── Telemetri ─────────────────────────────

    def _send_telemetry(self):
        """Tüm sensör verilerini topla ve gönder."""
        # Simüle batarya tüketimi
        if self.status not in ('Beklemede', 'Çevrimdışı'):
            self.battery = max(0, self.battery - 0.05)
            if self.battery < 10:
                self.rmq.send_alert(self.drone_id, f'KRİTİK: Batarya %{self.battery:.0f}!', {
                    'level': 'CRITICAL', 'battery': self.battery,
                })

        # GPS
        gps_data = self.gps.read()

        # Çevre sensörü
        env_data = self.env_sensor.read()

        # Devriyedeyse pozisyon güncelle
        if self.status == 'Devriyede':
            self.position['x'] = (self.position['x'] + random.choice([-1, 0, 1])) % 8
            self.position['y'] = (self.position['y'] + random.choice([-1, 0, 1])) % 8
            self.speed = random.uniform(30, 60)
        elif self.status == 'Rota Takibi':
            self.speed = random.uniform(20, 45)
        else:
            self.speed = 0

        payload = {
            'drone_id': self.drone_id,
            'position': self.position,
            'battery': round(self.battery, 1),
            'altitude': round(gps_data.alt if gps_data.alt > 0 else self.altitude, 1),
            'speed': round(gps_data.speed if gps_data.speed > 0 else self.speed, 1),
            'status': self.status,
            'signal_quality': self._estimate_signal(),
            # Ek sensör verileri
            'gps': gps_data.to_dict(),
            'environment': env_data.to_dict(),
        }

        ok = self.rmq.send_telemetry(payload)
        lvl = logging.DEBUG if ok else logging.WARNING
        logger.log(lvl, '[TEL] Bat: %.0f%% | Pos: %s | Stat: %s | GPS: %.4f, %.4f',
                   self.battery, self.position, self.status, gps_data.lat, gps_data.lng)

    def _estimate_signal(self) -> int:
        base = 95 if self.rmq.is_connected else 0
        return max(0, min(100, base + random.randint(-10, 5)))

    # ── Komut İşleme ─────────────────────────

    def _handle_command(self, command: str, params: dict):
        """Backend/GUI'den gelen komutları işle."""
        logger.info('KOMUT: %s → %s', command, json.dumps(params))

        if command == 'START_SCAN':
            self._is_scanning = True
            self._scan_session_id = params.get('session_id')
            self.status = 'Taramada'
            logger.info('Tarama başlatıldı: %s', self._scan_session_id)

        elif command == 'STOP_SCAN':
            self._is_scanning = False
            self._scan_session_id = None
            self.status = 'Beklemede'
            logger.info('Tarama durduruldu.')

        elif command == 'MOVE_TO':
            target_x = params.get('x', self.position['x'])
            target_y = params.get('y', self.position['y'])
            self.flight_path.append(dict(self.position))
            self.position = {'x': target_x, 'y': target_y}
            self.status = 'Rota Takibi'
            logger.info('Rota: [%d, %d]', target_x, target_y)

        elif command == 'RETURN_HOME':
            self.position = {'x': 0, 'y': 0}
            self.status = 'Dönüyor'
            self.flight_path = []
            logger.info('Eve dönüş başladı.')

        elif command == 'HOVER':
            self.status = 'Havada Sabit'

        elif command == 'LAND':
            self.status = 'Beklemede'
            self.altitude = 0

        elif command == 'SET_ALTITUDE':
            self.altitude = params.get('altitude', self.altitude)
            logger.info('İrtifa: %dm', self.altitude)

        elif command == 'PATROL':
            self.status = 'Devriyede'
            logger.info('Devriye başladı.')

        else:
            logger.warning('Bilinmeyen komut: %s', command)

    # ── Temizlik ──────────────────────────────

    def _signal_handler(self, signum, frame):
        logger.info('Kapatma sinyali alındı (%s)...', signal.Signals(signum).name)
        self.stop()

    def stop(self):
        self._stop_event.set()
        logger.info('Sensörler kapatılıyor...')
        self.camera.close()
        self.gps.close()
        self.env_sensor.close()
        self.rmq.close()
        logger.info('Drone istemcisi kapatıldı.')

    # ── Banner ────────────────────────────────

    def _print_banner(self):
        print('''
╔══════════════════════════════════════════════╗
║     DroneCommand AI — Raspberry Pi Client    ║
╠══════════════════════════════════════════════╣
║  Drone ID : {:<32} ║
║  İsim     : {:<32} ║
║  Model    : {:<32} ║
║  Backend  : {:<32} ║
║  RabbitMQ : {:<32} ║
║  Kamera   : {:<32} ║
║  GPS      : {:<32} ║
║  Sensör   : {:<32} ║
╚══════════════════════════════════════════════╝
        '''.format(
            self.config.DRONE_ID, self.config.DRONE_NAME, self.config.DRONE_MODEL,
            self.config.API_BASE_URL,
            f'{self.config.RMQ_HOST}:{self.config.RMQ_PORT}',
            self.config.CAMERA_TYPE,
            self.config.GPS_TYPE,
            self.config.SENSOR_TYPE,
        ))


# ═══════════════════════════════════════════════
#  CLI
# ═══════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description='DroneCommand AI — Raspberry Pi Drone İstemcisi')
    parser.add_argument('--drone-id', default=None, help='Drone ID (env: DRONE_ID)')
    parser.add_argument('--name', default=None, help='Drone adı (env: DRONE_NAME)')
    parser.add_argument('--model', default=None, help='Drone modeli (env: DRONE_MODEL)')
    parser.add_argument('--api-url', default=None, help='Backend API URL')
    parser.add_argument('--rmq-host', default=None, help='RabbitMQ host')
    parser.add_argument('--rmq-port', type=int, default=None, help='RabbitMQ port')
    parser.add_argument('--camera', choices=['picamera2', 'usb', 'test'], default=None)
    parser.add_argument('--gps', choices=['gpsd', 'serial', 'mock'], default=None)
    parser.add_argument('--sensor', choices=['bme280', 'dht22', 'mock'], default=None)
    parser.add_argument('--log-level', choices=['DEBUG', 'INFO', 'WARNING', 'ERROR'], default=None)

    args = parser.parse_args()

    # CLI argümanlarını env'e yaz (Config sınıfı env'den okur)
    arg_env_map = {
        'drone_id': 'DRONE_ID', 'name': 'DRONE_NAME', 'model': 'DRONE_MODEL',
        'api_url': 'API_BASE_URL', 'rmq_host': 'RABBITMQ_HOST',
        'camera': 'CAMERA_TYPE', 'gps': 'GPS_TYPE', 'sensor': 'SENSOR_TYPE',
        'log_level': 'LOG_LEVEL',
    }
    for arg_name, env_name in arg_env_map.items():
        val = getattr(args, arg_name, None)
        if val is not None:
            os.environ[env_name] = str(val)
    if args.rmq_port is not None:
        os.environ['RABBITMQ_PORT'] = str(args.rmq_port)

    # Config yeniden yükle
    from config import Config as ReloadedConfig
    config = ReloadedConfig()

    setup_logging(config.LOG_LEVEL, config.LOG_FILE)

    client = DroneClient(config)
    try:
        client.start()
    except KeyboardInterrupt:
        client.stop()
    except Exception as e:
        logger.critical('Beklenmeyen hata: %s', e, exc_info=True)
        client.stop()
        sys.exit(1)


if __name__ == '__main__':
    main()
