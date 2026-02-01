/**
 * DroneCommand AI — Backend API Service
 *
 * Birincil endpoint: registerDrone()
 * Yardımcı: fetchDrones(), fetchLogs(), getSystemStatus()
 *
 * Canlı veri akışı RabbitMQ (Web STOMP) üzerinden yapılır.
 * Bu servis sadece HTTP/REST işlemleri içindir.
 */

import { Drone, LogEntry, DroneStatus } from '../types';
import { API_BASE_URL } from '../constants';

const API_BASE = API_BASE_URL || 'http://localhost:8000/api';

// ─────────────────────────────────────────────
// Generic Fetch Wrapper
// ─────────────────────────────────────────────

async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${endpoint}`;

  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`API Error [${response.status}] ${response.statusText}: ${errorBody}`);
  }

  if (response.status === 204) return null as T;
  return response.json();
}

// ─────────────────────────────────────────────
// Type Mappers
// ─────────────────────────────────────────────

function mapDroneFromApi(raw: any): Drone {
  return {
    id: raw.drone_id || raw.id,
    name: raw.name,
    model: raw.model,
    status: (raw.last_status || raw.status || 'Çevrimdışı') as DroneStatus,
    battery: typeof raw.battery === 'number' ? raw.battery : 100,
    signalQuality: raw.signalQuality ?? raw.signal_quality ?? 100,
    speed: raw.speed ?? 0,
    position: raw.position ?? { x: 0, y: 0 },
    altitude: raw.altitude ?? 0,
    flightPath: raw.flightPath ?? [],
  };
}

function mapLogFromApi(raw: any): LogEntry {
  return {
    id: String(raw.id),
    timestamp: new Date(raw.timestamp),
    source: raw.source,
    message: raw.message,
    type: raw.type ?? raw.log_type ?? 'INFO',
  };
}

// ─────────────────────────────────────────────
// REGISTRATION (Birincil Endpoint)
// ─────────────────────────────────────────────

export interface RegistrationResponse {
  drone_id: string;
  gui_token: string;
  rabbitmq: {
    host: string;
    port: number;
    username: string;
    password: string;
    vhost: string;
  };
  stomp: {
    host: string;
    port: number;
    url: string;
    username: string;
    password: string;
    vhost: string;
  };
  topics: {
    telemetry: string;
    commands: string;
    video: string;
    alerts: string;
  };
  gui_topics: {
    telemetry: string;
    video: string;
    detection: string;
    alerts: string;
    status: string;
  };
  gui_command_destination: string;
}

/**
 * Drone'u sisteme kaydet.
 * GUI token, RabbitMQ bağlantı bilgileri ve topic'leri döner.
 */
export async function registerDrone(
  droneId: string,
  name: string,
  model: string,
): Promise<RegistrationResponse> {
  return apiFetch('/drones/register/', {
    method: 'POST',
    body: JSON.stringify({ drone_id: droneId, name, model }),
  });
}

// ─────────────────────────────────────────────
// SYSTEM
// ─────────────────────────────────────────────

export async function getSystemStatus(): Promise<any> {
  return apiFetch('/status/');
}

export async function checkBackendHealth(): Promise<boolean> {
  try {
    await getSystemStatus();
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────
// DRONES (Read-Only — ilk yükleme için)
// ─────────────────────────────────────────────

export async function fetchDrones(): Promise<Drone[]> {
  const raw = await apiFetch<any[]>('/drones/');
  return (Array.isArray(raw) ? raw : []).map(mapDroneFromApi);
}

export async function fetchDrone(droneId: string): Promise<Drone> {
  const raw = await apiFetch<any>(`/drones/${droneId}/`);
  return mapDroneFromApi(raw);
}

export async function fetchActiveDrones(): Promise<Drone[]> {
  const raw = await apiFetch<any[]>('/drones/active/');
  return (Array.isArray(raw) ? raw : []).map(mapDroneFromApi);
}

export async function fetchDroneConnectionInfo(droneId: string): Promise<any> {
  return apiFetch(`/drones/${droneId}/connection_info/`);
}

// ─────────────────────────────────────────────
// LOGS (Read-Only)
// ─────────────────────────────────────────────

export async function fetchLogs(params?: {
  type?: string;
  droneId?: string;
  limit?: number;
}): Promise<LogEntry[]> {
  const searchParams = new URLSearchParams();
  if (params?.type) searchParams.set('type', params.type);
  if (params?.droneId) searchParams.set('drone_id', params.droneId);
  if (params?.limit) searchParams.set('limit', String(params.limit));

  const query = searchParams.toString();
  const raw = await apiFetch<any>(`/logs/${query ? `?${query}` : ''}`);
  const results = raw.results ?? raw;
  return (Array.isArray(results) ? results : []).map(mapLogFromApi);
}

export async function createLog(
  source: string,
  message: string,
  logType: 'INFO' | 'WARNING' | 'ALERT' | 'ACTION' = 'INFO',
  droneId?: string,
): Promise<LogEntry> {
  const raw = await apiFetch<any>('/logs/', {
    method: 'POST',
    body: JSON.stringify({
      source,
      message,
      log_type: logType,
      drone_id: droneId ?? '',
    }),
  });
  return mapLogFromApi(raw);
}

export async function fetchDetections(): Promise<LogEntry[]> {
  const raw = await apiFetch<any[]>('/logs/detections/');
  return (Array.isArray(raw) ? raw : []).map(mapLogFromApi);
}

export async function fetchAlerts(): Promise<LogEntry[]> {
  const raw = await apiFetch<any[]>('/logs/alerts/');
  return (Array.isArray(raw) ? raw : []).map(mapLogFromApi);
}

// ─────────────────────────────────────────────
// SCAN SESSIONS (Read-Only)
// ─────────────────────────────────────────────

export async function fetchActiveScans(): Promise<any[]> {
  return apiFetch('/scans/active/');
}
