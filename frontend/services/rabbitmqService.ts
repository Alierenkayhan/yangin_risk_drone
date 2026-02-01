/**
 * DroneCommand AI — RabbitMQ STOMP Service
 *
 * Web STOMP üzerinden RabbitMQ'ya bağlanır.
 * GUI, drone'lara özel topic'lere subscribe olarak canlı veri alır.
 *
 * Mimari:
 *   Browser ─── STOMP/WebSocket ──→ RabbitMQ (15674)
 *   RabbitMQ ←── AMQP ──── Backend Consumer
 *
 * Kullanım:
 *   const client = new RabbitMQClient(stompUrl, username, password, vhost);
 *   client.connect();
 *   client.subscribe('/exchange/drone.gui/gui.D-01.telemetry', (msg) => { ... });
 *   client.sendCommand('/exchange/drone.gui/gui.D-01.commands', { command: 'START_SCAN' });
 */

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface StompConfig {
  url: string;            // ws://host:15674/ws
  username: string;
  password: string;
  vhost: string;
}

export interface GuiTopics {
  telemetry: string;
  video: string;
  detection: string;
  alerts: string;
  status: string;
}

export interface TelemetryMessage {
  type: 'TELEMETRY';
  timestamp: string;
  drone_id: string;
  data: {
    position: { x: number; y: number };
    battery: number;
    altitude: number;
    speed: number;
    status: string;
    signal_quality: number;
  };
}

export interface VideoFrameMessage {
  type: 'VIDEO_FRAME';
  timestamp: string;
  drone_id: string;
  frame_number: number;
  data: string;       // base64 JPEG
  scanning: boolean;
}

export interface DetectionMessage {
  type: 'DETECTION';
  timestamp: string;
  drone_id: string;
  frame_number: number;
  detections: Array<{
    class: string;
    confidence: number;
    bbox: number[];
    timestamp: string;
  }>;
  has_fire: boolean;
  has_smoke: boolean;
}

export interface AlertMessage {
  type: 'ALERT' | 'DETECTION_ALERT';
  timestamp: string;
  drone_id: string;
  message?: string;
  detection_class?: string;
  confidence?: number;
  data?: Record<string, any>;
}

export interface StatusMessage {
  type: 'COMMAND_ACK' | 'SCAN_STARTED' | 'SCAN_STOPPED';
  timestamp: string;
  drone_id: string;
  command?: string;
  session_id?: string;
  stats?: {
    total_frames: number;
    fire_detections: number;
    smoke_detections: number;
  };
}

type MessageHandler = (message: any) => void;

interface Subscription {
  id: string;
  destination: string;
  handler: MessageHandler;
}

// ─────────────────────────────────────────────
// STOMP Frame Parser (minimal, no external deps)
// ─────────────────────────────────────────────

function buildStompFrame(command: string, headers: Record<string, string>, body = ''): string {
  let frame = command + '\n';
  for (const [key, value] of Object.entries(headers)) {
    frame += `${key}:${value}\n`;
  }
  frame += '\n' + body + '\0';
  return frame;
}

function parseStompFrame(data: string): { command: string; headers: Record<string, string>; body: string } | null {
  // Heartbeat
  if (data === '\n' || data === '\r\n') {
    return { command: 'HEARTBEAT', headers: {}, body: '' };
  }

  const nullIdx = data.indexOf('\0');
  const content = nullIdx >= 0 ? data.substring(0, nullIdx) : data;

  const firstNewline = content.indexOf('\n');
  if (firstNewline < 0) return null;

  const command = content.substring(0, firstNewline).trim();

  const headerEndIdx = content.indexOf('\n\n');
  if (headerEndIdx < 0) {
    return { command, headers: {}, body: '' };
  }

  const headerBlock = content.substring(firstNewline + 1, headerEndIdx);
  const headers: Record<string, string> = {};
  for (const line of headerBlock.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      headers[line.substring(0, colonIdx).trim()] = line.substring(colonIdx + 1).trim();
    }
  }

  const body = content.substring(headerEndIdx + 2);

  return { command, headers, body };
}

// ─────────────────────────────────────────────
// RabbitMQ STOMP Client
// ─────────────────────────────────────────────

export class RabbitMQClient {
  private config: StompConfig;
  private ws: WebSocket | null = null;
  private connected = false;
  private subscriptions: Map<string, Subscription> = new Map();
  private subCounter = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  // Callbacks
  public onConnect?: () => void;
  public onDisconnect?: () => void;
  public onError?: (error: string) => void;

  constructor(config: StompConfig) {
    this.config = config;
  }

  // ── Connection ──────────────────────────────

