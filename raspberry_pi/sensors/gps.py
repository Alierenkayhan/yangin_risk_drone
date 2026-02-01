"""
DroneCommand AI — GPS Servisi
gpsd, seri port NMEA ve mock desteği.
"""
import logging
import random
import time

logger = logging.getLogger('dronecommand.gps')


class GPSData:
    __slots__ = ('lat', 'lng', 'alt', 'speed', 'heading', 'satellites', 'fix', 'timestamp')

    def __init__(self, lat=0.0, lng=0.0, alt=0.0, speed=0.0, heading=0.0, satellites=0, fix=0, timestamp=None):
        self.lat = lat
        self.lng = lng
        self.alt = alt
        self.speed = speed
        self.heading = heading
        self.satellites = satellites
        self.fix = fix
        self.timestamp = timestamp or time.time()

    def to_dict(self):
        return {
            'lat': round(self.lat, 6), 'lng': round(self.lng, 6),
            'alt': round(self.alt, 1), 'speed': round(self.speed, 1),
            'heading': round(self.heading, 1), 'satellites': self.satellites,
            'fix': self.fix,
        }


# ───── gpsd ─────

class GPSDDriver:
    """gpsd daemon üzerinden GPS verisi."""

    def __init__(self, host='127.0.0.1', port=2947):
        self.host = host
        self.port = port
        self._session = None

    def open(self) -> bool:
        try:
            from gps3 import agps3
            self._session = agps3.GPSDSocket()
            self._session.connect(host=self.host, port=self.port)
            self._session.watch()
            self._data_stream = agps3.DataStream()
            logger.info('gpsd bağlantısı kuruldu: %s:%d', self.host, self.port)
            return True
        except Exception as e:
            logger.error('gpsd bağlantı hatası: %s', e)
            return False

    def read(self) -> GPSData:
        try:
            for new_data in self._session:
                if new_data:
                    self._data_stream.unpack(new_data)
                    lat = self._data_stream.TPV.get('lat', 'n/a')
                    lon = self._data_stream.TPV.get('lon', 'n/a')
                    if lat != 'n/a' and lon != 'n/a':
                        return GPSData(
                            lat=float(lat), lng=float(lon),
                            alt=float(self._data_stream.TPV.get('alt', 0) or 0),
                            speed=float(self._data_stream.TPV.get('speed', 0) or 0) * 3.6,
                            heading=float(self._data_stream.TPV.get('track', 0) or 0),
                            satellites=len(self._data_stream.satellites) if hasattr(self._data_stream, 'satellites') else 0,
                            fix=int(self._data_stream.TPV.get('mode', 0) or 0),
                        )
        except Exception as e:
            logger.warning('gpsd okuma hatası: %s', e)
        return GPSData()

    def close(self):
        if self._session:
            self._session.close()


# ───── Serial NMEA ─────

class SerialGPSDriver:
    """NMEA seri port GPS (NEO-6M vb.)."""

    def __init__(self, port='/dev/ttyAMA0', baud=9600):
        self.port = port
        self.baud = baud
        self._serial = None

    def open(self) -> bool:
        try:
            import serial
            self._serial = serial.Serial(self.port, self.baud, timeout=1)
            logger.info('Seri GPS açıldı: %s @ %d', self.port, self.baud)
            return True
        except Exception as e:
            logger.error('Seri GPS hatası: %s', e)
            return False

    def read(self) -> GPSData:
        try:
            if self._serial and self._serial.in_waiting:
                line = self._serial.readline().decode('ascii', errors='ignore').strip()
                if line.startswith('$GPGGA') or line.startswith('$GNGGA'):
                    return self._parse_gga(line)
                elif line.startswith('$GPRMC') or line.startswith('$GNRMC'):
                    return self._parse_rmc(line)
        except Exception as e:
            logger.warning('Seri GPS okuma hatası: %s', e)
        return GPSData()

    def _parse_gga(self, sentence: str) -> GPSData:
        parts = sentence.split(',')
        if len(parts) < 10:
            return GPSData()
        try:
            lat = self._nmea_to_deg(parts[2], parts[3])
            lng = self._nmea_to_deg(parts[4], parts[5])
            alt = float(parts[9]) if parts[9] else 0.0
            sats = int(parts[7]) if parts[7] else 0
            fix = int(parts[6]) if parts[6] else 0
            return GPSData(lat=lat, lng=lng, alt=alt, satellites=sats, fix=fix)
        except (ValueError, IndexError):
            return GPSData()

    def _parse_rmc(self, sentence: str) -> GPSData:
        parts = sentence.split(',')
        if len(parts) < 8:
            return GPSData()
        try:
            lat = self._nmea_to_deg(parts[3], parts[4])
            lng = self._nmea_to_deg(parts[5], parts[6])
            speed = float(parts[7]) * 1.852 if parts[7] else 0.0  # knots → km/h
            heading = float(parts[8]) if len(parts) > 8 and parts[8] else 0.0
            return GPSData(lat=lat, lng=lng, speed=speed, heading=heading, fix=1)
        except (ValueError, IndexError):
            return GPSData()

    @staticmethod
    def _nmea_to_deg(raw: str, direction: str) -> float:
        if not raw:
            return 0.0
        deg = int(float(raw) / 100)
        minutes = float(raw) - deg * 100
        result = deg + minutes / 60.0
        if direction in ('S', 'W'):
            result = -result
        return result

    def close(self):
        if self._serial:
            self._serial.close()


# ───── Mock GPS ─────

class MockGPSDriver:
    """Ankara civarında simüle GPS verisi."""

    def __init__(self):
        self.lat = 39.9030
        self.lng = 32.7800
        self.alt = 850.0

    def open(self) -> bool:
        logger.info('Mock GPS aktif (Ankara simülasyonu)')
        return True

    def read(self) -> GPSData:
        self.lat += random.uniform(-0.0002, 0.0002)
        self.lng += random.uniform(-0.0002, 0.0002)
        self.alt += random.uniform(-1, 1)
        return GPSData(
            lat=self.lat, lng=self.lng, alt=self.alt,
            speed=random.uniform(0, 60), heading=random.uniform(0, 360),
            satellites=random.randint(6, 12), fix=3,
        )

    def close(self):
        pass


# ───── Factory ─────

def create_gps(config):
    gps_type = config.GPS_TYPE.lower()
    if gps_type == 'gpsd':
        return GPSDDriver(host=config.GPS_HOST, port=config.GPS_PORT)
    elif gps_type == 'serial':
        return SerialGPSDriver(port=config.GPS_SERIAL_PORT, baud=config.GPS_SERIAL_BAUD)
    else:
        return MockGPSDriver()
