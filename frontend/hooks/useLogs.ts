/**
 * DroneCommand AI — useLogs Hook
 * Log state yönetimi; her ekleme aynı zamanda backend'e yazılır.
 */
import { useState, useCallback } from 'react';
import { LogEntry } from '../types';

const MAX_LOGS = 50;

export function useLogs(
  initialLogs: LogEntry[],
  writeToBackend: (source: string, message: string, type: string, droneId?: string) => void,
) {
  const [logs, setLogs] = useState<LogEntry[]>(initialLogs);

  // Sync initial data
  // (initialLogs geldiğinde state'i güncelle — sadece ilk yükleme)
  useState(() => {
    if (initialLogs.length > 0) setLogs(initialLogs);
  });

  const addLog = useCallback(
    (
      source: string,
      message: string,
      type: 'INFO' | 'WARNING' | 'ALERT' | 'ACTION' = 'INFO',
      droneId?: string,
    ) => {
      const entry: LogEntry = {
        id: Math.random().toString(36).substr(2, 9),
        timestamp: new Date(),
        source,
        message,
        type,
      };

      setLogs(prev => [entry, ...prev].slice(0, MAX_LOGS));
      writeToBackend(source, message, type, droneId);
    },
    [writeToBackend],
  );

  return { logs, addLog };
}
