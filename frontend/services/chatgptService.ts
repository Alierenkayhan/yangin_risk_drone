/**
 * DroneCommand AI — ChatGPT Analysis Service
 *
 * OpenAI ChatGPT API ile doğrudan iletişim (SDK-free).
 * Drone telemetri verileri, termal analiz sonuçları ve
 * detection (yangın/duman) bilgilerini ChatGPT'ye göndererek
 * detaylı yorum ve risk değerlendirmesi alır.
 */

import { GridCellData, Drone, Detection } from '../types';

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY || '';
const OPENAI_API_URL = import.meta.env.VITE_OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions';
const MODEL = import.meta.env.VITE_OPENAI_MODEL || 'gpt-4o-mini';

// ─────────────────────────────────────────────
// Core API Call
// ─────────────────────────────────────────────

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Model ailesine göre doğru token parametresini belirler.
 * - o1/o3 serisi → max_completion_tokens (temperature yok)
 * - gpt-4o / gpt-4o-mini / gpt-4 / gpt-3.5 → max_tokens + temperature
 */
function buildRequestBody(messages: ChatMessage[], maxTokens: number) {
  const model = MODEL.toLowerCase();
  const isReasoningModel = /^(o1|o3)/.test(model);

  const body: Record<string, any> = { model: MODEL, messages };

  if (isReasoningModel) {
    body.max_completion_tokens = maxTokens;
  } else {
    body.max_completion_tokens = maxTokens;
    body.temperature = 0.7;
  }

  return body;
}

async function callChatGPT(messages: ChatMessage[], maxTokens: number = 800): Promise<string> {
  if (!OPENAI_API_KEY) {
    console.warn('[ChatGPT] API anahtarı tanımlı değil.');
    return '[HATA] OpenAI API anahtarı tanımlı değil. .env.local dosyasına VITE_OPENAI_API_KEY ekleyin.';
  }

  const requestBody = buildRequestBody(messages, maxTokens);
  console.log('[ChatGPT] İstek gönderiliyor → model:', MODEL, '| maxTokens:', maxTokens);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      console.error('[ChatGPT] API Error:', response.status, errBody);

      if (response.status === 401)
        return '[API HATA 401] Geçersiz API anahtarı. VITE_OPENAI_API_KEY değerini kontrol edin.';
      if (response.status === 429)
        return '[API HATA 429] İstek limiti aşıldı. Birkaç saniye bekleyip tekrar deneyin.';
      if (response.status === 404)
        return `[API HATA 404] Model bulunamadı: "${MODEL}". VITE_OPENAI_MODEL değerini kontrol edin.`;
      if (response.status === 400)
        return `[API HATA 400] İstek hatası — ${errBody.slice(0, 200)}`;

      return `[API HATA ${response.status}] ChatGPT bağlantısı kurulamadı.`;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      console.warn('[ChatGPT] Boş yanıt:', JSON.stringify(data).slice(0, 300));
      return '[Yanıt alınamadı — model boş döndürdü]';
    }

    console.log('[ChatGPT] ✓ Yanıt alındı (' + content.length + ' karakter)');
    return content;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      console.error('[ChatGPT] Timeout: 30s içinde yanıt alınamadı.');
      return '[ZAMAN AŞIMI] ChatGPT 30 saniye içinde yanıt vermedi. Tekrar deneyin.';
    }
    console.error('[ChatGPT] Network Error:', err);
    return '[BAĞLANTI HATASI] ChatGPT sunucusuna ulaşılamıyor. Ağ bağlantınızı kontrol edin.';
  }
}

// ─────────────────────────────────────────────
// System Prompt (Ortak)
// ─────────────────────────────────────────────

