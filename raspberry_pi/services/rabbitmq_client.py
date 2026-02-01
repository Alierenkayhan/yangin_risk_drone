"""
DroneCommand AI — RabbitMQ İstemci (Raspberry Pi)
Backend'e AMQP ile telemetri/video gönderir, komut dinler.
"""
import json
import logging
import threading
import time
from datetime import datetime

import pika

logger = logging.getLogger('dronecommand.rabbitmq')


class DroneRabbitMQ:
    """
    Drone tarafı RabbitMQ bağlantısı.

    Gönderir:
      → drone.telemetry exchange — telemetri verisi
      → drone.video exchange    — kamera frame'leri
      → drone.alerts exchange   — alarm mesajları

    Dinler:
      ← drone.commands exchange — GUI'den gelen komutlar
    """

    def __init__(self, host, port, username, password, vhost='/'):
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.vhost = vhost

        self._connection = None
        self._channel = None
        self._cmd_connection = None
        self._cmd_channel = None

        self.topics = {}
        self.is_connected = False
        self._command_callback = None
        self._cmd_thread = None
        self._stop_event = threading.Event()

    # ── Bağlantı ──────────────────────────────

    def connect(self) -> bool:
        try:
            credentials = pika.PlainCredentials(self.username, self.password)
            params = pika.ConnectionParameters(
                host=self.host, port=self.port,
                virtual_host=self.vhost, credentials=credentials,
                heartbeat=600, blocked_connection_timeout=300,
                connection_attempts=5, retry_delay=3,
            )

            # Publish bağlantısı
            self._connection = pika.BlockingConnection(params)
            self._channel = self._connection.channel()

            # Command dinleme bağlantısı (ayrı thread)
            self._cmd_connection = pika.BlockingConnection(params)
            self._cmd_channel = self._cmd_connection.channel()

            self.is_connected = True
            logger.info('RabbitMQ bağlantısı kuruldu: %s:%d', self.host, self.port)
            return True
        except Exception as e:
            logger.error('RabbitMQ bağlantı hatası: %s', e)
            self.is_connected = False
            return False

    def close(self):
        self._stop_event.set()
        for conn in (self._connection, self._cmd_connection):
            if conn and not conn.is_closed:
                try:
                    conn.close()
                except Exception:
                    pass
        self.is_connected = False
        logger.info('RabbitMQ bağlantısı kapatıldı.')

    # ── Topic Ayarla ──────────────────────────

    def set_topics(self, topics: dict):
        self.topics = topics
        logger.info('Topic\'ler ayarlandı: %s', json.dumps(topics, indent=2))

    # ── Publish ───────────────────────────────

    def _publish(self, exchange: str, routing_key: str, payload: dict, persistent: bool = True):
        if not self.is_connected:
            return False
        try:
            self._channel.basic_publish(
                exchange=exchange,
                routing_key=routing_key,
                body=json.dumps(payload, default=str),
                properties=pika.BasicProperties(
                    delivery_mode=2 if persistent else 1,
                    content_type='application/json',
                ),
            )
            return True
        except pika.exceptions.AMQPConnectionError:
            logger.warning('Bağlantı koptu, yeniden bağlanılıyor...')
            self.is_connected = False
            return False
        except Exception as e:
            logger.error('Publish hatası: %s', e)
            return False

    def send_telemetry(self, data: dict) -> bool:
        topic = self.topics.get('telemetry')
        if not topic:
            return False
        message = {
            'type': 'TELEMETRY',
            'timestamp': datetime.now().isoformat(),
            'drone_id': data.get('drone_id', ''),
            'data': data,
        }
        return self._publish('drone.telemetry', topic, message)

    def send_video_frame(self, drone_id: str, frame_b64: str, frame_number: int) -> bool:
        topic = self.topics.get('video')
        if not topic:
            return False
        message = {
            'type': 'VIDEO_FRAME',
            'timestamp': datetime.now().isoformat(),
            'drone_id': drone_id,
            'frame_number': frame_number,
            'data': frame_b64,
        }
        return self._publish('drone.video', topic, message, persistent=False)

    def send_alert(self, drone_id: str, alert_message: str, data: dict = None) -> bool:
        topic = self.topics.get('alerts')
        if not topic:
            return False
        message = {
            'type': 'ALERT',
            'timestamp': datetime.now().isoformat(),
            'drone_id': drone_id,
            'message': alert_message,
            'data': data or {},
        }
        return self._publish('drone.alerts', topic, message)

    # ── Komut Dinleme ─────────────────────────

    def start_command_listener(self, callback):
        """Komut queue'sunu ayrı thread'de dinle."""
        self._command_callback = callback
        cmd_topic = self.topics.get('commands')
        if not cmd_topic:
            logger.warning('Komut topic\'i tanımlı değil, dinleme atlanıyor.')
            return

        queue_name = f'commands.{cmd_topic.replace(".", "_")}'
        try:
            self._cmd_channel.queue_declare(queue=queue_name, durable=True)
            self._cmd_channel.queue_bind(
                exchange='drone.commands',
                queue=queue_name,
                routing_key=cmd_topic,
            )
            self._cmd_channel.basic_consume(
                queue=queue_name,
                on_message_callback=self._on_command,
                auto_ack=False,
            )
        except Exception as e:
            logger.warning('Komut queue ayarlama hatası: %s', e)
            return

        self._cmd_thread = threading.Thread(target=self._consume_loop, daemon=True)
        self._cmd_thread.start()
        logger.info('Komut dinleme başladı: %s', queue_name)

    def _consume_loop(self):
        try:
            while not self._stop_event.is_set():
                self._cmd_connection.process_data_events(time_limit=1)
        except Exception as e:
            if not self._stop_event.is_set():
                logger.error('Komut dinleme hatası: %s', e)

    def _on_command(self, ch, method, properties, body):
        try:
            message = json.loads(body)
            command = message.get('command', '')
            params = message.get('params', {})
            logger.info('Komut alındı: %s → %s', command, json.dumps(params))

            if self._command_callback:
                self._command_callback(command, params)

            ch.basic_ack(delivery_tag=method.delivery_tag)
        except Exception as e:
            logger.error('Komut işleme hatası: %s', e)
            ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
