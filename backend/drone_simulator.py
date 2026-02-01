#!/usr/bin/env python
"""
DroneCommand AI — Drone Simulator

Akış:
  1. API'den drone'u kaydet → GUI token + topic'ler
  2. RabbitMQ'ya AMQP ile bağlan
  3. Telemetri + video frame gönder
  4. Komut queue'sunu dinle
"""
import pika
import json
import base64
import time
import random
import argparse
import requests
import cv2
import numpy as np
from datetime import datetime


class DroneSimulator:
    """Test amaçlı drone simülatörü — API kayıt + RabbitMQ iletişim."""

    def __init__(self, drone_id, name, model, api_base, rmq_host, rmq_port, rmq_user, rmq_pass):
        self.drone_id = drone_id
        self.name = name
        self.model = model
        self.api_base = api_base

        # Position & state
        self.position = {'x': random.randint(0, 7), 'y': random.randint(0, 7)}
        self.battery = 100.0
        self.altitude = 100
        self.speed = 0
        self.status = 'Beklemede'

        # ── Step 1: API'den kayıt ol ──
        print(f"[1/3] Drone kaydediliyor: {drone_id}")
        reg = self._register()
        self.gui_token = reg['gui_token']
        self.topics = reg['topics']
        print(f"  ✓ GUI Token: {self.gui_token}")
        print(f"  ✓ Topics: {json.dumps(self.topics, indent=2)}")

        # ── Step 2: RabbitMQ bağlantısı ──
        print(f"[2/3] RabbitMQ bağlanılıyor: {rmq_host}:{rmq_port}")
        credentials = pika.PlainCredentials(rmq_user, rmq_pass)
        parameters = pika.ConnectionParameters(
            host=rmq_host,
            port=rmq_port,
            credentials=credentials,
        )
        self.connection = pika.BlockingConnection(parameters)
        self.channel = self.connection.channel()
        print(f"  ✓ Bağlantı kuruldu")

        # ── Step 3: Komut queue dinle ──
        print(f"[3/3] Komut queue hazırlanıyor")
        self._setup_command_listener()
        print(f"  ✓ Hazır!\n")

    def _register(self) -> dict:
        """API üzerinden drone'u kaydet."""
        resp = requests.post(
            f"{self.api_base}/drones/register/",
            json={'drone_id': self.drone_id, 'name': self.name, 'model': self.model},
        )
        resp.raise_for_status()
        return resp.json()

    def _setup_command_listener(self):
        """Komut queue'sunu oluştur."""
        queue_name = f'commands.{self.drone_id}'
        try:
            self.channel.queue_declare(queue=queue_name, durable=True)
            self.channel.queue_bind(
                exchange='drone.commands',
                queue=queue_name,
                routing_key=self.topics['commands'],
            )
        except Exception:
            pass

    def send_telemetry(self):
        """Telemetri gönder."""
        if self.status != 'Beklemede':
            self.battery = max(0, self.battery - 0.1)

        if self.status == 'Devriyede':
            self.position['x'] = (self.position['x'] + random.choice([-1, 0, 1])) % 8
            self.position['y'] = (self.position['y'] + random.choice([-1, 0, 1])) % 8
            self.speed = random.randint(30, 60)
        else:
            self.speed = 0

        message = {
            'type': 'TELEMETRY',
            'timestamp': datetime.now().isoformat(),
            'drone_id': self.drone_id,
            'data': {
                'position': self.position,
                'battery': round(self.battery, 1),
                'altitude': self.altitude,
                'speed': self.speed,
                'status': self.status,
                'signal_quality': random.randint(80, 100),
            },
        }

        self.channel.basic_publish(
            exchange='drone.telemetry',
            routing_key=self.topics['telemetry'],
            body=json.dumps(message),
        )
        return message

    def generate_test_frame(self, with_fire=False, with_smoke=False):
        """Test video frame oluştur."""
        frame = np.zeros((480, 640, 3), dtype=np.uint8)

        # Yeşil gradient — orman
        for y in range(480):
            green = int(50 + (y / 480) * 100)
            frame[y, :] = [0, green, 0]

        # Grid çizgileri
        for i in range(0, 640, 80):
            cv2.line(frame, (i, 0), (i, 480), (0, 100, 0), 1)
        for i in range(0, 480, 60):
            cv2.line(frame, (0, i), (640, i), (0, 100, 0), 1)

        # Yangın
        if with_fire:
            fx, fy = random.randint(100, 500), random.randint(100, 380)
            cv2.ellipse(frame, (fx, fy), (60, 40), 0, 0, 360, (0, 100, 255), -1)
            cv2.ellipse(frame, (fx, fy - 10), (40, 30), 0, 0, 360, (0, 165, 255), -1)
            cv2.ellipse(frame, (fx, fy - 20), (20, 15), 0, 0, 360, (0, 255, 255), -1)

        # Duman
        if with_smoke:
            sx, sy = random.randint(100, 500), random.randint(50, 200)
            for i in range(5):
                dx, dy = random.randint(-30, 30), random.randint(-20, 20)
                cv2.ellipse(frame, (sx + dx, sy + dy),
                            (50 + i * 10, 30 + i * 5), 0, 0, 360, (128, 128, 128), -1)

        # Overlay bilgileri
        cv2.putText(frame, f"DRONE: {self.drone_id}", (10, 30),
                     cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        cv2.putText(frame, f"POS: [{self.position['x']},{self.position['y']}]", (10, 60),
                     cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        cv2.putText(frame, f"ALT: {self.altitude}m", (10, 85),
                     cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        cv2.putText(frame, datetime.now().strftime("%H:%M:%S"), (540, 30),
                     cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)

        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        return base64.b64encode(buffer).decode('utf-8')

    def send_video_frame(self, frame_number, with_fire=False, with_smoke=False):
        """Video frame gönder."""
        frame_data = self.generate_test_frame(with_fire, with_smoke)

        message = {
            'type': 'VIDEO_FRAME',
            'timestamp': datetime.now().isoformat(),
            'drone_id': self.drone_id,
            'frame_number': frame_number,
            'data': frame_data,
        }

        self.channel.basic_publish(
            exchange='drone.video',
            routing_key=self.topics['video'],
            body=json.dumps(message),
        )
        return True

    def run(self, telemetry_interval=1.0, video_fps=10, fire_probability=0.05, smoke_probability=0.05):
        """Simülasyonu çalıştır."""
        print(f"{'═' * 50}")
        print(f"  Drone Simülasyonu Başlıyor")
        print(f"  ID: {self.drone_id}")
        print(f"  Telemetri aralığı: {telemetry_interval}s")
        print(f"  Video FPS: {video_fps}")
        print(f"  Yangın olasılığı: {fire_probability}")
        print(f"  Duman olasılığı: {smoke_probability}")
        print(f"{'═' * 50}\n")

        self.status = 'Devriyede'
        frame_number = 0
        last_telemetry = 0
        video_interval = 1.0 / video_fps

        try:
            while True:
                current_time = time.time()

                if current_time - last_telemetry >= telemetry_interval:
                    telemetry = self.send_telemetry()
                    print(f"[TEL] Pos: {telemetry['data']['position']}, Bat: {telemetry['data']['battery']}%")
                    last_telemetry = current_time

                with_fire = random.random() < fire_probability
                with_smoke = random.random() < smoke_probability

                self.send_video_frame(frame_number, with_fire, with_smoke)

                if with_fire:
                    print(f"[VID] Frame {frame_number} — 🔥 YANGIN SİMÜLASYONU")
                elif with_smoke:
                    print(f"[VID] Frame {frame_number} — 💨 DUMAN SİMÜLASYONU")

                frame_number += 1
                time.sleep(video_interval)

        except KeyboardInterrupt:
            print("\nSimülasyon durduruluyor...")
        finally:
            self.connection.close()


def main():
    parser = argparse.ArgumentParser(description='DroneCommand Drone Simulator')
    parser.add_argument('--drone-id', default='D-01', help='Drone ID')
    parser.add_argument('--name', default='Kartal-1', help='Drone adı')
    parser.add_argument('--model', default='DJI Matrice 300', help='Drone modeli')
    parser.add_argument('--api-base', default='http://localhost:8000/api', help='Backend API URL')
    parser.add_argument('--rmq-host', default='localhost', help='RabbitMQ host')
    parser.add_argument('--rmq-port', type=int, default=5672, help='RabbitMQ AMQP port')
    parser.add_argument('--rmq-user', default='guest', help='RabbitMQ kullanıcı')
    parser.add_argument('--rmq-pass', default='guest', help='RabbitMQ şifre')
    parser.add_argument('--telemetry-interval', type=float, default=1.0)
    parser.add_argument('--video-fps', type=int, default=10)
    parser.add_argument('--fire-prob', type=float, default=0.05)
    parser.add_argument('--smoke-prob', type=float, default=0.05)

    args = parser.parse_args()

    simulator = DroneSimulator(
        drone_id=args.drone_id,
        name=args.name,
        model=args.model,
        api_base=args.api_base,
        rmq_host=args.rmq_host,
        rmq_port=args.rmq_port,
        rmq_user=args.rmq_user,
        rmq_pass=args.rmq_pass,
    )

    simulator.run(
        telemetry_interval=args.telemetry_interval,
        video_fps=args.video_fps,
        fire_probability=args.fire_prob,
        smoke_probability=args.smoke_prob,
    )


if __name__ == '__main__':
    main()