const SYSTEM_PROMPT = `Sen, DroneCommand AI sisteminin yapay zeka analiz modülüsün. Görevin, drone İHA sistemlerinden gelen telemetri, termal görüntüleme ve algılama verilerini analiz ederek operatöre Türkçe detaylı istihbarat raporu sunmak.

Yanıtlarında şu formata uy:
• Kısa ve net cümleler kullan
• Kritik tespitleri vurgula
• Risk seviyesini (DÜŞÜK/ORTA/YÜKSEK/KRİTİK) belirt
• Somut aksiyon önerileri sun
• Askeri/operasyonel terminoloji kullan

Rapor bölümleri:
1. DURUM DEĞERLENDİRMESİ — Mevcut verilerin özeti
2. RİSK ANALİZİ — Tespit edilen tehditler ve risk seviyeleri
3. TAVSİYELER — Operatöre yönelik aksiyon önerileri`;

// ─────────────────────────────────────────────
// 1. Bölge (Sektör) Analizi — Grid hücresi için
// ─────────────────────────────────────────────

export async function analyzeSector(cellData: GridCellData): Promise<string> {
  const userMessage = `Aşağıdaki bölge verilerini analiz et ve yangın riski açısından değerlendir:

📍 KONUM: Grid [${cellData.x}, ${cellData.y}] — Lat: ${cellData.lat.toFixed(4)}, Lng: ${cellData.lng.toFixed(4)}

🌡️ ATMOSFER:
- Sıcaklık: ${cellData.temperature}°C
- Nem: %${cellData.humidity}
- Rüzgar: ${cellData.windSpeed} km/h (${cellData.windDirection}), Hamle: ${cellData.gustSpeed} km/h
- Yağış: ${cellData.precipitation} mm
- Basınç: ${cellData.pressure} hPa
- Hava: ${cellData.weatherCondition}
- Buharlaşma: ${cellData.evaporation}

⛰️ TOPOĞRAFYA:
- Yükseklik: ${cellData.elevationMin}m — ${cellData.elevationMax}m
- Ortalama Eğim: ${cellData.avgSlope}°
- Baskın Bakı: ${cellData.dominantAspect}

🌿 ARAZİ ÖRTÜSÜ:
${cellData.landCover.map(c => `  - ${c.type}: %${c.percentage}`).join('\n')}

🔥 TERMAL ANOMALİ:
- Skor: ${cellData.thermalAnomaly.score}/100
- Seviye: ${cellData.thermalAnomaly.level}
- Tehlike Bölgesi: ${cellData.isHazardous ? 'EVET' : 'Hayır'}

Bu verilere göre detaylı yangın riski ve bölge değerlendirmesi yap.`;

  return callChatGPT([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ], 1000);
}

// ─────────────────────────────────────────────
// 2. Drone Kamera Görüntüsü Analizi
// ─────────────────────────────────────────────

export async function analyzeDroneFeed(
  cellData: GridCellData,
  droneName: string,
  altitude: number,
): Promise<string> {
  const userMessage = `${droneName} drone'unun kamera görüntüsünü analiz et:

📍 KONUM BİLGİSİ:
- Grid: [${cellData.x}, ${cellData.y}]
- Arazi: ${cellData.topology || 'Bilinmiyor'}
- Sıcaklık: ${cellData.temperature}°C | Nem: %${cellData.humidity}
- Rüzgar: ${cellData.windSpeed} km/h (${cellData.windDirection})

🚁 DRONE:
- İrtifa (AGL): ${altitude}m
- Termal Skor: ${cellData.thermalAnomaly.score}/100 (${cellData.thermalAnomaly.level})

🌿 ARAZİ:
${cellData.landCover.map(c => `  - ${c.type}: %${c.percentage}`).join('\n')}

Kamera açısından görülebilecek durumları ve olası tehditleri değerlendir. Drone operatörüne ne yapması gerektiğini öner.`;

  return callChatGPT([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ], 600);
}

// ─────────────────────────────────────────────
// 3. Drone Telemetri + Detection Yorumu
// ─────────────────────────────────────────────

export interface DroneAnalysisInput {
  drone: Drone;
  cellData: GridCellData | null;
  detections: Detection[];
  scanStats?: {
    totalFrames: number;
    fireDetections: number;
    smokeDetections: number;
  };
}

