from django.contrib import admin
from .models import Drone, LogEntry, ScanSession


@admin.register(Drone)
class DroneAdmin(admin.ModelAdmin):
    list_display = ['drone_id', 'name', 'model', 'last_status', 'is_active', 'last_seen']
    list_filter = ['last_status', 'is_active', 'model']
    search_fields = ['drone_id', 'name']
    readonly_fields = ['gui_token', 'telemetry_topic', 'command_topic', 'video_topic', 'alert_topic', 'registered_at']


@admin.register(LogEntry)
class LogEntryAdmin(admin.ModelAdmin):
    list_display = ['timestamp', 'source', 'log_type', 'message', 'drone', 'confidence']
    list_filter = ['log_type', 'source', 'drone']
    search_fields = ['message', 'source']
    date_hierarchy = 'timestamp'


@admin.register(ScanSession)
class ScanSessionAdmin(admin.ModelAdmin):
    list_display = ['session_id', 'drone', 'is_active', 'started_at', 'fire_detections', 'smoke_detections']
    list_filter = ['is_active', 'drone']
