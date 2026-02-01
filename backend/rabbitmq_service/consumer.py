"""
DroneCommand AI — Unified RabbitMQ Consumer

Tek consumer tüm drone mesajlarını dinler:
  1. Telemetri  → DB güncelle → GUI exchange'e yayınla
  2. Video      → Aktif tarama varsa YOLO → tespit log → GUI'ye yayınla
  3. Alert      → DB'ye kaydet → GUI'ye yayınla
  4. GUI komut  → Drone command exchange'e ilet

GUI exchange üzerinden browser (Web STOMP) mesajları alır.
"""
import json
import logging
import signal
import sys
import threading
import time

import pika
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger('dronecommand.consumer')


class UnifiedConsumer:
    """
    Tüm drone queue'larını dinleyen tek consumer.
    Yeni drone kaydolduğunda dinamik olarak queue eklenir.
    """

    def __init__(self):
        self.config = settings.RABBITMQ_CONFIG
        self.connection = None
        self.channel = None

        # GUI publish için ayrı bağlantı (thread-safe olmadığı için)
        self.pub_connection = None
        self.pub_channel = None

        # Detection service (lazy load)
        self._detection_service = None

        self.is_running = False

    # ── Properties ─────────────────────────────

    @property
    def detection_service(self):
        if self._detection_service is None:
            from detection.detector import DetectionService
            self._detection_service = DetectionService()
        return self._detection_service

    # ── Connection ─────────────────────────────

    def connect(self):
        """İki bağlantı kur: biri consume, biri publish."""
        credentials = pika.PlainCredentials(
            self.config['USERNAME'],
            self.config['PASSWORD'],
        )
        params = pika.ConnectionParameters(
            host=self.config['HOST'],
            port=self.config['PORT'],
            virtual_host=self.config['VIRTUAL_HOST'],
            credentials=credentials,
            heartbeat=600,
            blocked_connection_timeout=300,
        )

        # Consumer bağlantısı
        self.connection = pika.BlockingConnection(params)
        self.channel = self.connection.channel()
        self.channel.basic_qos(prefetch_count=10)

        # Publisher bağlantısı
        self.pub_connection = pika.BlockingConnection(params)
        self.pub_channel = self.pub_connection.channel()

        # GUI exchange'i oluştur
        self.pub_channel.exchange_declare(
            exchange=self.config['EXCHANGE_GUI'],
            exchange_type='topic',
            durable=True,
        )

        logger.info("RabbitMQ bağlantıları kuruldu: %s:%s", self.config['HOST'], self.config['PORT'])

    def close(self):
        """Bağlantıları kapat."""
        if self.channel:
            try:
                self.channel.stop_consuming()
            except Exception:
                pass
        if self.connection and not self.connection.is_closed:
            self.connection.close()
        if self.pub_connection and not self.pub_connection.is_closed:
            self.pub_connection.close()
        logger.info("Consumer bağlantıları kapatıldı.")

    # ── Setup ──────────────────────────────────

    def setup(self, drone_id=None):
        """Aktif drone'lar için consumer'ları ayarla."""
        from api.models import Drone

        if drone_id:
            drones = Drone.objects.filter(drone_id=drone_id, is_active=True)
        else:
            drones = Drone.objects.filter(is_active=True)

        for drone in drones:
            self._bind_drone(drone)

        logger.info("%d drone için consumer ayarlandı.", drones.count())

    def _bind_drone(self, drone):
        """Tek drone için tüm queue'ları dinlemeye başla."""
        did = drone.drone_id

        # ── Telemetry ──
        self._consume_queue(
            f"telemetry.{did}",
            lambda ch, method, props, body, d=drone: self._on_telemetry(ch, method, props, body, d),
            durable=True,
        )

        # ── Video ──
        self._consume_queue(
            f"video.{did}",
            lambda ch, method, props, body, d=drone: self._on_video(ch, method, props, body, d),
            durable=False,
        )

        # ── Alerts ──
        self._consume_queue(
            f"alerts.{did}",
            lambda ch, method, props, body, d=drone: self._on_alert(ch, method, props, body, d),
            durable=True,
        )

        # ── GUI commands (browser → drone) ──
        gui_cmd_queue = f"gui.{drone.gui_token}.commands"
        self._consume_queue(
            gui_cmd_queue,
            lambda ch, method, props, body, d=drone: self._on_gui_command(ch, method, props, body, d),
            durable=True,
        )

        logger.info("Drone bağlandı: %s (%s)", drone.name, did)

    def _consume_queue(self, queue_name, callback, durable=True):
        """Queue'yu dinlemeye başla (passive — queue yoksa atla)."""
        try:
            self.channel.queue_declare(queue=queue_name, durable=durable, passive=True)
            self.channel.basic_consume(
                queue=queue_name,
                on_message_callback=callback,
                auto_ack=False,
            )
        except pika.exceptions.ChannelClosedByBroker:
            # Queue henüz oluşturulmamış — yeni channel aç ve devam et
            logger.warning("Queue bulunamadı, atlanıyor: %s", queue_name)
            if self.channel.is_closed:
                self.channel = self.connection.channel()
                self.channel.basic_qos(prefetch_count=10)

    # ── Callbacks ──────────────────────────────

    def _on_telemetry(self, ch, method, properties, body, drone):
        """Telemetri mesajını işle → DB güncelle → GUI'ye yayınla."""
        try:
            message = json.loads(body)
            data = message.get('data', {})

            # DB güncelle
            from api.models import Drone as DroneModel
            DroneModel.objects.filter(drone_id=drone.drone_id).update(
                last_status=data.get('status', drone.last_status),
                last_seen=timezone.now(),
            )

            # GUI exchange'e yayınla
            gui_payload = {
                'type': 'TELEMETRY',
                'timestamp': message.get('timestamp', timezone.now().isoformat()),
                'drone_id': drone.drone_id,
                'data': data,
            }
            self._publish_gui(drone.drone_id, 'telemetry', gui_payload)

            ch.basic_ack(delivery_tag=method.delivery_tag)

        except Exception as e:
            logger.error("Telemetry hatası [%s]: %s", drone.drone_id, e)
            ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)

    def _on_video(self, ch, method, properties, body, drone):
        """
        Video frame işle:
        - Aktif tarama varsa → YOLO ile tespit yap → sonucu GUI'ye gönder
        - Tarama yoksa → ham frame'i GUI'ye ilet
        """
        try:
            message = json.loads(body)
            frame_data = message.get('data')
            frame_number = message.get('frame_number', 0)
            timestamp = message.get('timestamp', timezone.now().isoformat())

            if not frame_data:
                ch.basic_ack(delivery_tag=method.delivery_tag)
                return

            # Aktif tarama kontrolü
            from api.models import ScanSession
            active_session = ScanSession.objects.filter(
                drone=drone,
                is_active=True,
            ).first()

            if active_session:
                # ── YOLO Detection ──
                result = self.detection_service.process_frame(drone.drone_id, frame_data)

                if result:
                    # Annotated frame varsa onu gönder, yoksa orijinali
                    gui_frame = result.get('annotated_frame', frame_data)

                    # Video frame (annotated)
                    self._publish_gui(drone.drone_id, 'video', {
                        'type': 'VIDEO_FRAME',
                        'timestamp': timestamp,
                        'drone_id': drone.drone_id,
                        'frame_number': frame_number,
                        'data': gui_frame,
                        'scanning': True,
                    })

                    # Tespit sonucu ayrıca gönder
                    if result.get('detections'):
                        self._publish_gui(drone.drone_id, 'detection', {
                            'type': 'DETECTION',
                            'timestamp': timestamp,
                            'drone_id': drone.drone_id,
                            'frame_number': frame_number,
                            'detections': result['detections'],
                            'has_fire': result.get('has_fire', False),
                            'has_smoke': result.get('has_smoke', False),
                        })

                    # Yangın/duman tespit → log'a yaz
                    if result.get('has_fire') or result.get('has_smoke'):
                        self._log_detection(drone, result, active_session)

                    # Session istatistiklerini güncelle
                    self._update_session_stats(active_session, result)

                else:
                    # YOLO sonuç vermedi — ham frame gönder
                    self._publish_gui(drone.drone_id, 'video', {
                        'type': 'VIDEO_FRAME',
                        'timestamp': timestamp,
                        'drone_id': drone.drone_id,
                        'frame_number': frame_number,
                        'data': frame_data,
                        'scanning': True,
                    })
            else:
                # ── Tarama yok — ham frame ──
                self._publish_gui(drone.drone_id, 'video', {
                    'type': 'VIDEO_FRAME',
                    'timestamp': timestamp,
                    'drone_id': drone.drone_id,
                    'frame_number': frame_number,
                    'data': frame_data,
                    'scanning': False,
                })

            ch.basic_ack(delivery_tag=method.delivery_tag)

        except Exception as e:
            logger.error("Video hatası [%s]: %s", drone.drone_id, e)
            ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)

    def _on_alert(self, ch, method, properties, body, drone):
        """Alert mesajını işle → DB'ye kaydet → GUI'ye yayınla."""
        try:
            message = json.loads(body)

            from api.models import LogEntry, LogType
            LogEntry.objects.create(
                source=drone.name,
                message=message.get('message', 'Alert alındı'),
                log_type=LogType.ALERT,
                drone=drone,
            )

            self._publish_gui(drone.drone_id, 'alerts', {
                'type': 'ALERT',
                'timestamp': message.get('timestamp', timezone.now().isoformat()),
                'drone_id': drone.drone_id,
                'message': message.get('message', ''),
                'data': message,
            })

            ch.basic_ack(delivery_tag=method.delivery_tag)

        except Exception as e:
            logger.error("Alert hatası [%s]: %s", drone.drone_id, e)
            ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)

    def _on_gui_command(self, ch, method, properties, body, drone):
        """
        Browser'dan gelen komutu drone'a ilet.
        GUI → gui.{token}.commands → Consumer → drone.commands exchange → Drone
        """
        try:
            message = json.loads(body)
            command = message.get('command')
            params = message.get('params', {})

            logger.info("GUI komutu alındı [%s]: %s %s", drone.drone_id, command, params)

            # Özel komutlar
            if command == 'START_SCAN':
                self._handle_start_scan(drone)
            elif command == 'STOP_SCAN':
                self._handle_stop_scan(drone)
            else:
                # Genel komutu drone'a ilet
                from rabbitmq_service.manager import RabbitMQManager
                with RabbitMQManager() as manager:
                    manager.send_command(drone, {
                        'command': command,
                        'params': params,
                    })

            # Onay gönder
            self._publish_gui(drone.drone_id, 'status', {
                'type': 'COMMAND_ACK',
                'timestamp': timezone.now().isoformat(),
                'drone_id': drone.drone_id,
                'command': command,
                'status': 'sent',
            })

            ch.basic_ack(delivery_tag=method.delivery_tag)

        except Exception as e:
            logger.error("GUI komut hatası [%s]: %s", drone.drone_id, e)
            ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)

    # ── Scan Management ────────────────────────

    def _handle_start_scan(self, drone):
        """Tarama oturumu başlat."""
        from api.services import ScanService
        session = ScanService.start(drone.drone_id)

        # Detection service'i aktifle
        self.detection_service.start_detection(drone.drone_id, str(session.session_id))

        # GUI'ye bildir
        self._publish_gui(drone.drone_id, 'status', {
            'type': 'SCAN_STARTED',
            'timestamp': timezone.now().isoformat(),
            'drone_id': drone.drone_id,
            'session_id': str(session.session_id),
        })

        # Drone'a tarama komutu gönder
        from rabbitmq_service.manager import RabbitMQManager
        with RabbitMQManager() as manager:
            manager.send_command(drone, {
                'command': 'START_SCAN',
                'session_id': str(session.session_id),
            })

        logger.info("Tarama başlatıldı: %s → %s", drone.name, session.session_id)

    def _handle_stop_scan(self, drone):
        """Tarama oturumunu durdur."""
        from api.models import ScanSession
        from api.services import ScanService

        active = ScanSession.objects.filter(drone=drone, is_active=True).first()
        if active:
            session = ScanService.stop(active)
            self.detection_service.stop_detection(drone.drone_id)

            self._publish_gui(drone.drone_id, 'status', {
                'type': 'SCAN_STOPPED',
                'timestamp': timezone.now().isoformat(),
                'drone_id': drone.drone_id,
                'session_id': str(session.session_id),
                'stats': {
                    'total_frames': session.total_frames_processed,
                    'fire_detections': session.fire_detections,
                    'smoke_detections': session.smoke_detections,
                },
            })

            # Drone'a durdur komutu
            from rabbitmq_service.manager import RabbitMQManager
            with RabbitMQManager() as manager:
                manager.send_command(drone, {
                    'command': 'STOP_SCAN',
                    'session_id': str(session.session_id),
                })

            logger.info("Tarama durduruldu: %s", session.session_id)

    # ── Detection Logging ──────────────────────

    def _log_detection(self, drone, result, session):
        """Yangın/duman tespitini DB'ye kaydet."""
        from api.models import LogEntry, LogType

        for det in result.get('detections', []):
            if det['class'] in ['fire', 'smoke']:
                log_type = LogType.FIRE_DETECTED if det['class'] == 'fire' else LogType.SMOKE_DETECTED

                entry = LogEntry.objects.create(
                    source=drone.name,
                    message=f"🔥 {det['class'].upper()} TESPİT EDİLDİ! Güven: {det['confidence']:.2%}",
                    log_type=log_type,
                    drone=drone,
                    confidence=det['confidence'],
                    detection_class=det['class'],
                    bbox=det.get('bbox'),
                )

                logger.warning(
                    "[%s] %s tespit! Güven: %.2f%%",
                    drone.name, det['class'].upper(), det['confidence'] * 100,
                )

                # Alert olarak da GUI'ye gönder
                self._publish_gui(drone.drone_id, 'alerts', {
                    'type': 'DETECTION_ALERT',
                    'timestamp': timezone.now().isoformat(),
                    'drone_id': drone.drone_id,
                    'detection_class': det['class'],
                    'confidence': det['confidence'],
                    'bbox': det.get('bbox'),
                    'log_id': entry.id,
                })

    def _update_session_stats(self, session, result):
        """Tarama oturumu istatistiklerini güncelle."""
        update_fields = ['total_frames_processed']
        session.total_frames_processed += 1

        if result.get('has_fire'):
            session.fire_detections += 1
            update_fields.append('fire_detections')

        if result.get('has_smoke'):
            session.smoke_detections += 1
            update_fields.append('smoke_detections')

        session.save(update_fields=update_fields)

    # ── GUI Publish ────────────────────────────

    def _publish_gui(self, drone_id: str, message_type: str, payload: dict):
        """İşlenmiş veriyi GUI exchange'e yayınla."""
        try:
            routing_key = f"gui.{drone_id}.{message_type}"
            persistent = message_type not in ('video',)  # Video kalıcı olmasın

            self.pub_channel.basic_publish(
                exchange=self.config['EXCHANGE_GUI'],
                routing_key=routing_key,
                body=json.dumps(payload, default=str),
                properties=pika.BasicProperties(
                    delivery_mode=2 if persistent else 1,
                    content_type='application/json',
                ),
            )
        except Exception as e:
            logger.error("GUI publish hatası [%s/%s]: %s", drone_id, message_type, e)

    # ── Run ────────────────────────────────────

    def run(self, drone_id=None):
        """Consumer'ı başlat."""
        self.is_running = True
        self.connect()
        self.setup(drone_id)

        logger.info("Consumer başlatıldı. Mesajlar bekleniyor...")

        try:
            self.channel.start_consuming()
        except KeyboardInterrupt:
            pass
        finally:
            self.is_running = False
            self.close()

    def stop(self):
        """Graceful shutdown."""
        self.is_running = False
        if self.channel:
            self.channel.stop_consuming()
