/**
 * DroneCommand AI — useGridCell Hook
 * Hücre verisi: backend'den çek, yoksa yerel üret ve cache'le.
 */
import { useState, useCallback, useEffect } from 'react';
import { Coordinates, GridCellData } from '../types';
import { generateCellData, getCellTemperature } from '../utils/gridGenerator';

interface UseGridCellOptions {
  gridOrigin: { lat: number; lng: number };
  cellSize: number;
  fetchFromBackend: (x: number, y: number) => Promise<GridCellData | null>;
  saveToBackend: (data: GridCellData) => void;
}

export function useGridCell(opts: UseGridCellOptions) {
  const { gridOrigin, cellSize, fetchFromBackend, saveToBackend } = opts;

  const [selectedCell, setSelectedCell] = useState<Coordinates | null>(null);
  const [cellData, setCellData] = useState<GridCellData | null>(null);

  /** Hücre verisi getir (backend → fallback → cache) */
  const loadCellData = useCallback(
    async (x: number, y: number): Promise<GridCellData> => {
      // Backend'den dene
      const remote = await fetchFromBackend(x, y);
      if (remote) return remote;

      // Yerel üret
      const local = generateCellData(x, y, gridOrigin, cellSize);

      // Backend'e kaydet (fire & forget)
      saveToBackend(local);

      return local;
    },
    [gridOrigin, cellSize, fetchFromBackend, saveToBackend],
  );

  /** Hücre seç ve verisini yükle */
  const selectCell = useCallback(
    async (coords: Coordinates) => {
      setSelectedCell(coords);
      const data = await loadCellData(coords.x, coords.y);
      setCellData(data);
      return data;
    },
    [loadCellData],
  );

  /** Grid parametreleri değiştiğinde mevcut seçimi güncelle */
  useEffect(() => {
    if (selectedCell) {
      loadCellData(selectedCell.x, selectedCell.y).then(setCellData);
    }
  }, [gridOrigin, cellSize]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Heatmap için senkron sıcaklık erişimi */
  const getTemperature = useCallback(
    (x: number, y: number) => getCellTemperature(x, y, gridOrigin, cellSize),
    [gridOrigin, cellSize],
  );

  return {
    selectedCell,
    setSelectedCell,
    cellData,
    setCellData,
    selectCell,
    getTemperature,
  };
}
