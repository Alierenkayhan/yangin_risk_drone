"""
DroneCommand AI — REST API Serializers
"""
from rest_framework import serializers
from .models import Drone, LogEntry, ScanSession


# ═══════════════════════════════════════════
#  Drone
# ═══════════════════════════════════════════

class DroneRegistrationSerializer(serializers.Serializer):
    """POST /api/drones/register/ giriş."""
    drone_id = serializers.CharField(max_length=50)
    name = serializers.CharField(max_length=100)
    model = serializers.CharField(max_length=100)


class DroneSerializer(serializers.ModelSerializer):
    topics = serializers.SerializerMethodField()

    class Meta:
        model = Drone
        fields = [
            'id', 'drone_id', 'name', 'model', 'gui_token',
            'topics', 'last_status', 'last_seen',
            'is_active', 'registered_at',
        ]
        read_only_fields = ['gui_token', 'topics', 'registered_at']

    def get_topics(self, obj):
        return obj.topics


# ═══════════════════════════════════════════
#  Log Entry
# ═══════════════════════════════════════════

class LogEntrySerializer(serializers.ModelSerializer):
    drone_id = serializers.CharField(source='drone.drone_id', read_only=True, allow_null=True)
    type = serializers.CharField(source='log_type', read_only=True)

    class Meta:
        model = LogEntry
        fields = [
            'id', 'source', 'message', 'type', 'drone_id',
            'confidence', 'detection_class', 'bbox', 'frame_path',
            'position_x', 'position_y', 'latitude', 'longitude',
            'timestamp', 'created_at',
        ]
        read_only_fields = ['created_at']


class LogEntryCreateSerializer(serializers.Serializer):
    """Log oluşturma (model bağımsız)."""
    source = serializers.CharField(max_length=100)
    message = serializers.CharField()
    log_type = serializers.ChoiceField(
        choices=['INFO', 'WARNING', 'ALERT', 'ACTION'],
        default='INFO',
    )
    drone_id = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    # Detection fields (opsiyonel)
    confidence = serializers.FloatField(required=False, allow_null=True)
    detection_class = serializers.CharField(required=False, allow_blank=True)
    bbox = serializers.ListField(child=serializers.FloatField(), required=False)
    frame_path = serializers.CharField(required=False, allow_blank=True)
    position_x = serializers.FloatField(required=False, allow_null=True)
    position_y = serializers.FloatField(required=False, allow_null=True)
    latitude = serializers.FloatField(required=False, allow_null=True)
    longitude = serializers.FloatField(required=False, allow_null=True)


# ═══════════════════════════════════════════
#  Scan Session
# ═══════════════════════════════════════════

class ScanSessionSerializer(serializers.ModelSerializer):
    drone_id = serializers.CharField(source='drone.drone_id', read_only=True)
    drone_name = serializers.CharField(source='drone.name', read_only=True)

    class Meta:
        model = ScanSession
        fields = [
            'id', 'session_id', 'drone', 'drone_id', 'drone_name',
            'is_active', 'started_at', 'ended_at',
            'total_frames_processed', 'fire_detections', 'smoke_detections',
        ]
        read_only_fields = ['session_id', 'started_at']
