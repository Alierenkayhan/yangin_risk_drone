"""
DroneCommand AI — Scan Service
Tarama oturumu yönetimi iş mantığı.
"""
import logging
from django.utils import timezone

from api.models import Drone, ScanSession, DroneStatus
from api.exceptions import DroneNotFound, ScanSessionNotFound
from api.services.drone_service import DroneService
from api.services.log_service import LogService

logger = logging.getLogger('dronecommand.scan')


class ScanService:
    """Tarama oturumu oluşturma, durdurma ve sorgulama."""

    # ── Queries ────────────────────────────────

    @staticmethod
    def list_active():
        return ScanSession.objects.filter(is_active=True)

    # ── Mutations ──────────────────────────────

    @staticmethod
    def start(drone_id: str) -> ScanSession:
        """
        Belirtilen drone için yeni tarama oturumu başlatır.
        Aktif oturum varsa önce kapatır.
        """
        drone = DroneService.get_by_id(drone_id)

        # Mevcut aktif oturumları kapat
        ScanSession.objects.filter(drone=drone, is_active=True).update(
            is_active=False,
            ended_at=timezone.now(),
        )

        session = ScanSession.objects.create(drone=drone)
        DroneService.update_status(drone, DroneStatus.SCANNING)

        LogService.log_drone_event(
            drone,
            f"YOLO taraması başlatıldı — Session: {session.session_id}",
            log_type='ACTION',
        )

        logger.info("Tarama başlatıldı: %s → %s", drone.name, session.session_id)
        return session

    @staticmethod
    def stop(session: ScanSession) -> ScanSession:
        """Tarama oturumunu durdurur."""
        session.is_active = False
        session.ended_at = timezone.now()
        session.save(update_fields=['is_active', 'ended_at'])

        DroneService.update_status(session.drone, DroneStatus.HOVERING)

        LogService.log_drone_event(
            session.drone,
            f"Tarama durduruldu — {session.fire_detections} yangın, {session.smoke_detections} duman",
        )

        logger.info("Tarama durduruldu: %s", session.session_id)
        return session

    @staticmethod
    def record_frame(session: ScanSession, has_fire: bool = False, has_smoke: bool = False):
        """İşlenen frame istatistiklerini günceller."""
        session.total_frames_processed += 1
        update_fields = ['total_frames_processed']

        if has_fire:
            session.fire_detections += 1
            update_fields.append('fire_detections')

        if has_smoke:
            session.smoke_detections += 1
            update_fields.append('smoke_detections')

        session.save(update_fields=update_fields)
