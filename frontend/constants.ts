import { Drone, DroneStatus } from './types';

// ─────────────────────────────────────────────
// API Configuration (tüm değerler env'den)
// ─────────────────────────────────────────────
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
if (!API_BASE_URL) {
  console.warn('[CONFIG] VITE_API_BASE_URL tanımlı değil. .env.local dosyasını kontrol edin.');
}

// Backend sync interval (ms)
export const BACKEND_SYNC_INTERVAL = 10_000;

// ─────────────────────────────────────────────
// External Service Keys (env-only)
// ─────────────────────────────────────────────
export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
if (!GOOGLE_MAPS_API_KEY) {
  console.warn('[CONFIG] VITE_GOOGLE_MAPS_API_KEY tanımlı değil. Harita çalışmayacak.');
}

export const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY || '';

// ─────────────────────────────────────────────
// Map Settings
// ─────────────────────────────────────────────
export const MAP_CENTER = { lat: 39.9030, lng: 32.7800 };
export const INITIAL_GRID_ORIGIN = { lat: 39.9100, lng: 32.7700 };
export const CELL_SIZE_DEG = 0.003;
export const GRID_SIZE = 8;

// ─────────────────────────────────────────────
// Grid Cell Generator Reference Data
// (Deterministik grid üretimi için sabit referans)
// ─────────────────────────────────────────────
export const TOPOLOGY_TYPES = [
  "Düz Ovalık",
  "Engebeli Arazi",
  "Yoğun Orman",
  "Kentsel Alan",
  "Su Birikintisi",
  "Dağlık Bölge",
];

export const WEATHER_CONDITIONS = [
  "Açık Güneşli",
  "Parçalı Bulutlu",
  "Kapalı",
  "Hafif Yağmurlu",
  "Sağanak Yağışlı",
  "Sisli",
  "Fırtına",
];

// ─────────────────────────────────────────────
// Dark Mode Map Style
// ─────────────────────────────────────────────
export const MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d59563" }],
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d59563" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#263c3f" }],
  },
  {
    featureType: "poi.park",
    elementType: "labels.text.fill",
    stylers: [{ color: "#6b9a76" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#38414e" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#212a37" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#9ca5b3" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#746855" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [{ color: "#1f2835" }],
  },
  {
    featureType: "road.highway",
    elementType: "labels.text.fill",
    stylers: [{ color: "#f3d19c" }],
  },
  {
    featureType: "transit",
    elementType: "geometry",
    stylers: [{ color: "#2f3948" }],
  },
  {
    featureType: "transit.station",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d59563" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#17263c" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#515c6d" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.stroke",
    stylers: [{ color: "#17263c" }],
  },
];
