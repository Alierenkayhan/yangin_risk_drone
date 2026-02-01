"""
DroneCommand AI — Çevre Sensörleri
BME280 (I2C), DHT22 (GPIO) ve mock desteği.
"""
import logging
import random
import time

logger = logging.getLogger('dronecommand.sensors')


class SensorData:
    __slots__ = ('temperature', 'humidity', 'pressure')

    def __init__(self, temperature=0.0, humidity=0.0, pressure=1013.25):
        self.temperature = temperature
        self.humidity = humidity
        self.pressure = pressure

    def to_dict(self):
        return {
            'temperature': round(self.temperature, 1),
            'humidity': round(self.humidity, 1),
            'pressure': round(self.pressure, 1),
        }


# ───── BME280 (I2C) ─────

class BME280Driver:
    def __init__(self, address=0x76):
        self.address = address
        self._sensor = None

    def open(self) -> bool:
        try:
            import board
            import busio
            from adafruit_bme280 import basic as adafruit_bme280
            i2c = busio.I2C(board.SCL, board.SDA)
            self._sensor = adafruit_bme280.Adafruit_BME280_I2C(i2c, address=self.address)
            logger.info('BME280 açıldı: I2C 0x%02x', self.address)
            return True
        except Exception as e:
            logger.error('BME280 hatası: %s', e)
            return False

    def read(self) -> SensorData:
        if not self._sensor:
            return SensorData()
        try:
            return SensorData(
                temperature=self._sensor.temperature,
                humidity=self._sensor.relative_humidity,
                pressure=self._sensor.pressure,
            )
        except Exception as e:
            logger.warning('BME280 okuma hatası: %s', e)
            return SensorData()

    def close(self):
        pass


# ───── DHT22 (GPIO) ─────

class DHT22Driver:
    def __init__(self, pin=4):
        self.pin = pin
        self._device = None

    def open(self) -> bool:
        try:
            import board
            import adafruit_dht
            gpio_pin = getattr(board, f'D{self.pin}')
            self._device = adafruit_dht.DHT22(gpio_pin)
            logger.info('DHT22 açıldı: GPIO %d', self.pin)
            return True
        except Exception as e:
            logger.error('DHT22 hatası: %s', e)
            return False

    def read(self) -> SensorData:
        if not self._device:
            return SensorData()
        try:
            return SensorData(
                temperature=self._device.temperature or 0.0,
                humidity=self._device.humidity or 0.0,
            )
        except RuntimeError:
            # DHT sensörleri bazen checksum hatası verir — normal
            return SensorData()
        except Exception as e:
            logger.warning('DHT22 okuma hatası: %s', e)
            return SensorData()

    def close(self):
        if self._device:
            self._device.exit()


# ───── Mock Sensör ─────

class MockSensorDriver:
    def __init__(self):
        self._base_temp = random.uniform(15, 35)

    def open(self) -> bool:
        logger.info('Mock sensör aktif')
        return True

    def read(self) -> SensorData:
        return SensorData(
            temperature=self._base_temp + random.uniform(-2, 2),
            humidity=random.uniform(30, 80),
            pressure=1013.25 + random.uniform(-5, 5),
        )

    def close(self):
        pass


# ───── Factory ─────

def create_sensor(config):
    sensor_type = config.SENSOR_TYPE.lower()
    if sensor_type == 'bme280':
        return BME280Driver(address=config.BME280_ADDRESS)
    elif sensor_type in ('dht22', 'dht'):
        return DHT22Driver(pin=config.DHT_PIN)
    else:
        return MockSensorDriver()
