/**
 * DroneCommand AI — Grid Cell Data Generator
 * Deterministik pseudo-random veri üretimi.
 * Backend'den veri gelmediğinde fallback olarak kullanılır.
 */
import { GridCellData, LandCover } from '../types';
import { GRID_SIZE, TOPOLOGY_TYPES, WEATHER_CONDITIONS } from '../constants';

/** Seed-tabanlı deterministik random (sin hash) */
const seededRandom = (seed: number): number => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

/** Topoğrafya tipine göre yükseklik parametreleri */
const ELEVATION_PARAMS: Record<string, { base: number; variance: number; slope: number }> = {
  'Dağlık': { base: 1200, variance: 400, slope: 35 },
  'Engebeli': { base: 950, variance: 150, slope: 18 },
  'Düz': { base: 850, variance: 20, slope: 2 },
  'Su': { base: 780, variance: 5, slope: 0 },
};

/** Topoğrafya → arazi örtüsü eşleştirmesi */
const LAND_COVER_TEMPLATES: Record<string, [string, string, string, string]> = {
  'Orman': ['Karışık Orman', '#166534', 'Çalılık', '#84cc16'],
  'Kentsel': ['Yerleşim', '#94a3b8', 'Yol/Altyapı', '#475569'],
  'Su': ['Su Yüzeyi', '#0ea5e9', 'Sazlık', '#14b8a6'],
};
const DEFAULT_LAND_COVER: [string, string, string, string] = ['Otlak', '#ca8a04', 'Çıplak Kaya', '#57534e'];

const ASPECTS = ['Kuzey', 'Kuzeydoğu', 'Doğu', 'Güneydoğu', 'Güney', 'Güneybatı', 'Batı', 'Kuzeybatı'];
const WIND_DIRS = ['K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB'];

function resolveElevation(topology: string, seed: number) {
  const match = Object.entries(ELEVATION_PARAMS).find(([key]) => topology.includes(key));
  const params = match ? match[1] : { base: 800, variance: 50, slope: 5 };

  const min = Math.floor(params.base + seededRandom(seed + 10) * params.variance);
  const max = min + Math.floor(seededRandom(seed + 11) * (params.variance / 2) + 10);
  const slope = Math.max(0, Math.floor(params.slope + (seededRandom(seed + 12) * 10 - 5)));

  return { elevationMin: min, elevationMax: max, avgSlope: slope };
}

function resolveLandCover(topology: string, seed: number): LandCover[] {
  const match = Object.entries(LAND_COVER_TEMPLATES).find(([key]) => topology.includes(key));
  const [primary, pColor, secondary, sColor] = match ? match[1] : DEFAULT_LAND_COVER;

  const basePercent = match
    ? (topology.includes('Su') ? 80 : topology.includes('Kentsel') ? 50 : 60)
    : 40;

  const percentage = basePercent + Math.floor(seededRandom(seed + 14) * (100 - basePercent - 10));
  return [
    { type: primary, percentage, color: pColor },
    { type: secondary, percentage: 100 - percentage, color: sColor },
  ];
}

function resolveThermal(seed: number) {
  const score = Math.floor(seededRandom(seed + 15) * 100);
  let level: GridCellData['thermalAnomaly']['level'] = 'DÜŞÜK';
  if (score > 85) level = 'KRİTİK';
  else if (score > 65) level = 'YÜKSEK';
  else if (score > 40) level = 'ORTA';
  return { score, level };
}

function resolvePrecipitation(weatherCondition: string, seed: number): number {
  if (weatherCondition.includes('Yağmur') || weatherCondition.includes('Sağanak')) {
    return Math.floor(seededRandom(seed + 6) * 40) + 5;
  }
  if (weatherCondition.includes('Fırtına')) {
    return Math.floor(seededRandom(seed + 6) * 80) + 20;
  }
  return 0;
}

// ─────────────────────────────────────────────
//  Public API
// ─────────────────────────────────────────────

export function generateCellData(
  x: number,
  y: number,
  origin: { lat: number; lng: number },
  size: number,
): GridCellData {
  const lat = origin.lat - (y * size) - (size / 2);
  const lng = origin.lng + (x * size) + (size / 2);
  const seed = (x * GRID_SIZE + y) + Math.floor(origin.lat * 1000) + (size * 10000);

  const topology = TOPOLOGY_TYPES[Math.floor(seededRandom(seed + 2) * TOPOLOGY_TYPES.length)];
  const weatherCondition = WEATHER_CONDITIONS[Math.floor(seededRandom(seed + 5) * WEATHER_CONDITIONS.length)];
  const windSpeed = Math.floor(seededRandom(seed + 3) * 60);

  return {
    id: `${x}-${y}`,
    x,
    y,
    lat,
    lng,
    temperature: Math.floor(seededRandom(seed) * 35) - 5,
    humidity: Math.floor(seededRandom(seed + 1) * 100),
    topology,
    windSpeed,
    windDirection: WIND_DIRS[Math.floor(seededRandom(seed + 20) * WIND_DIRS.length)],
    gustSpeed: windSpeed + Math.floor(seededRandom(seed + 21) * 25),
    weatherCondition,
    precipitation: resolvePrecipitation(weatherCondition, seed),
    pressure: 1000 + Math.floor(seededRandom(seed + 7) * 30),
    evaporation: seededRandom(seed + 8) > 0.7 ? 'Yüksek' : seededRandom(seed + 8) > 0.4 ? 'Orta' : 'Düşük',
    isHazardous: seededRandom(seed + 4) > 0.8,
    dominantAspect: ASPECTS[Math.floor(seededRandom(seed + 13) * ASPECTS.length)],
    landCover: resolveLandCover(topology, seed),
    thermalAnomaly: resolveThermal(seed),
    ...resolveElevation(topology, seed),
  };
}

/** Sadece topoğrafya — harita etiketi için hızlı erişim. */
export function getCellTopology(
  x: number,
  y: number,
  origin: { lat: number; lng: number },
  size: number,
): string {
  const seed = (x * GRID_SIZE + y) + Math.floor(origin.lat * 1000) + (size * 10000);
  return TOPOLOGY_TYPES[Math.floor(seededRandom(seed + 2) * TOPOLOGY_TYPES.length)];
}

/** Sektör kodu üret (askeri format: A-1, B-2, …) */
export function getSectorCode(x: number, y: number): string {
  const row = String.fromCharCode(65 + y); // A, B, C, ...
  return `${row}-${x + 1}`;
}

/** Sadece sıcaklık — heatmap için hızlı erişim. */
export function getCellTemperature(
  x: number,
  y: number,
  origin: { lat: number; lng: number },
  size: number,
): number {
  const seed = (x * GRID_SIZE + y) + Math.floor(origin.lat * 1000) + (size * 10000);
  return Math.floor(seededRandom(seed) * 35) - 5;
}
