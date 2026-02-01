# DroneCommand AI — Raspberry Pi Drone İstemcisi

## Mimari

```
┌─────────────────────────────────────────────────────┐
│                  RASPBERRY PI                        │
│                                                     │
│  ┌─────────┐  ┌──────┐  ┌──────┐  ┌──────────┐    │
│  │PiCamera2│  │ GPS  │  │BME280│  │  Komut   │    │
│  │ /USB    │  │ NEO  │  │/DHT22│  │ İşleyici │    │
│  └────┬────┘  └──┬───┘  └──┬───┘  └────▲─────┘    │
│       │          │         │            │           │
│  ┌────▼──────────▼─────────▼────────────┤           │
│  │         drone_client.py              │           │
│  │    (Telemetri + Video Döngüsü)       │           │
│  └──────────────┬───────────────────────┘           │
│                 │ AMQP (pika)                       │
└─────────────────┼───────────────────────────────────┘
                  │
          ┌───────▼───────┐
          │   RabbitMQ    │ ←── Sunucu
          └───────┬───────┘
                  │
          ┌───────▼───────┐
          │    Backend    │ ←── Django + YOLO
          │   Consumer    │
          └───────┬───────┘
                  │ Web STOMP
          ┌───────▼───────┐
          │  Frontend GUI │ ←── Tarayıcı
          └───────────────┘
```

## Hızlı Başlangıç

### 1. Dosyaları Pi'ye Kopyala

```bash
scp -r raspberry_pi/ pi@RASPBERRY_IP:~/dronecommand/
```

### 2. Kurulum

```bash
ssh pi@RASPBERRY_IP
cd ~/dronecommand
chmod +x setup.sh
./setup.sh
```

### 3. Yapılandırma

```bash
nano config/.env
```

**Minimum yapılandırma** — sadece bu 3 satırı değiştirin:

```env
DRONE_ID=D-01
API_BASE_URL=http://SUNUCU_IP:8000/api
RABBITMQ_HOST=SUNUCU_IP
```

### 4. Test (Sensör Olmadan)

```bash
source venv/bin/activate
python drone_client.py --camera test --gps mock --sensor mock
```

### 5. Gerçek Sensörlerle

```bash
python drone_client.py --camera picamera2 --gps gpsd --sensor bme280
```

### 6. Servis Olarak Çalıştırma

```bash
sudo systemctl start dronecommand
sudo systemctl status dronecommand
sudo journalctl -u dronecommand -f    # Canlı log
```

## Dosya Yapısı

```
raspberry_pi/
├── drone_client.py          # Ana giriş noktası
├── config/
│   ├── __init__.py          # Config sınıfı (.env okuyucu)
│   └── .env                 # Yapılandırma dosyası
├── sensors/
│   ├── __init__.py
│   ├── camera.py            # PiCamera2, USB, Test
│   ├── gps.py               # gpsd, Serial NMEA, Mock
│   └── environment.py       # BME280, DHT22, Mock
├── services/
│   ├── __init__.py
│   ├── api_client.py        # Backend REST API istemcisi
│   └── rabbitmq_client.py   # AMQP telemetri/video/komut
├── requirements.txt
├── setup.sh                 # Tek komutla kurulum
├── dronecommand.service     # systemd servis dosyası
└── README.md
```

## Donanım Bağlantıları

### Pi Camera Modülü
- CSI port üzerinden bağlanır
- `raspi-config → Interface Options → Legacy Camera → Enable`

### GPS (NEO-6M/NEO-7M)
```
GPS VCC  → Pi 3.3V (Pin 1)
GPS GND  → Pi GND  (Pin 6)
GPS TX   → Pi RX   (Pin 10 / GPIO 15)
GPS RX   → Pi TX   (Pin 8  / GPIO 14)
```

UART etkinleştirme:
```bash
sudo raspi-config   # Interface Options → Serial Port
# "login shell over serial" → No
# "serial port hardware" → Yes
sudo apt install gpsd gpsd-clients
sudo systemctl enable gpsd
```

### BME280 (I2C)
```
BME VCC  → Pi 3.3V (Pin 1)
BME GND  → Pi GND  (Pin 9)
BME SDA  → Pi SDA  (Pin 3 / GPIO 2)
BME SCL  → Pi SCL  (Pin 5 / GPIO 3)
```

I2C kontrol: `sudo i2cdetect -y 1`

### DHT22
```
DHT VCC  → Pi 3.3V
DHT GND  → Pi GND
DHT DATA → Pi GPIO 4 (Pin 7)
```

## CLI Argümanları

```
python drone_client.py [seçenekler]

  --drone-id ID        Drone ID (varsayılan: .env'den)
  --name NAME          Drone adı
  --model MODEL        Drone modeli
  --api-url URL        Backend API URL
  --rmq-host HOST      RabbitMQ sunucu
  --rmq-port PORT      RabbitMQ port
  --camera TYPE        picamera2 | usb | test
  --gps TYPE           gpsd | serial | mock
  --sensor TYPE        bme280 | dht22 | mock
  --log-level LEVEL    DEBUG | INFO | WARNING | ERROR
```

## Çoklu Drone

Aynı Pi'de birden fazla drone çalıştırmak için:

```bash
# Terminal 1
python drone_client.py --drone-id D-01 --name "Kartal-1"

# Terminal 2
python drone_client.py --drone-id D-02 --name "Kartal-2" --camera test
```

## Sorun Giderme

| Sorun | Çözüm |
|-------|-------|
| `Backend bekleniyor...` | Sunucuda `python manage.py runserver 0.0.0.0:8000` çalıştırın |
| `RabbitMQ bağlantı hatası` | `sudo systemctl status rabbitmq-server`, port 5672 açık mı? |
| `PiCamera2 açılamadı` | `libcamera-hello` ile test edin, kamera kablosu |
| `I2C cihaz bulunamadı` | `sudo i2cdetect -y 1`, kablo bağlantıları |
| `GPS fix yok` | Açık alanda deneyin, LED yanıp sönmeli |
