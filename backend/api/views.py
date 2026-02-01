"""
DroneCommand AI — REST API Views

Tek birincil endpoint: POST /api/drones/register/
  → Drone'u kaydeder
  → GUI token verir
  → RabbitMQ topic'lerini oluşturur
  → Bağlantı bilgilerini döner

Diğer endpoint'ler GUI'nin ilk yüklemesi için (read-only).
Canlı veri akışı tamamen RabbitMQ (Web STOMP) üzerinden yapılır.
"""
import logging

from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view
from rest_framework.response import Response
from rest_framework.views import APIView
from django.conf import settings
from django.utils import timezone

from .models import Drone, LogEntry, ScanSession, DroneStatus
from .serializers import (
    DroneSerializer, DroneRegistrationSerializer,
    LogEntrySerializer, LogEntryCreateSerializer,
    ScanSessionSerializer,
)
from .services import DroneService, LogService

logger = logging.getLogger('dronecommand.api')


# ═══════════════════════════════════════════
#  Drone Registration (Ana Endpoint)
# ═══════════════════════════════════════════

class DroneRegistrationView(APIView):
    """
    POST /api/drones/register/

    Drone'u sisteme kaydeder ve bağlantı bilgilerini döner:
    - gui_token: GUI tanımlayıcı
    - rabbitmq: AMQP bağlantı bilgileri (drone için)
    - stomp: Web STOMP bağlantı bilgileri (GUI için)
    - topics: Drone'a özel topic'ler
    - gui_topics: GUI'nin subscribe olacağı topic'ler
    """

    def post(self, request):
        serializer = DroneRegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        drone, created = DroneService.register(data['drone_id'], data['name'], data['model'])

        LogService.log_drone_event(
            drone,
            f"Drone {'kaydedildi' if created else 'yeniden bağlandı'}",
        )

        # RabbitMQ topic'lerini oluştur
        self._setup_rabbitmq(drone)

        response_data = self._build_connection_info(drone)
        http_status = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response(response_data, status=http_status)

    @staticmethod
    def _setup_rabbitmq(drone: Drone):
        try:
            from rabbitmq_service.manager import RabbitMQManager
            with RabbitMQManager() as manager:
                manager.setup_drone_topics(drone)
        except Exception as exc:
            logger.warning("RabbitMQ setup hatası: %s", exc)

    @staticmethod
    def _build_connection_info(drone: Drone) -> dict:
        rmq = settings.RABBITMQ_CONFIG
        gui_token = str(drone.gui_token)
        did = drone.drone_id

        return {
            'drone_id': did,
            'gui_token': gui_token,

            # Drone AMQP bağlantısı
            'rabbitmq': {
                'host': rmq['HOST'],
                'port': rmq['PORT'],
                'username': rmq['USERNAME'],
                'password': rmq['PASSWORD'],
                'vhost': rmq['VIRTUAL_HOST'],
            },

            # GUI Web STOMP bağlantısı
            'stomp': {
                'host': rmq['STOMP_HOST'],
                'port': rmq['STOMP_PORT'],
                'url': f"ws://{rmq['STOMP_HOST']}:{rmq['STOMP_PORT']}/ws",
                'username': rmq['USERNAME'],
                'password': rmq['PASSWORD'],
                'vhost': rmq['VIRTUAL_HOST'],
            },

            # Drone topic'leri (AMQP — drone kullanır)
            'topics': drone.topics,

            # GUI topic'leri (Web STOMP — browser subscribe olur)
            'gui_topics': {
                'telemetry': f"/exchange/drone.gui/gui.{did}.telemetry",
                'video': f"/exchange/drone.gui/gui.{did}.video",
                'detection': f"/exchange/drone.gui/gui.{did}.detection",
                'alerts': f"/exchange/drone.gui/gui.{did}.alerts",
                'status': f"/exchange/drone.gui/gui.{did}.status",
            },

            # GUI komut gönderme (browser publish eder)
            'gui_command_destination': f"/exchange/drone.gui/gui.{did}.commands",
        }


# ═══════════════════════════════════════════
#  Drone (Read-Only)
# ═══════════════════════════════════════════

