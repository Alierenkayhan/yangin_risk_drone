#!/bin/bash
# ═══════════════════════════════════════════════
# DroneCommand AI — Raspberry Pi Kurulum Scripti
# Kullanım: chmod +x setup.sh && ./setup.sh
# ═══════════════════════════════════════════════

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

INSTALL_DIR="$HOME/dronecommand"
CURRENT_USER=$(whoami)

echo -e "${GREEN}"
echo "╔══════════════════════════════════════════════╗"
echo "║  DroneCommand AI — Raspberry Pi Kurulumu     ║"
echo "╚══════════════════════════════════════════════╝"
echo -e "${NC}"

# ── 1. Sistem Paketleri ──────────────────────
echo -e "${YELLOW}[1/6] Sistem paketleri güncelleniyor...${NC}"
sudo apt update
sudo apt install -y \
    python3 python3-pip python3-venv \
    python3-opencv \
    gpsd gpsd-clients \
    i2c-tools

# libatlas: Bookworm'da adı değişti
sudo apt install -y libatlas-base-dev 2>/dev/null \
    || sudo apt install -y libatlas3-base 2>/dev/null \
    || sudo apt install -y libopenblas-dev 2>/dev/null \
    || echo -e "${YELLOW}Atlas/BLAS kütüphanesi bulunamadı — numpy pip ile kurulacak${NC}"

# PiCamera2 (Raspberry Pi OS'ta önceden kurulu olabilir)
if ! python3 -c "import picamera2" 2>/dev/null; then
    echo -e "${YELLOW}PiCamera2 kuruluyor...${NC}"
    sudo apt install -y python3-picamera2 || true
fi

# ── 2. Proje Dizini ─────────────────────────
echo -e "${YELLOW}[2/6] Proje dizini hazırlanıyor...${NC}"
mkdir -p "$INSTALL_DIR"
cp -r "$(dirname "$0")"/* "$INSTALL_DIR/"

# ── 3. Virtual Environment ───────────────────
echo -e "${YELLOW}[3/6] Python sanal ortamı oluşturuluyor...${NC}"
cd "$INSTALL_DIR"
python3 -m venv venv --system-site-packages
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# ── 4. I2C Etkinleştirme (BME280 için) ───────
echo -e "${YELLOW}[4/6] I2C kontrolü...${NC}"
if ! grep -q "^dtparam=i2c_arm=on" /boot/config.txt 2>/dev/null && \
   ! grep -q "^dtparam=i2c_arm=on" /boot/firmware/config.txt 2>/dev/null; then
    echo -e "${YELLOW}I2C etkinleştiriliyor... (yeniden başlatma gerekebilir)${NC}"
    sudo raspi-config nonint do_i2c 0 2>/dev/null || true
fi

# ── 5. Kamera Etkinleştirme ──────────────────
echo -e "${YELLOW}[5/6] Kamera kontrolü...${NC}"
if ! vcgencmd get_camera 2>/dev/null | grep -q "detected=1"; then
    echo -e "${YELLOW}Kamera henüz algılanmadı. raspi-config ile etkinleştirin:${NC}"
    echo "  sudo raspi-config → Interface Options → Legacy Camera → Enable"
fi

# ── 6. Systemd Servis ────────────────────────
echo -e "${YELLOW}[6/6] Systemd servisi kuruluyor...${NC}"
sed -e "s|__USER__|$CURRENT_USER|g" \
    -e "s|__INSTALL_DIR__|$INSTALL_DIR|g" \
    "$INSTALL_DIR/dronecommand.service" | sudo tee /etc/systemd/system/dronecommand.service > /dev/null
sudo systemctl daemon-reload
sudo systemctl enable dronecommand.service

# ── Log Dizini ───────────────────────────────
sudo mkdir -p /var/log/dronecommand
sudo chown "$CURRENT_USER":"$CURRENT_USER" /var/log/dronecommand

# ── Yapılandırma Hatırlatma ──────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗"
echo "║  ✓ Kurulum Tamamlandı!                       ║"
echo "╠══════════════════════════════════════════════╣"
echo "║                                              ║"
echo "║  Yapılandırma:                               ║"
echo "║    nano $INSTALL_DIR/config/.env              ║"
echo "║                                              ║"
echo "║  Önemli ayarlar:                             ║"
echo "║    DRONE_ID=D-01                             ║"
echo "║    API_BASE_URL=http://SUNUCU_IP:8000/api    ║"
echo "║    RABBITMQ_HOST=SUNUCU_IP                   ║"
echo "║    CAMERA_TYPE=picamera2                     ║"
echo "║    GPS_TYPE=gpsd                             ║"
echo "║    SENSOR_TYPE=bme280                        ║"
echo "║                                              ║"
echo "║  Manuel başlatma:                            ║"
echo "║    cd $INSTALL_DIR                            ║"
echo "║    source venv/bin/activate                  ║"
echo "║    python drone_client.py                    ║"
echo "║                                              ║"
echo "║  Servis olarak başlatma:                     ║"
echo "║    sudo systemctl start dronecommand         ║"
echo "║    sudo journalctl -u dronecommand -f        ║"
echo "║                                              ║"
echo "║  Test modu (sensör olmadan):                 ║"
echo "║    python drone_client.py \\                  ║"
echo "║      --camera test --gps mock --sensor mock  ║"
echo "║                                              ║"
echo -e "╚══════════════════════════════════════════════╝${NC}"
