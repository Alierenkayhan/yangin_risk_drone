"""
Management command: RabbitMQ consumer başlat.
Tüm drone mesajlarını (telemetri, video, alert, GUI komutları) dinler.
"""
import signal
import sys

from django.core.management.base import BaseCommand

from rabbitmq_service.consumer import UnifiedConsumer


class Command(BaseCommand):
    help = 'RabbitMQ consumer — drone mesajlarını dinle ve işle'

    def __init__(self):
        super().__init__()
        self.consumer = None

    def add_arguments(self, parser):
        parser.add_argument(
            '--drone-id',
            type=str,
            help='Belirli bir drone ID (verilmezse tüm aktif drone\'lar)',
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('DroneCommand RabbitMQ Consumer başlatılıyor...'))

        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)

        drone_id = options.get('drone_id')

        self.consumer = UnifiedConsumer()

        try:
            self.consumer.run(drone_id=drone_id)
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Consumer hatası: {e}'))
        finally:
            self.stdout.write(self.style.SUCCESS('Consumer durduruldu.'))

    def _signal_handler(self, signum, frame):
        self.stdout.write('\nKapatılıyor...')
        if self.consumer:
            self.consumer.stop()
        sys.exit(0)
