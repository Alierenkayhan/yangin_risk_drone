"""
DroneCommand AI — RabbitMQ Manager
Bağlantı, topic yönetimi, GUI exchange ve mesaj yayını.

Mimari:
  Drone  →  AMQP Exchange (telemetry/video/alerts)  →  Backend Consumer
  Backend Consumer  →  İşle + YOLO  →  GUI Exchange  →  Browser (Web STOMP)
  Browser  →  GUI Exchange  →  Backend Consumer  →  Command Exchange  →  Drone
"""
import json
import logging
from datetime import datetime

import pika
from django.conf import settings

logger = logging.getLogger('dronecommand.rabbitmq')


class RabbitMQManager:
    """
    RabbitMQ bağlantı ve mesaj yönetimi.

    Kullanım:
        with RabbitMQManager() as manager:
            manager.setup_drone_topics(drone)
            manager.publish_to_gui(drone, 'telemetry', data)
    """

    def __init__(self):
        self.config = settings.RABBITMQ_CONFIG
        self.connection = None
        self.channel = None

    # ── Context Manager ────────────────────────

    def __enter__(self):
        self._connect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
        return False

    # ── Connection ─────────────────────────────

    def _connect(self):
        credentials = pika.PlainCredentials(
            self.config['USERNAME'],
            self.config['PASSWORD'],
        )
        parameters = pika.ConnectionParameters(
            host=self.config['HOST'],
            port=self.config['PORT'],
            virtual_host=self.config['VIRTUAL_HOST'],
            credentials=credentials,
            heartbeat=600,
            blocked_connection_timeout=300,
        )
        self.connection = pika.BlockingConnection(parameters)
        self.channel = self.connection.channel()
        self._setup_exchanges()
        logger.debug("RabbitMQ bağlantısı kuruldu: %s:%s", self.config['HOST'], self.config['PORT'])

    def _setup_exchanges(self):
        """Tüm exchange'leri oluştur (drone + GUI)."""
        exchanges = [
            # Drone → Backend
            self.config['EXCHANGE_TELEMETRY'],
            self.config['EXCHANGE_COMMANDS'],
            self.config['EXCHANGE_VIDEO'],
            self.config['EXCHANGE_ALERTS'],
            # Backend → GUI
            self.config['EXCHANGE_GUI'],
        ]
        for exchange_name in exchanges:
            self.channel.exchange_declare(
                exchange=exchange_name,
                exchange_type='topic',
                durable=True,
            )

    def close(self):
        if self.connection and not self.connection.is_closed:
            self.connection.close()
            logger.debug("RabbitMQ bağlantısı kapatıldı.")

    # ── Topic Setup ────────────────────────────

    def setup_drone_topics(self, drone):
        """
        Drone için özel queue ve binding'ler oluşturur.
        Hem AMQP (drone→backend) hem GUI (backend→browser) queue'ları.
        """
        did = drone.drone_id

        # ── Drone → Backend queue'ları ──
        drone_queues = [
            (f"telemetry.{did}", self.config['EXCHANGE_TELEMETRY'], drone.telemetry_topic, True, None),
            (f"commands.{did}", self.config['EXCHANGE_COMMANDS'], drone.command_topic, True, None),
            (f"video.{did}", self.config['EXCHANGE_VIDEO'], drone.video_topic, False, {'x-message-ttl': 5000}),
            (f"alerts.{did}", self.config['EXCHANGE_ALERTS'], drone.alert_topic, True, None),
        ]
        for queue_name, exchange, routing_key, durable, arguments in drone_queues:
            self.channel.queue_declare(queue=queue_name, durable=durable, arguments=arguments)
            self.channel.queue_bind(exchange=exchange, queue=queue_name, routing_key=routing_key)

        # ── GUI → Browser queue'ları ──
        gui_token = str(drone.gui_token)
        gui_queues = [
            (f"gui.{gui_token}.telemetry", f"gui.{did}.telemetry", True, None),
            (f"gui.{gui_token}.video", f"gui.{did}.video", False, {'x-message-ttl': 5000}),
            (f"gui.{gui_token}.detection", f"gui.{did}.detection", True, None),
            (f"gui.{gui_token}.alerts", f"gui.{did}.alerts", True, None),
            (f"gui.{gui_token}.status", f"gui.{did}.status", True, None),
        ]
        for queue_name, routing_key, durable, arguments in gui_queues:
            self.channel.queue_declare(queue=queue_name, durable=durable, arguments=arguments)
            self.channel.queue_bind(
                exchange=self.config['EXCHANGE_GUI'],
                queue=queue_name,
                routing_key=routing_key,
            )

        # ── GUI → Backend komut queue'su (browser'dan gelen komutlar) ──
        gui_cmd_queue = f"gui.{gui_token}.commands"
        gui_cmd_routing = f"gui.{did}.commands"
        self.channel.queue_declare(queue=gui_cmd_queue, durable=True)
        self.channel.queue_bind(
            exchange=self.config['EXCHANGE_GUI'],
            queue=gui_cmd_queue,
            routing_key=gui_cmd_routing,
        )

        logger.info("Topic'ler oluşturuldu: drone=%s, gui_token=%s", did, gui_token)

    # ── Publish: Backend → GUI ─────────────────

    def publish_to_gui(self, drone_id: str, message_type: str, payload: dict, persistent: bool = False):
        """
        İşlenmiş veriyi GUI exchange'e yayınla.
        Browser Web STOMP ile bu mesajları alır.

        Args:
            drone_id: Drone ID (routing key'de kullanılır)
            message_type: 'telemetry' | 'video' | 'detection' | 'alerts' | 'status'
            payload: JSON-serializable data
            persistent: Mesaj kalıcı olsun mu
        """
        routing_key = f"gui.{drone_id}.{message_type}"
        self._publish(
            self.config['EXCHANGE_GUI'],
            routing_key,
            payload,
            persistent=persistent,
        )

    # ── Publish: Backend → Drone ───────────────

    def send_command(self, drone, command_data: dict):
        """Drone'a komut gönder (AMQP üzerinden)."""
        payload = {
            'timestamp': _ts(),
            'drone_id': drone.drone_id,
            **command_data,
        }
        self._publish(self.config['EXCHANGE_COMMANDS'], drone.command_topic, payload)

    def send_alert(self, drone, alert_data: dict):
        """Alert yayınla."""
        payload = {
            'timestamp': _ts(),
            'drone_id': drone.drone_id,
            **alert_data,
        }
        self._publish(self.config['EXCHANGE_ALERTS'], drone.alert_topic, payload)

    # ── Internal ───────────────────────────────

    def _publish(self, exchange: str, routing_key: str, payload: dict, persistent: bool = True):
        self.channel.basic_publish(
            exchange=exchange,
            routing_key=routing_key,
            body=json.dumps(payload, default=str),
            properties=pika.BasicProperties(
                delivery_mode=2 if persistent else 1,
                content_type='application/json',
            ),
        )