class DroneViewSet(viewsets.ReadOnlyModelViewSet):
    """GET /api/drones/ — Kayıtlı drone listesi ve detay."""

    queryset = Drone.objects.all()
    serializer_class = DroneSerializer
    lookup_field = 'drone_id'

    @action(detail=False, methods=['get'])
    def active(self, request):
        drones = DroneService.list_active()
        return Response(self.get_serializer(drones, many=True).data)

    @action(detail=True, methods=['get'])
    def connection_info(self, request, drone_id=None):
        """Drone bağlantı bilgilerini getir."""
        drone = self.get_object()
        rmq = settings.RABBITMQ_CONFIG
        did = drone.drone_id

        return Response({
            'drone_id': did,
            'gui_token': str(drone.gui_token),
            'topics': drone.topics,
            'gui_topics': {
                'telemetry': f"/exchange/drone.gui/gui.{did}.telemetry",
                'video': f"/exchange/drone.gui/gui.{did}.video",
                'detection': f"/exchange/drone.gui/gui.{did}.detection",
                'alerts': f"/exchange/drone.gui/gui.{did}.alerts",
                'status': f"/exchange/drone.gui/gui.{did}.status",
            },
            'gui_command_destination': f"/exchange/drone.gui/gui.{did}.commands",
            'stomp_url': f"ws://{rmq['STOMP_HOST']}:{rmq['STOMP_PORT']}/ws",
        })


# ═══════════════════════════════════════════
#  Log (Read-Only + Create)
# ═══════════════════════════════════════════

class LogEntryViewSet(viewsets.ModelViewSet):
    """CRUD /api/logs/ — Log kayıtları."""

    queryset = LogEntry.objects.all()

    def get_serializer_class(self):
        if self.action == 'create':
            return LogEntryCreateSerializer
        return LogEntrySerializer

    def get_queryset(self):
        params = self.request.query_params
        return LogService.list_filtered(
            log_type=params.get('type'),
            drone_id=params.get('drone_id'),
            detections_only=bool(params.get('detections')),
            limit=int(params.get('limit', 100)),
        )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        drone_id = data.pop('drone_id', None)
        drone = None

        if drone_id:
            try:
                drone = Drone.objects.get(drone_id=drone_id)
            except Drone.DoesNotExist:
                pass

        entry = LogService.create(drone=drone, **data)
        return Response(LogEntrySerializer(entry).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'])
    def detections(self, request):
        entries = LogService.get_detections()
        return Response(LogEntrySerializer(entries, many=True).data)

    @action(detail=False, methods=['get'])
    def alerts(self, request):
        entries = LogService.get_alerts()
        return Response(LogEntrySerializer(entries, many=True).data)


# ═══════════════════════════════════════════
#  Scan Sessions (Read-Only)
# ═══════════════════════════════════════════

class ScanSessionViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GET /api/scans/ — Tarama oturumları.

    Not: Tarama başlatma/durdurma artık RabbitMQ üzerinden yapılır.
    GUI → gui.{token}.commands → Consumer → drone
    """

    queryset = ScanSession.objects.all()
    serializer_class = ScanSessionSerializer

    @action(detail=False, methods=['get'])
    def active(self, request):
        sessions = ScanSession.objects.filter(is_active=True)
        return Response(self.get_serializer(sessions, many=True).data)


# ═══════════════════════════════════════════
#  System Status
# ═══════════════════════════════════════════

@api_view(['GET'])
def system_status(request):
    """GET /api/status/ — Sistem durumu."""
    rmq = settings.RABBITMQ_CONFIG

    # DB sorguları: tablolar yoksa (migration çalışmamışsa) 500 vermemeli
    drone_stats = {'total': 0, 'active': 0, 'scanning': 0}
    scan_stats = {'active': 0}
    detection_stats = {'fire': 0, 'smoke': 0}

    try:
        drone_stats = {
            'total': Drone.objects.count(),
            'active': DroneService.list_active().count(),
            'scanning': Drone.objects.filter(last_status=DroneStatus.SCANNING).count(),
        }
    except Exception as exc:
        logger.warning("system_status drone sorgusu hatası: %s", exc)

    try:
        scan_stats = {
            'active': ScanSession.objects.filter(is_active=True).count(),
        }
    except Exception as exc:
        logger.warning("system_status scan sorgusu hatası: %s", exc)

    try:
        detection_stats = {
            'fire': LogEntry.objects.filter(log_type='FIRE').count(),
            'smoke': LogEntry.objects.filter(log_type='SMOKE').count(),
        }
    except Exception as exc:
        logger.warning("system_status detection sorgusu hatası: %s", exc)

    return Response({
        'system_online': True,
        'timestamp': timezone.now().isoformat(),
        'architecture': 'rabbitmq-centric',
        'drones': drone_stats,
        'scans': scan_stats,
        'detections': detection_stats,
        'rabbitmq': {
            'host': rmq['HOST'],
            'port': rmq['PORT'],
            'stomp_port': rmq['STOMP_PORT'],
            'gui_exchange': rmq['EXCHANGE_GUI'],
        },
    })
