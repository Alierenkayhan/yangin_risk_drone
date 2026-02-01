/**
 * DroneCommand AI — useBackend Hook
 *
 * Backend bağlantı durumu ve ilk yükleme.
 * Canlı veri artık useRabbitMQ üzerinden gelir.
 * Bu hook sadece HTTP API ile konuşur (kayıt, log okuma, vs).
 *
 * ÖNEMLİ: Dummy data yoktur. Backend çevrimdışıysa
 * boş state ile başlatılır ve kullanıcı bilgilendirilir.
 */
import { useState, useEffect, useCallback } from 'react';
import { Drone, LogEntry } from '../types';
import * as api from '../services/apiService';

interface BackendState {
  online: boolean;
  initialDrones: Drone[];
  initialLogs: LogEntry[];
  registrations: Map<string, api.RegistrationResponse>;
  loaded: boolean;
}

export function useBackend() {
  const [state, setState] = useState<BackendState>({
    online: false,
    initialDrones: [],
    initialLogs: [],
    registrations: new Map(),
    loaded: false,
  });

  // ── Initial Load ────────────────────────────

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const healthy = await api.checkBackendHealth();
        if (!healthy) throw new Error('offline');

        const [drones, logs] = await Promise.all([
          api.fetchDrones(),
          api.fetchLogs({ limit: 50 }),
        ]);

        // Mevcut drone'lar için bağlantı bilgilerini al
        const registrations = new Map<string, api.RegistrationResponse>();
        for (const drone of drones) {
          try {
            const connInfo = await api.fetchDroneConnectionInfo(drone.id);
            if (connInfo) {
              registrations.set(drone.id, connInfo as api.RegistrationResponse);
            }
          } catch {
            // bağlantı bilgisi alınamazsa atla
          }
        }

        if (!cancelled) {
          const startupLogs: LogEntry[] = [
            {
              id: crypto.randomUUID?.() || String(Date.now()),
              timestamp: new Date(),
              source: 'SYSTEM',
              message: 'Backend bağlantısı kuruldu.',
              type: 'INFO',
            },
          ];

          setState({
            online: true,
            initialDrones: drones,
            initialLogs: logs.length > 0 ? logs : startupLogs,
            registrations,
            loaded: true,
          });
        }
      } catch {
        if (!cancelled) {
          setState({
            online: false,
            initialDrones: [],
            initialLogs: [
              {
                id: crypto.randomUUID?.() || String(Date.now()),
                timestamp: new Date(),
                source: 'SYSTEM',
                message: 'Backend bağlantısı kurulamadı. Lütfen backend servisini başlatın.',
                type: 'ALERT',
              },
            ],
            registrations: new Map(),
            loaded: true,
          });
        }
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // ── Register Drone ──────────────────────────

  const registerDrone = useCallback(
    async (droneId: string, name: string, model: string): Promise<api.RegistrationResponse | null> => {
      if (!state.online) return null;

      try {
        const reg = await api.registerDrone(droneId, name, model);
        setState((s) => {
          const newRegs = new Map(s.registrations);
          newRegs.set(droneId, reg);
          return { ...s, registrations: newRegs };
        });
        return reg;
      } catch (err) {
        console.error('[Register] Kayıt hatası:', err);
        return null;
      }
    },
    [state.online],
  );

  // ── Get Registration ────────────────────────

  const getRegistration = useCallback(
    (droneId: string): api.RegistrationResponse | null => {
      return state.registrations.get(droneId) || null;
    },
    [state.registrations],
  );

  // ── Write Log ───────────────────────────────

  const writeLog = useCallback(
    (source: string, message: string, type: string, droneId?: string) => {
      if (state.online) {
        api.createLog(source, message, type as any, droneId).catch(() => {});
      }
    },
    [state.online],
  );

  // ── Sync Drones to Backend ───────────────────

  const syncDrones = useCallback(
    (_drones: Drone[]) => {
      // Periyodik drone state senkronizasyonu (ileride batch endpoint eklenebilir)
    },
    [],
  );

  // ── Push Drone Status ───────────────────────

  const pushDroneStatus = useCallback(
    (droneId: string, status: string) => {
      if (state.online) {
        writeLog(droneId, `Durum güncellendi: ${status}`, 'ACTION', droneId);
      }
    },
    [state.online, writeLog],
  );

  // ── Push Drone Position ─────────────────────

  const pushDronePosition = useCallback(
    (droneId: string, x: number, y: number) => {
      if (state.online) {
        writeLog(droneId, `Pozisyon güncellendi: [${x}, ${y}]`, 'INFO', droneId);
      }
    },
    [state.online, writeLog],
  );

  // ── Grid Cell Backend Access ────────────────

  const fetchCellFromBackend = useCallback(
    async (_x: number, _y: number) => {
      // Grid hücre verisi şu an yerel olarak üretiliyor.
      // İleride backend endpoint eklenerek gerçek meteoroloji API'si bağlanabilir.
      return null;
    },
    [],
  );

  const saveCellToBackend = useCallback(
    (_data: any) => {
      // Grid hücre verisi backend'e kaydetme (ileride eklenebilir)
    },
    [],
  );

  // ── Constants ───────────────────────────────

  const SYNC_INTERVAL = 10_000; // 10 saniye

  return {
    online: state.online,
    loaded: state.loaded,
    initialDrones: state.initialDrones,
    initialLogs: state.initialLogs,
    registrations: state.registrations,
    registerDrone,
    getRegistration,
    writeLog,
    syncDrones,
    pushDroneStatus,
    pushDronePosition,
    fetchCellFromBackend,
    saveCellToBackend,
    SYNC_INTERVAL,
  };
}