  connect(): void {
    if (this.ws) {
      this.ws.close();
    }

    try {
      this.ws = new WebSocket(this.config.url);
      this.ws.onopen = () => this._onWsOpen();
      this.ws.onmessage = (ev) => this._onWsMessage(ev);
      this.ws.onclose = () => this._onWsClose();
      this.ws.onerror = () => this.onError?.('WebSocket bağlantı hatası');
    } catch (e) {
      this.onError?.(`WebSocket oluşturulamadı: ${e}`);
      this._scheduleReconnect();
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.ws && this.connected) {
      try {
        this.ws.send(buildStompFrame('DISCONNECT', { receipt: 'disconnect-1' }));
      } catch {
        // ignore
      }
    }

    this.connected = false;
    this.ws?.close();
    this.ws = null;
    this.subscriptions.clear();
  }

  get isConnected(): boolean {
    return this.connected;
  }

  // ── Subscribe ───────────────────────────────

  subscribe(destination: string, handler: MessageHandler): string {
    const id = `sub-${++this.subCounter}`;

    this.subscriptions.set(id, { id, destination, handler });

    if (this.connected && this.ws) {
      this.ws.send(buildStompFrame('SUBSCRIBE', {
        id,
        destination,
        ack: 'auto',
      }));
    }

    return id;
  }

  unsubscribe(subscriptionId: string): void {
    if (this.connected && this.ws) {
      this.ws.send(buildStompFrame('UNSUBSCRIBE', { id: subscriptionId }));
    }
    this.subscriptions.delete(subscriptionId);
  }

  // ── Publish (GUI → RabbitMQ → Consumer → Drone) ──

  send(destination: string, body: Record<string, any>): void {
    if (!this.connected || !this.ws) {
      console.warn('[STOMP] Bağlı değil, mesaj gönderilemedi:', destination);
      return;
    }

    this.ws.send(buildStompFrame('SEND', {
      destination,
      'content-type': 'application/json',
    }, JSON.stringify(body)));
  }

  // ── Convenience: Send command to drone via RabbitMQ ──

  sendCommand(commandDestination: string, command: string, params: Record<string, any> = {}): void {
    this.send(commandDestination, {
      command,
      params,
      timestamp: new Date().toISOString(),
    });
  }

  // ── Internal ────────────────────────────────

  private _onWsOpen(): void {
    if (!this.ws) return;

    // STOMP CONNECT frame
    this.ws.send(buildStompFrame('CONNECT', {
      'accept-version': '1.2',
      host: this.config.vhost,
      login: this.config.username,
      passcode: this.config.password,
      'heart-beat': '10000,10000',
    }));
  }

  private _onWsMessage(event: MessageEvent): void {
    const data = typeof event.data === 'string' ? event.data : '';
    const frame = parseStompFrame(data);

    if (!frame) return;

    switch (frame.command) {
      case 'CONNECTED':
        this.connected = true;
        this._resubscribeAll();
        this._startHeartbeat();
        this.onConnect?.();
        break;

      case 'MESSAGE': {
        const subId = frame.headers['subscription'];
        const sub = this.subscriptions.get(subId);
        if (sub) {
          try {
            const body = frame.body ? JSON.parse(frame.body) : {};
            sub.handler(body);
          } catch (e) {
            console.error('[STOMP] Mesaj parse hatası:', e);
          }
        }
        break;
      }

      case 'ERROR':
        this.onError?.(frame.headers['message'] || frame.body || 'STOMP hatası');
        break;

      case 'HEARTBEAT':
        // No-op
        break;
    }
  }

  private _onWsClose(): void {
    const wasConnected = this.connected;
    this.connected = false;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (wasConnected) {
      this.onDisconnect?.();
    }

    this._scheduleReconnect();
  }

  private _resubscribeAll(): void {
    if (!this.ws) return;

    for (const sub of this.subscriptions.values()) {
      this.ws.send(buildStompFrame('SUBSCRIBE', {
        id: sub.id,
        destination: sub.destination,
        ack: 'auto',
      }));
    }
  }

  private _startHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.connected) {
        try {
          this.ws.send('\n');
        } catch {
          // Connection lost
        }
      }
    }, 10_000);
  }

  private _scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      console.log('[STOMP] Yeniden bağlanılıyor...');
      this.connect();
    }, 3000);
  }
}


// ─────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────

/**
 * Registration API yanıtından RabbitMQ client oluşturur.
 */
export function createClientFromRegistration(registrationResponse: {
  stomp: { url: string; username: string; password: string; vhost: string };
}): RabbitMQClient {
  const { stomp } = registrationResponse;
  return new RabbitMQClient({
    url: stomp.url,
    username: stomp.username,
    password: stomp.password,
    vhost: stomp.vhost,
  });
}