# ═══════════════════════════════════════════
#  Message Factories
# ═══════════════════════════════════════════

def _ts() -> str:
    return datetime.now().isoformat()


def telemetry_message(drone_id, position, battery, altitude, speed, drone_status, signal_quality) -> dict:
    return {
        'type': 'TELEMETRY', 'timestamp': _ts(), 'drone_id': drone_id,
        'data': {
            'position': position, 'battery': battery, 'altitude': altitude,
            'speed': speed, 'status': drone_status, 'signal_quality': signal_quality,
        },
    }


def video_frame_message(drone_id, frame_data, frame_number, timestamp=None) -> dict:
    return {
        'type': 'VIDEO_FRAME', 'timestamp': timestamp or _ts(),
        'drone_id': drone_id, 'frame_number': frame_number, 'data': frame_data,
    }


def detection_message(drone_id, detection_class, confidence, bbox, position=None) -> dict:
    return {
        'type': 'DETECTION', 'timestamp': _ts(), 'drone_id': drone_id,
        'detection': {
            'class': detection_class, 'confidence': confidence,
            'bbox': bbox, 'position': position,
        },
    }


COMMAND_LABELS = {
    'START_SCAN': 'Taramayı başlat',
    'STOP_SCAN': 'Taramayı durdur',
    'MOVE_TO': 'Hedefe git',
    'RETURN_HOME': 'Eve dön',
    'HOVER': 'Havada bekle',
    'LAND': 'İniş yap',
    'SET_ALTITUDE': 'İrtifa ayarla',
}
