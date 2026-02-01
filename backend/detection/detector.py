"""
YOLO Fire/Smoke Detection Module
Alev ve duman tespiti için YOLOv8 modeli
"""
import os
import cv2
import numpy as np
import base64
from datetime import datetime
from django.conf import settings
from pathlib import Path
import threading


class FireSmokeDetector:
    """
    YOLOv8 tabanlı yangın ve duman tespit sistemi
    Singleton pattern ile tek instance
    """
    
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        
        self.config = settings.YOLO_CONFIG
        self.model = None
        self.is_loaded = False
        self.classes = self.config['CLASSES']
        
        # Detection colors
        self.colors = {
            'fire': (0, 0, 255),    # Red
            'smoke': (128, 128, 128) # Gray
        }
        
        self._initialized = True
    
    @classmethod
    def get_instance(cls):
        """Singleton instance al"""
        return cls()
    
    def load_model(self):
        """YOLO modelini yükle"""
        if self.is_loaded:
            return True
        
        try:
            from ultralytics import YOLO
            
            model_path = self.config['MODEL_PATH']
            
            # Model dosyası yoksa pretrained model kullan
            if not os.path.exists(model_path):
                print(f"Custom model not found at {model_path}")
                print("Using pretrained YOLOv8n model. For fire/smoke detection, train a custom model.")
                # Pretrained model (genel nesne tespiti)
                self.model = YOLO('yolov8n.pt')
                # Not: Gerçek kullanımda fire/smoke için eğitilmiş model gerekli
            else:
                self.model = YOLO(model_path)
            
            # GPU/CPU seçimi
            self.device = self.config['DEVICE']
            
            self.is_loaded = True
            print(f"YOLO model loaded on {self.device}")
            return True
            
        except Exception as e:
            print(f"Model loading error: {e}")
            return False
    
    def detect(self, frame, confidence_threshold=None):
        """
        Frame üzerinde yangın/duman tespiti yap
        
        Args:
            frame: numpy array (BGR format) veya base64 string
            confidence_threshold: Min güven skoru (0-1)
        
        Returns:
            dict: {
                'detections': [...],
                'annotated_frame': base64_string,
                'has_fire': bool,
                'has_smoke': bool
            }
        """
        if not self.is_loaded:
            if not self.load_model():
                return {'detections': [], 'error': 'Model not loaded'}
        
        conf_thresh = confidence_threshold or self.config['CONFIDENCE_THRESHOLD']
        
        # Base64 ise decode et
        if isinstance(frame, str):
            frame = self._decode_base64(frame)
        
        if frame is None:
            return {'detections': [], 'error': 'Invalid frame'}
        
        try:
            # YOLO inference
            results = self.model(
                frame,
                conf=conf_thresh,
                iou=self.config['IOU_THRESHOLD'],
                device=self.device,
                verbose=False
            )
            
            detections = []
            has_fire = False
            has_smoke = False
            
            for result in results:
                boxes = result.boxes
                
                if boxes is not None:
                    for box in boxes:
                        cls_id = int(box.cls[0])
                        conf = float(box.conf[0])
                        xyxy = box.xyxy[0].cpu().numpy()
                        
                        # Class name
                        class_name = result.names[cls_id]
                        
                        # Fire/smoke kontrolü (custom model için)
                        # Pretrained modelde bu sınıflar olmayacak
                        if class_name.lower() in ['fire', 'flame', 'yangın', 'alev']:
                            class_name = 'fire'
                            has_fire = True
                        elif class_name.lower() in ['smoke', 'duman']:
                            class_name = 'smoke'
                            has_smoke = True
                        
                        detections.append({
                            'class': class_name,
                            'confidence': conf,
                            'bbox': xyxy.tolist(),
                            'timestamp': datetime.now().isoformat()
                        })
            
            # Frame'e çizim yap
            annotated_frame = self._annotate_frame(frame, detections)
            
            return {
                'detections': detections,
                'annotated_frame': self._encode_base64(annotated_frame),
                'has_fire': has_fire,
                'has_smoke': has_smoke,
                'frame_shape': frame.shape[:2]
            }
            
        except Exception as e:
            print(f"Detection error: {e}")
            return {'detections': [], 'error': str(e)}
    
    def _annotate_frame(self, frame, detections):
        """Frame üzerine detection sonuçlarını çiz"""
        annotated = frame.copy()
        
        for det in detections:
            bbox = det['bbox']
            class_name = det['class']
            conf = det['confidence']
            
            # Color
            color = self.colors.get(class_name, (0, 255, 0))
            
            # Box
            x1, y1, x2, y2 = map(int, bbox)
            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
            
            # Label
            label = f"{class_name.upper()}: {conf:.2%}"
            label_size, _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
            
            # Label background
            cv2.rectangle(
                annotated,
                (x1, y1 - label_size[1] - 10),
                (x1 + label_size[0], y1),
                color,
                -1
            )
            
            # Label text
            cv2.putText(
                annotated,
                label,
                (x1, y1 - 5),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (255, 255, 255),
                2
            )
        
        # Timestamp
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cv2.putText(
            annotated,
            timestamp,
            (10, 30),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (255, 255, 255),
            2
        )
        
        return annotated
    
    def _decode_base64(self, base64_string):
        """Base64 string'i numpy array'e çevir"""
        try:
            # Data URL prefix'i varsa kaldır
            if ',' in base64_string:
                base64_string = base64_string.split(',')[1]
            
            img_data = base64.b64decode(base64_string)
            nparr = np.frombuffer(img_data, np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            return frame
        except Exception as e:
            print(f"Base64 decode error: {e}")
            return None
    
    def _encode_base64(self, frame):
        """Numpy array'i base64 string'e çevir"""
        try:
            _, buffer = cv2.imencode(
                '.jpg',
                frame,
                [cv2.IMWRITE_JPEG_QUALITY, settings.VIDEO_CONFIG['JPEG_QUALITY']]
            )
            return base64.b64encode(buffer).decode('utf-8')
        except Exception as e:
            print(f"Base64 encode error: {e}")
            return None
    
    def process_video_frame(self, drone_id, frame_data, session_id=None):
        """
        Video frame'i işle ve sonuçları kaydet
        
        Args:
            drone_id: Drone ID
            frame_data: Base64 encoded frame
            session_id: Tarama oturumu ID (opsiyonel)
        
        Returns:
            dict: Detection sonuçları
        """
        result = self.detect(frame_data)
        
        # Fire veya smoke tespit edildiyse log'a kaydet
        if result.get('has_fire') or result.get('has_smoke'):
            self._log_detection(drone_id, result, session_id)
        
        return result
    
    def _log_detection(self, drone_id, result, session_id=None):
        """Tespit sonucunu veritabanına kaydet"""
        from api.models import Drone, LogEntry, ScanSession, LogType
        
        try:
            drone = Drone.objects.get(drone_id=drone_id)
            
            for det in result['detections']:
                if det['class'] in ['fire', 'smoke']:
                    log_type = LogType.FIRE_DETECTED if det['class'] == 'fire' else LogType.SMOKE_DETECTED
                    
                    LogEntry.objects.create(
                        source=drone.name,
                        message=f"{det['class'].upper()} TESPİT EDİLDİ! Güven: {det['confidence']:.2%}",
                        log_type=log_type,
                        drone=drone,
                        confidence=det['confidence'],
                        detection_class=det['class'],
                        bbox=det['bbox']
                    )
            
            # Session istatistiklerini güncelle
            if session_id:
                try:
                    session = ScanSession.objects.get(session_id=session_id)
                    session.total_frames_processed += 1
                    if result.get('has_fire'):
                        session.fire_detections += 1
                    if result.get('has_smoke'):
                        session.smoke_detections += 1
                    session.save()
                except ScanSession.DoesNotExist:
                    pass
                    
        except Drone.DoesNotExist:
            pass


class DetectionService:
    """
    Detection işlemlerini yöneten servis
    RabbitMQ'dan gelen frame'leri işler
    """
    
    def __init__(self):
        self.detector = FireSmokeDetector.get_instance()
        self.active_sessions = {}
    
    def start_detection(self, drone_id, session_id):
        """Drone için detection başlat"""
        self.active_sessions[drone_id] = {
            'session_id': session_id,
            'is_active': True,
            'frames_processed': 0
        }
        return True
    
    def stop_detection(self, drone_id):
        """Drone için detection durdur"""
        if drone_id in self.active_sessions:
            self.active_sessions[drone_id]['is_active'] = False
            del self.active_sessions[drone_id]
        return True
    
    def is_active(self, drone_id):
        """Detection aktif mi?"""
        return drone_id in self.active_sessions and self.active_sessions[drone_id]['is_active']
    
    def process_frame(self, drone_id, frame_data):
        """Frame işle"""
        if not self.is_active(drone_id):
            return None
        
        session_id = self.active_sessions[drone_id]['session_id']
        result = self.detector.process_video_frame(drone_id, frame_data, session_id)
        
        self.active_sessions[drone_id]['frames_processed'] += 1
        
        return result
