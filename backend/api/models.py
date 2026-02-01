"""
DroneCommand AI — Database Models
"""
from django.db import models
from django.utils import timezone
import uuid


# ═══════════════════════════════════════════
#  Enums
# ═══════════════════════════════════════════

class DroneStatus(models.TextChoices):
    IDLE = 'Beklemede', 'Beklemede'
    PATROLLING = 'Devriyede', 'Devriyede'
    RETURNING = 'Dönüyor', 'Dönüyor'
    OFFLINE = 'Çevrimdışı', 'Çevrimdışı'
    HOVERING = 'Havada Sabit', 'Havada Sabit'
    FOLLOWING_PATH = 'Rota Takibi', 'Rota Takibi'
    SCANNING = 'Taramada', 'Taramada'


class LogType(models.TextChoices):
    INFO = 'INFO', 'Bilgi'
    WARNING = 'WARNING', 'Uyarı'
    ALERT = 'ALERT', 'Alarm'
    ACTION = 'ACTION', 'Eylem'
    FIRE_DETECTED = 'FIRE', 'Yangın Tespit'
    SMOKE_DETECTED = 'SMOKE', 'Duman Tespit'


# ═══════════════════════════════════════════
#  Models
# ═══════════════════════════════════════════

class Drone(models.Model):
    """
    Drone kayıt bilgileri.
    Telemetri ve pozisyon verileri RabbitMQ üzerinden gelir;
    burada sadece son bilinen durum cache'lenir.
    """
    drone_id = models.CharField(max_length=50, unique=True, verbose_name='Drone ID')
    name = models.CharField(max_length=100, verbose_name='İsim')
    model = models.CharField(max_length=100, verbose_name='Model')

    # GUI tanımlayıcı
    gui_token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)

    # RabbitMQ topic bilgileri (kayıt sonrası otomatik oluşturulur)
    telemetry_topic = models.CharField(max_length=200, blank=True, editable=False)
    command_topic = models.CharField(max_length=200, blank=True, editable=False)
    video_topic = models.CharField(max_length=200, blank=True, editable=False)
    alert_topic = models.CharField(max_length=200, blank=True, editable=False)

    # Son bilinen durum (cache)
    last_status = models.CharField(
        max_length=20, choices=DroneStatus.choices,
        default=DroneStatus.OFFLINE,
    )
    last_seen = models.DateTimeField(null=True, blank=True)

    is_active = models.BooleanField(default=True)
    registered_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Drone'
        verbose_name_plural = 'Drone\'lar'
        ordering = ['drone_id']

    def __str__(self):
        return f"{self.name} ({self.drone_id})"

    # ── Hooks ──────────────────────────────────

    def save(self, *args, **kwargs):
        if not self.telemetry_topic:
            base = f"drone.{self.drone_id}"
            self.telemetry_topic = f"{base}.telemetry"
            self.command_topic = f"{base}.commands"
            self.video_topic = f"{base}.video"
            self.alert_topic = f"{base}.alerts"
        super().save(*args, **kwargs)

    # ── Computed Properties ────────────────────

    @property
    def is_online(self) -> bool:
        return self.is_active and self.last_status != DroneStatus.OFFLINE

    @property
    def topics(self) -> dict:
        return {
            'telemetry': self.telemetry_topic,
            'commands': self.command_topic,
            'video': self.video_topic,
            'alerts': self.alert_topic,
        }


class LogEntry(models.Model):
    """Sistem, operasyon ve tespit log kayıtları."""

    source = models.CharField(max_length=100)
    message = models.TextField()
    log_type = models.CharField(max_length=20, choices=LogType.choices, default=LogType.INFO)

    drone = models.ForeignKey(
        Drone, on_delete=models.CASCADE,
        null=True, blank=True, related_name='logs',
    )

    # Detection-specific
    confidence = models.FloatField(null=True, blank=True)
    detection_class = models.CharField(max_length=50, blank=True)
    bbox = models.JSONField(null=True, blank=True)
    frame_path = models.CharField(max_length=500, blank=True)

    # Position at detection time
    position_x = models.FloatField(null=True, blank=True)
    position_y = models.FloatField(null=True, blank=True)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)

    timestamp = models.DateTimeField(default=timezone.now, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Log Kaydı'
        verbose_name_plural = 'Log Kayıtları'
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['log_type', '-timestamp']),
            models.Index(fields=['drone', '-timestamp']),
        ]

    def __str__(self):
        return f"[{self.log_type}] {self.source}: {self.message[:50]}"

    @property
    def is_detection(self) -> bool:
        return self.log_type in (LogType.FIRE_DETECTED, LogType.SMOKE_DETECTED)


class ScanSession(models.Model):
    """YOLO tarama oturumları."""

    session_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    drone = models.ForeignKey(Drone, on_delete=models.CASCADE, related_name='scan_sessions')

    is_active = models.BooleanField(default=True)
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    total_frames_processed = models.IntegerField(default=0)
    fire_detections = models.IntegerField(default=0)
    smoke_detections = models.IntegerField(default=0)

    class Meta:
        verbose_name = 'Tarama Oturumu'
        verbose_name_plural = 'Tarama Oturumları'
        ordering = ['-started_at']

    def __str__(self):
        status = "AKTİF" if self.is_active else "TAMAMLANDI"
        return f"[{status}] {self.drone.name} — {self.session_id}"

    @property
    def total_detections(self) -> int:
        return self.fire_detections + self.smoke_detections
