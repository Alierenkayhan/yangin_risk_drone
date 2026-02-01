"""
DroneCommand AI — Backend API İstemcisi
Drone kayıt, sağlık kontrolü ve durum bildirimi.
"""
import logging
import requests
import time

logger = logging.getLogger('dronecommand.api')


class BackendAPI:
    def __init__(self, base_url: str, timeout: int = 10):
        self.base_url = base_url.rstrip('/')
        self.timeout = timeout

    def health_check(self) -> bool:
        try:
            r = requests.get(f'{self.base_url}/status/', timeout=self.timeout)
            return r.ok
        except Exception:
            return False

    def wait_for_backend(self, max_retries=30, interval=5):
        """Backend hazır olana kadar bekle."""
        for attempt in range(1, max_retries + 1):
            if self.health_check():
                logger.info('Backend erişilebilir: %s', self.base_url)
                return True
            logger.warning('Backend bekleniyor... (%d/%d)', attempt, max_retries)
            time.sleep(interval)
        logger.error('Backend %d denemede ulaşılamadı!', max_retries)
        return False

    def register_drone(self, drone_id: str, name: str, model: str) -> dict:
        """
        POST /api/drones/register/
        → gui_token, topics, rabbitmq/stomp bağlantı bilgileri
        """
        url = f'{self.base_url}/drones/register/'
        payload = {'drone_id': drone_id, 'name': name, 'model': model}

        logger.info('Drone kaydediliyor: %s → %s', drone_id, url)
        r = requests.post(url, json=payload, timeout=self.timeout)
        r.raise_for_status()
        data = r.json()
        logger.info('Kayıt başarılı — GUI Token: %s', data.get('gui_token', '?'))
        return data