export async function analyzeDroneStatus(input: DroneAnalysisInput): Promise<string> {
  const { drone, cellData, detections, scanStats } = input;

  let userMessage = `Drone operasyonel durum raporu oluştur:

🚁 DRONE BİLGİLERİ:
- İsim: ${drone.name}
- Model: ${drone.model}
- ID: ${drone.id}
- Durum: ${drone.status}
- Batarya: %${drone.battery}
- Sinyal Kalitesi: %${drone.signalQuality}
- Hız: ${drone.speed} km/h
- İrtifa (AGL): ${drone.altitude}m
- Konum: [${drone.position.x}, ${drone.position.y}]
- Uçuş Rotası Noktaları: ${drone.flightPath.length}`;

  if (cellData) {
    userMessage += `

📍 MEVCUT KONUM VERİLERİ:
- Sıcaklık: ${cellData.temperature}°C
- Nem: %${cellData.humidity}
- Rüzgar: ${cellData.windSpeed} km/h (${cellData.windDirection}), Hamle: ${cellData.gustSpeed} km/h
- Hava Durumu: ${cellData.weatherCondition}
- Basınç: ${cellData.pressure} hPa
- Arazi: ${cellData.landCover.map(c => `${c.type} %${c.percentage}`).join(', ')}
- Termal Anomali: ${cellData.thermalAnomaly.score}/100 (${cellData.thermalAnomaly.level})
- Tehlike Bölgesi: ${cellData.isHazardous ? 'EVET ⚠️' : 'Hayır'}`;
  }

  if (detections.length > 0) {
    userMessage += `

🔥 ALGILAMA SONUÇLARI (Son ${detections.length} tespit):`;
    const fireCount = detections.filter(d => d.class === 'fire').length;
    const smokeCount = detections.filter(d => d.class === 'smoke').length;
    const avgConfidence = detections.reduce((sum, d) => sum + d.confidence, 0) / detections.length;

    userMessage += `
- Yangın Tespiti: ${fireCount} adet
- Duman Tespiti: ${smokeCount} adet
- Ortalama Güven: %${(avgConfidence * 100).toFixed(1)}
- Son Tespit: ${detections[0].class === 'fire' ? 'YANGIN 🔥' : 'DUMAN 💨'} — Güven: %${(detections[0].confidence * 100).toFixed(1)}`;
  }

  if (scanStats) {
    userMessage += `

📊 TARAMA İSTATİSTİKLERİ:
- Toplam İşlenen Kare: ${scanStats.totalFrames}
- Yangın Algılama: ${scanStats.fireDetections}
- Duman Algılama: ${scanStats.smokeDetections}
- Yangın Oranı: %${scanStats.totalFrames > 0 ? ((scanStats.fireDetections / scanStats.totalFrames) * 100).toFixed(1) : '0'}`;
  }

  userMessage += `

Bu verilere göre:
1. Drone'un mevcut operasyonel durumunu değerlendir
2. Batarya ve sinyal risk analizi yap
3. Algılama sonuçlarına göre yangın tehdit seviyesini belirle
4. Operatöre spesifik aksiyon tavsiyeleri ver
5. Varsa meteorolojik riskleri ve uçuş güvenliği endişelerini belirt`;

  return callChatGPT([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ], 1200);
}

// ─────────────────────────────────────────────
// 4. Hızlı Tehdit Özeti (Kısa yanıt)
// ─────────────────────────────────────────────

export async function quickThreatSummary(
  drone: Drone,
  detections: Detection[],
): Promise<string> {
  const fireCount = detections.filter(d => d.class === 'fire').length;
  const smokeCount = detections.filter(d => d.class === 'smoke').length;

  const userMessage = `Tek paragrafta kısa tehdit özeti ver:
Drone: ${drone.name} (Batarya: %${drone.battery}, Sinyal: %${drone.signalQuality})
Durum: ${drone.status} | İrtifa: ${drone.altitude}m | Hız: ${drone.speed} km/h
Son tespitler: ${fireCount} yangın, ${smokeCount} duman
${detections.length === 0 ? 'Herhangi bir tespit yok — temiz bölge.' : ''}`;

  return callChatGPT([
    { role: 'system', content: 'Kısa, net ve Türkçe tehdit özeti yaz. Maksimum 3 cümle.' },
    { role: 'user', content: userMessage },
  ], 200);
}
