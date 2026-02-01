/**
 * DroneCommand AI — useInteractionMode Hook
 * Hedefleme ve ölçüm modu state yönetimi.
 */
import { useState, useCallback } from 'react';
import { Coordinates } from '../types';

export type InteractionMode = 'none' | 'targeting' | 'measuring';

export function useInteractionMode() {
  const [mode, setMode] = useState<InteractionMode>('none');
  const [measurementPoints, setMeasurementPoints] = useState<{
    start: Coordinates | null;
    end: Coordinates | null;
  }>({ start: null, end: null });

  const isTargeting = mode === 'targeting';
  const isMeasuring = mode === 'measuring';

  const enableTargeting = useCallback(() => {
    setMode('targeting');
    setMeasurementPoints({ start: null, end: null });
  }, []);

  const enableMeasuring = useCallback(() => {
    setMode('measuring');
    setMeasurementPoints({ start: null, end: null });
  }, []);

  const clearMode = useCallback(() => {
    setMode('none');
    setMeasurementPoints({ start: null, end: null });
  }, []);

  const toggleTargeting = useCallback(() => {
    if (isTargeting) clearMode();
    else enableTargeting();
  }, [isTargeting, clearMode, enableTargeting]);

  const toggleMeasuring = useCallback(() => {
    if (isMeasuring) clearMode();
    else enableMeasuring();
  }, [isMeasuring, clearMode, enableMeasuring]);

  /** Ölçüm noktası ekle; iki nokta dolunca sıfırla. */
  const addMeasurementPoint = useCallback((coords: Coordinates) => {
    setMeasurementPoints(prev => {
      if (!prev.start) return { start: coords, end: null };
      if (!prev.end) return { ...prev, end: coords };
      return { start: coords, end: null }; // Reset
    });
  }, []);

  return {
    mode,
    isTargeting,
    isMeasuring,
    measurementPoints,
    toggleTargeting,
    toggleMeasuring,
    addMeasurementPoint,
    clearMode,
  };
}
