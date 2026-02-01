"""
DroneCommand AI — Initial Migration
Drone, LogEntry ve ScanSession tablolarını oluşturur.
"""
import django.db.models.deletion
import django.utils.timezone
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        # ── Drone ─────────────────────────────────
        migrations.CreateModel(
            name='Drone',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('drone_id', models.CharField(max_length=50, unique=True, verbose_name='Drone ID')),
                ('name', models.CharField(max_length=100, verbose_name='İsim')),
                ('model', models.CharField(max_length=100, verbose_name='Model')),
                ('gui_token', models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
                ('telemetry_topic', models.CharField(blank=True, editable=False, max_length=200)),
                ('command_topic', models.CharField(blank=True, editable=False, max_length=200)),
                ('video_topic', models.CharField(blank=True, editable=False, max_length=200)),
                ('alert_topic', models.CharField(blank=True, editable=False, max_length=200)),
                ('last_status', models.CharField(
                    choices=[
                        ('Beklemede', 'Beklemede'),
                        ('Devriyede', 'Devriyede'),
                        ('Dönüyor', 'Dönüyor'),
                        ('Çevrimdışı', 'Çevrimdışı'),
                        ('Havada Sabit', 'Havada Sabit'),
                        ('Rota Takibi', 'Rota Takibi'),
                        ('Taramada', 'Taramada'),
                    ],
                    default='Çevrimdışı',
                    max_length=20,
                )),
                ('last_seen', models.DateTimeField(blank=True, null=True)),
                ('is_active', models.BooleanField(default=True)),
                ('registered_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Drone',
                'verbose_name_plural': "Drone'lar",
                'ordering': ['drone_id'],
            },
        ),

        # ── LogEntry ──────────────────────────────
        migrations.CreateModel(
            name='LogEntry',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('source', models.CharField(max_length=100)),
                ('message', models.TextField()),
                ('log_type', models.CharField(
                    choices=[
                        ('INFO', 'Bilgi'),
                        ('WARNING', 'Uyarı'),
                        ('ALERT', 'Alarm'),
                        ('ACTION', 'Eylem'),
                        ('FIRE', 'Yangın Tespit'),
                        ('SMOKE', 'Duman Tespit'),
                    ],
                    default='INFO',
                    max_length=20,
                )),
                ('drone', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='logs',
                    to='api.drone',
                )),
                ('confidence', models.FloatField(blank=True, null=True)),
                ('detection_class', models.CharField(blank=True, max_length=50)),
                ('bbox', models.JSONField(blank=True, null=True)),
                ('frame_path', models.CharField(blank=True, max_length=500)),
                ('position_x', models.FloatField(blank=True, null=True)),
                ('position_y', models.FloatField(blank=True, null=True)),
                ('latitude', models.FloatField(blank=True, null=True)),
                ('longitude', models.FloatField(blank=True, null=True)),
                ('timestamp', models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'verbose_name': 'Log Kaydı',
                'verbose_name_plural': 'Log Kayıtları',
                'ordering': ['-timestamp'],
            },
        ),
        migrations.AddIndex(
            model_name='logentry',
            index=models.Index(fields=['log_type', '-timestamp'], name='api_logentry_log_typ_idx'),
        ),
        migrations.AddIndex(
            model_name='logentry',
            index=models.Index(fields=['drone', '-timestamp'], name='api_logentry_drone_i_idx'),
        ),

        # ── ScanSession ──────────────────────────
        migrations.CreateModel(
            name='ScanSession',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('session_id', models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
                ('drone', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='scan_sessions',
                    to='api.drone',
                )),
                ('is_active', models.BooleanField(default=True)),
                ('started_at', models.DateTimeField(auto_now_add=True)),
                ('ended_at', models.DateTimeField(blank=True, null=True)),
                ('total_frames_processed', models.IntegerField(default=0)),
                ('fire_detections', models.IntegerField(default=0)),
                ('smoke_detections', models.IntegerField(default=0)),
            ],
            options={
                'verbose_name': 'Tarama Oturumu',
                'verbose_name_plural': 'Tarama Oturumları',
                'ordering': ['-started_at'],
            },
        ),
    ]
