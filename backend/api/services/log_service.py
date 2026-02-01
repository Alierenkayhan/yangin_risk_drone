"""
DroneCommand AI — Log Service
Merkezi log oluşturma ve sorgulama iş mantığı.
"""
import logging
from django.db.models import QuerySet

from api.models import Drone, LogEntry, LogType

logger = logging.getLogger('dronecommand.log')


class LogService:
    """Log kayıt oluşturma ve sorgulama."""

    # ── Queries ────────────────────────────────

    @staticmethod
    def list_filtered(
        log_type: str | None = None,
        drone_id: str | None = None,
        detections_only: bool = False,
        limit: int = 100,
    ) -> QuerySet:
        qs = LogEntry.objects.all()

        if log_type:
            qs = qs.filter(log_type=log_type.upper())

        if drone_id:
            qs = qs.filter(drone__drone_id=drone_id)

        if detections_only:
            qs = qs.filter(log_type__in=[LogType.FIRE_DETECTED, LogType.SMOKE_DETECTED])

        return qs[:limit]

    @staticmethod
    def get_alerts(limit: int = 50) -> QuerySet:
        return LogEntry.objects.filter(log_type=LogType.ALERT).order_by('-timestamp')[:limit]

    @staticmethod
    def get_detections(limit: int = 100) -> QuerySet:
        return LogEntry.objects.filter(
            log_type__in=[LogType.FIRE_DETECTED, LogType.SMOKE_DETECTED]
        ).order_by('-timestamp')[:limit]

    # ── Mutations ──────────────────────────────

    @staticmethod
    def create(
        source: str,
        message: str,
        log_type: str = LogType.INFO,
        drone: Drone | None = None,
        **extra_fields,
    ) -> LogEntry:
        entry = LogEntry.objects.create(
            source=source,
            message=message,
            log_type=log_type,
            drone=drone,
            **extra_fields,
        )
        logger.debug("[%s] %s: %s", log_type, source, message)
        return entry

    @staticmethod
    def log_drone_event(drone: Drone, message: str, log_type: str = LogType.INFO, **extra) -> LogEntry:
        """Drone ile ilişkili log kaydı kısayolu."""
        return LogService.create(
            source=drone.name,
            message=message,
            log_type=log_type,
            drone=drone,
            **extra,
        )

    @staticmethod
    def log_detection(drone: Drone, detection_class: str, confidence: float, bbox=None, **extra) -> LogEntry:
        """Yangın/duman tespiti için özel log."""
        log_type = LogType.FIRE_DETECTED if detection_class == 'fire' else LogType.SMOKE_DETECTED
        return LogService.create(
            source=drone.name,
            message=f"{detection_class.upper()} TESPİT EDİLDİ! Güven: {confidence:.2%}",
            log_type=log_type,
            drone=drone,
            confidence=confidence,
            detection_class=detection_class,
            bbox=bbox,
            **extra,
        )
