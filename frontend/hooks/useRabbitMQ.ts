/**
 * DroneCommand AI — useRabbitMQ Hook
 *
 * RabbitMQ Web STOMP üzerinden drone'a bağlanır.
 * Telemetri, video, detection ve alert mesajlarını dinler.
 * GUI'den komut gönderir (tarama başlat/durdur, vs).
 *
 * Kullanım:
 *   const { connected, telemetry, videoFrame, detections, alerts, sendCommand, startScan, stopScan }
 *     = useRabbitMQ(registrationData);
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  RabbitMQClient,
  TelemetryMessage,
  VideoFrameMessage,
  DetectionMessage,
  AlertMessage,
  StatusMessage,
} from '../services/rabbitmqService';
import type { RegistrationResponse } from '../services/apiService';

interface UseRabbitMQState {
  connected: boolean;
  telemetry: TelemetryMessage | null;
  videoFrame: VideoFrameMessage | null;
  detections: DetectionMessage | null;
  latestAlert: AlertMessage | null;
  latestStatus: StatusMessage | null;
  scanning: boolean;
}

export function useRabbitMQ(registration: RegistrationResponse | null) {
  const [state, setState] = useState<UseRabbitMQState>({
    connected: false,
    telemetry: null,
    videoFrame: null,
    detections: null,
    latestAlert: null,
    latestStatus: null,
    scanning: false,
  });

  const clientRef = useRef<RabbitMQClient | null>(null);

  // ── Connect & Subscribe ──────────────────────

  useEffect(() => {
    if (!registration) return;

    const { stomp, gui_topics } = registration;

    const client = new RabbitMQClient({
      url: stomp.url,
      username: stomp.username,
      password: stomp.password,
      vhost: stomp.vhost,
    });

    clientRef.current = client;

    client.onConnect = () => {
      setState((s) => ({ ...s, connected: true }));
      console.log('[RabbitMQ] Bağlandı');

      // ── Subscribe to all GUI topics ──

      client.subscribe(gui_topics.telemetry, (msg: TelemetryMessage) => {
        setState((s) => ({ ...s, telemetry: msg }));
      });

      client.subscribe(gui_topics.video, (msg: VideoFrameMessage) => {
        setState((s) => ({ ...s, videoFrame: msg }));
      });

      client.subscribe(gui_topics.detection, (msg: DetectionMessage) => {
        setState((s) => ({ ...s, detections: msg }));
      });

      client.subscribe(gui_topics.alerts, (msg: AlertMessage) => {
        setState((s) => ({ ...s, latestAlert: msg }));
      });

      client.subscribe(gui_topics.status, (msg: StatusMessage) => {
        setState((s) => {
          const scanning =
            msg.type === 'SCAN_STARTED' ? true :
            msg.type === 'SCAN_STOPPED' ? false :
            s.scanning;
          return { ...s, latestStatus: msg, scanning };
        });
      });
    };

    client.onDisconnect = () => {
      setState((s) => ({ ...s, connected: false }));
      console.log('[RabbitMQ] Bağlantı kesildi');
    };

    client.onError = (error) => {
      console.error('[RabbitMQ] Hata:', error);
    };

    client.connect();

    return () => {
      client.disconnect();
      clientRef.current = null;
    };
  }, [registration]);

  // ── Commands ─────────────────────────────────

  const sendCommand = useCallback(
    (command: string, params: Record<string, any> = {}) => {
      if (!clientRef.current || !registration) return;
      clientRef.current.sendCommand(
        registration.gui_command_destination,
        command,
        params,
      );
    },
    [registration],
  );

  const startScan = useCallback(() => sendCommand('START_SCAN'), [sendCommand]);
  const stopScan = useCallback(() => sendCommand('STOP_SCAN'), [sendCommand]);

  return {
    ...state,
    sendCommand,
    startScan,
    stopScan,
  };
}
