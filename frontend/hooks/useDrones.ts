/**
 * DroneCommand AI — useDrones Hook
 * Drone state, simülasyon döngüsü, durum değişiklikleri.
 *
 * ÖNEMLİ: Dummy data yoktur. Tüm drone verileri backend'den gelir.
 * Backend çevrimdışıysa drone listesi boştur.
 */
import { useState, useEffect, useCallback } from 'react';
import { Drone, DroneStatus } from '../types';
import { GRID_SIZE } from '../constants';

interface UseDronesOptions {
  addLog: (source: string, message: string, type: string, droneId?: string) => void;
  syncToBackend: (drones: Drone[]) => void;
  pushStatus: (droneId: string, status: string) => void;
  syncInterval: number;
}

export function useDrones(initialDrones: Drone[], opts: UseDronesOptions) {
  const [drones, setDrones] = useState<Drone[]>(initialDrones);
  const { addLog, syncToBackend, pushStatus, syncInterval } = opts;

  // Sync initial data when it arrives from backend
  useEffect(() => {
    if (initialDrones.length > 0) {
      setDrones(initialDrones);
    }
  }, [initialDrones]);

  // ── Status Change ──────────────────────────

  const changeStatus = useCallback((droneId: string, newStatus: DroneStatus) => {
    setDrones(prev => prev.map(d => {
      if (d.id !== droneId) return d;

      const messages: Record<string, string> = {
        [DroneStatus.RETURNING]: 'Üsse dönüş başlatıldı.',
        [DroneStatus.HOVERING]: 'Havada sabit pozisyona geçildi.',
      };
      addLog(d.name, messages[newStatus] || `Uçuş modu değiştirildi: ${newStatus}`, 'ACTION', droneId);

      return { ...d, status: newStatus };
    }));

    pushStatus(droneId, newStatus);
  }, [addLog, pushStatus]);

  // ── Move Drone to Target ──────────────────

  const moveDrone = useCallback((droneId: string, target: { x: number; y: number }) => {
    setDrones(prev => prev.map(d => {
      if (d.id !== droneId) return d;
      return {
        ...d,
        position: target,
        flightPath: [...d.flightPath, d.position],
        status: DroneStatus.FOLLOWING_PATH,
      };
    }));
  }, []);

  // ── Simulation Loop ────────────────────────
  // Not: Bu simülasyon frontend'deki görsel güncelleme içindir.
  //      Gerçek telemetri RabbitMQ üzerinden gelir.

  useEffect(() => {
    const interval = setInterval(() => {
      setDrones(prev => {
        if (prev.length === 0) return prev;

        return prev.map(drone => {
          if (drone.status === DroneStatus.OFFLINE) return drone;

          // Battery drain
          const drainRates: Record<string, number> = {
            [DroneStatus.HOVERING]: 0.2,
            [DroneStatus.IDLE]: 0.05,
            [DroneStatus.RETURNING]: 0.5,
            [DroneStatus.FOLLOWING_PATH]: 0.5,
            [DroneStatus.PATROLLING]: 0.5,
          };
          const drain = (drainRates[drone.status] ?? 0.1) + Math.random() * 0.1;
          const newBattery = Math.max(0, parseFloat((drone.battery - drain).toFixed(2)));

          let newStatus = drone.status;

          // Battery alerts
          if (newBattery === 0) {
            newStatus = DroneStatus.OFFLINE;
            addLog(drone.name, 'KRİTİK: Batarya tükendi. Sistem kapandı.', 'ALERT', drone.id);
          } else if (newBattery < 20 && drone.battery >= 20) {
            addLog(drone.name, 'UYARI: Düşük batarya seviyesi (%20).', 'WARNING', drone.id);
            if (drone.status !== DroneStatus.RETURNING && drone.status !== DroneStatus.IDLE) {
              newStatus = DroneStatus.RETURNING;
              addLog(drone.name, 'Düşük batarya nedeniyle otomatik dönüş başlatıldı.', 'ACTION', drone.id);
            }
          }

          // Movement
          let newPos = { ...drone.position };
          let newPath = [...drone.flightPath];

          if (newBattery > 0) {
            if (newStatus === DroneStatus.RETURNING) {
              const dx = 0 - drone.position.x;
              const dy = 0 - drone.position.y;
              if (dx !== 0 || dy !== 0) {
                newPos = {
                  x: drone.position.x + (dx !== 0 ? dx / Math.abs(dx) : 0),
                  y: drone.position.y + (dy !== 0 ? dy / Math.abs(dy) : 0),
                };
              } else {
                newStatus = DroneStatus.IDLE;
                addLog(drone.name, 'Üsse varış sağlandı. Motorlar durduruldu.', 'INFO', drone.id);
              }
            } else if (
              newStatus === DroneStatus.FOLLOWING_PATH ||
              newStatus === DroneStatus.PATROLLING
            ) {
              if (Math.random() > 0.6) {
                newPos = {
                  x: Math.max(0, Math.min(GRID_SIZE - 1, drone.position.x + Math.floor(Math.random() * 3) - 1)),
                  y: Math.max(0, Math.min(GRID_SIZE - 1, drone.position.y + Math.floor(Math.random() * 3) - 1)),
                };
              }
            }
          }

          if (newPos.x !== drone.position.x || newPos.y !== drone.position.y) {
            newPath = [...drone.flightPath, drone.position].slice(-20);
          }

          return { ...drone, battery: newBattery, status: newStatus, position: newPos, flightPath: newPath };
        });
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [addLog]);

  // ── Periodic Backend Sync ──────────────────

  useEffect(() => {
    if (drones.length === 0) return;
    const id = setInterval(() => syncToBackend(drones), syncInterval);
    return () => clearInterval(id);
  }, [drones, syncToBackend, syncInterval]);

  return { drones, changeStatus, moveDrone, setDrones };
}
