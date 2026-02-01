export interface Coordinates {
  x: number;
  y: number;
}

export enum DroneStatus {
  IDLE = 'Beklemede',
  PATROLLING = 'Devriyede',
  RETURNING = 'Dönüyor',
  OFFLINE = 'Çevrimdışı',
  HOVERING = 'Havada Sabit',
  FOLLOWING_PATH = 'Rota Takibi',
  SCANNING = 'Taramada',
}

export interface Drone {
  id: string;
  name: string;
  model: string;
  status: DroneStatus;
  battery: number;
  signalQuality: number; // 0-100
  speed: number; // km/h
  position: Coordinates;
  altitude: number; // meters
  flightPath: Coordinates[];
}

export interface LandCover {
  type: string;
  percentage: number;
  color: string;
}

export interface GridCellData {
  id: string;
  x: number;
  y: number;
  lat: number;
  lng: number;
  // Atmospheric
  temperature: number;
  humidity: number;
  windSpeed: number;
  windDirection: string;
  gustSpeed: number;
  weatherCondition: string;
  precipitation: number;
  pressure: number;
  evaporation: string;

  // Surface & Topology
  topology: string;
  elevationMin: number;
  elevationMax: number;
  avgSlope: number;
  dominantAspect: string;

  // Advanced Analysis
  landCover: LandCover[];
  thermalAnomaly: {
    score: number;
    level: 'DÜŞÜK' | 'ORTA' | 'YÜKSEK' | 'KRİTİK';
  };

  isHazardous: boolean;
}

export interface AnalysisResult {
  isLoading: boolean;
  text: string | null;
}

export type WaveformType = 'SINE' | 'SQUARE' | 'SAWTOOTH';

export interface LogEntry {
  id: string;
  timestamp: Date;
  source: string;
  message: string;
  type: 'INFO' | 'WARNING' | 'ALERT' | 'ACTION' | 'FIRE' | 'SMOKE';
}

// ── Detection Types ──────────────────────────

export interface Detection {
  class: 'fire' | 'smoke';
  confidence: number;
  bbox: number[];
  timestamp: string;
}

export interface ScanSession {
  session_id: string;
  drone_id: string;
  is_active: boolean;
  total_frames_processed: number;
  fire_detections: number;
  smoke_detections: number;
}
