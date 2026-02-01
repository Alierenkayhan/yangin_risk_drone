"""
DroneCommand AI — Drone Service
Drone kayıt, sorgulama ve durum yönetimi iş mantığı.
"""
import logging
from django.utils import timezone

from api.models import Drone, DroneStatus
from api.exceptions import DroneNotFound

logger = logging.getLogger('dronecommand.drone')


class DroneService:
    """Drone CRUD ve durum yönetimi."""

    # ── Queries ────────────────────────────────

    @staticmethod
    def get_by_id(drone_id: str) -> Drone:
        try:
            return Drone.objects.get(drone_id=drone_id)
        except Drone.DoesNotExist:
            raise DroneNotFound(detail=f"Drone '{drone_id}' bulunamadı.")

    @staticmethod
    def list_active():
        return Drone.objects.filter(is_active=True).exclude(last_status=DroneStatus.OFFLINE)

    @staticmethod
    def list_all():
        return Drone.objects.all()

    # ── Registration ───────────────────────────

    @staticmethod
    def register(drone_id: str, name: str, model: str) -> tuple[Drone, bool]:
        """
        Drone'u sisteme kaydet veya mevcut kaydı güncelle.
        Returns: (drone, created)
        """
        existing = Drone.objects.filter(drone_id=drone_id).first()

        if existing:
            existing.is_active = True
            existing.last_seen = timezone.now()
            existing.save(update_fields=['is_active', 'last_seen', 'updated_at'])
            logger.info("Drone yeniden bağlandı: %s (%s)", name, drone_id)
            return existing, False

        drone = Drone.objects.create(drone_id=drone_id, name=name, model=model)
        logger.info("Yeni drone kaydedildi: %s (%s)", name, drone_id)
        return drone, True

    # ── Mutations ──────────────────────────────

    @staticmethod
    def deactivate(drone: Drone) -> Drone:
        drone.is_active = False
        drone.last_status = DroneStatus.OFFLINE
        drone.save(update_fields=['is_active', 'last_status', 'updated_at'])
        logger.info("Drone deaktif edildi: %s", drone.name)
        return drone

    @staticmethod
    def update_status(drone: Drone, new_status: str) -> Drone:
        drone.last_status = new_status
        drone.last_seen = timezone.now()
        drone.save(update_fields=['last_status', 'last_seen', 'updated_at'])
        return drone

    @staticmethod
    def heartbeat(drone: Drone) -> None:
        """Drone'dan sinyal alındığında son görülme zamanını günceller."""
        drone.last_seen = timezone.now()
        drone.save(update_fields=['last_seen'])
