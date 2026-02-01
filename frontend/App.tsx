/**
 * DroneCommand AI — App Root
 * Hook'lar arası orkestrasyon; UI mantığı yok.
 */
import React, { useState, useCallback } from 'react';
import { MapArea } from './components/MapArea';
import { FleetPanel } from './components/FleetPanel';
import { TelemetryPanel } from './components/TelemetryPanel';
import { Coordinates, AnalysisResult, DroneStatus, Detection } from './types';
import { INITIAL_GRID_ORIGIN, CELL_SIZE_DEG } from './constants';
import { analyzeSector, analyzeDroneFeed, analyzeDroneStatus, DroneAnalysisInput } from './services/chatgptService';
import { useBackend, useLogs, useDrones, useGridCell, useInteractionMode } from './hooks';

export default function App() {
  // ── Grid params ──────────────────────────
  const [gridOrigin, setGridOrigin] = useState(INITIAL_GRID_ORIGIN);
  const [cellSize, setCellSize] = useState(CELL_SIZE_DEG);

  // ── Backend ──────────────────────────────
  const backend = useBackend();

  // ── Logs ─────────────────────────────────
  const { logs, addLog } = useLogs(backend.initialLogs, backend.writeLog);

  // ── Drones ───────────────────────────────
  const { drones, changeStatus, moveDrone } = useDrones(backend.initialDrones, {
    addLog,
    syncToBackend: backend.syncDrones,
    pushStatus: backend.pushDroneStatus,
    syncInterval: backend.SYNC_INTERVAL,
  });

  // ── Grid Cell ────────────────────────────
  const grid = useGridCell({
    gridOrigin,
    cellSize,
    fetchFromBackend: backend.fetchCellFromBackend,
    saveToBackend: backend.saveCellToBackend,
  });

  // ── Interaction Mode ─────────────────────
  const interaction = useInteractionMode();

  // ── Selection ────────────────────────────
  const [selectedDroneId, setSelectedDroneId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult>({ isLoading: false, text: null });
  const [feedAnalysis, setFeedAnalysis] = useState<AnalysisResult>({ isLoading: false, text: null });
  const [droneAiAnalysis, setDroneAiAnalysis] = useState<AnalysisResult>({ isLoading: false, text: null });

  // ── Sidebars ─────────────────────────────
  const [isLeftOpen, setIsLeftOpen] = useState(true);
  const [isRightOpen, setIsRightOpen] = useState(true);

  const activeDrone = drones.find(d => d.id === selectedDroneId) ?? null;

  // ── Handlers ─────────────────────────────

  const handleCellSelect = useCallback(async (coords: Coordinates) => {
    // 1 — Measurement
    if (interaction.isMeasuring) {
      interaction.addMeasurementPoint(coords);
      addLog('SYSTEM', 'Ölçüm noktası belirlendi.', 'INFO');
      return;
    }

    // 2 — Targeting (drone navigation)
    if (interaction.isTargeting && selectedDroneId) {
      const target = drones.find(d => d.id === selectedDroneId);
      moveDrone(selectedDroneId, coords);

      backend.pushDronePosition(selectedDroneId, coords.x, coords.y);
      backend.pushDroneStatus(selectedDroneId, DroneStatus.FOLLOWING_PATH);

      addLog(target?.name ?? 'UNKNOWN', `Yeni rota belirlendi: [${coords.x}, ${coords.y}]`, 'ACTION', selectedDroneId);
      interaction.clearMode();

      await grid.selectCell(coords);
      return;
    }

    // 3 — Normal cell selection
    setSelectedDroneId(null);
    setIsRightOpen(true);
    setAnalysis({ isLoading: false, text: null });
    await grid.selectCell(coords);
  }, [interaction, selectedDroneId, drones, moveDrone, backend, addLog, grid]);

  const handleDroneSelect = useCallback(async (id: string) => {
    setSelectedDroneId(id);
    interaction.clearMode();
    setIsRightOpen(true);
    setAnalysis({ isLoading: false, text: null });
    setFeedAnalysis({ isLoading: false, text: null });
    setDroneAiAnalysis({ isLoading: false, text: null });

    const drone = drones.find(d => d.id === id);
    if (drone) {
      await grid.selectCell(drone.position);
    }
  }, [drones, interaction, grid]);

  const handleAnalyze = useCallback(async () => {
    if (!grid.cellData) return;
    setAnalysis({ isLoading: true, text: null });
    addLog('AI', `Bölgesel risk analizi başlatıldı: Grid [${grid.cellData.x}, ${grid.cellData.y}]`, 'INFO');
    const text = await analyzeSector(grid.cellData);
    setAnalysis({ isLoading: false, text });
    addLog('AI', 'Bölgesel risk analizi tamamlandı.', 'INFO');
  }, [grid.cellData, addLog]);

  const handleAnalyzeFeed = useCallback(async () => {
    if (!grid.cellData || !selectedDroneId) return;
    const drone = drones.find(d => d.id === selectedDroneId);
    if (!drone) return;
    setFeedAnalysis({ isLoading: true, text: null });
    addLog('AI', `${drone.name} kamera görüntüsü işleniyor...`, 'INFO', drone.id);
    const text = await analyzeDroneFeed(grid.cellData, drone.name, drone.altitude);
    setFeedAnalysis({ isLoading: false, text });
    addLog('AI', `${drone.name} görüntü analizi tamamlandı.`, 'INFO', drone.id);
  }, [grid.cellData, selectedDroneId, drones, addLog]);

  const handleDroneAiAnalysis = useCallback(async () => {
    if (!selectedDroneId) return;
    const drone = drones.find(d => d.id === selectedDroneId);
    if (!drone) return;
    setDroneAiAnalysis({ isLoading: true, text: null });
    addLog('AI', `${drone.name} için ChatGPT analizi başlatıldı...`, 'INFO', drone.id);

    const input: DroneAnalysisInput = {
      drone,
      cellData: grid.cellData,
      detections: [], // RabbitMQ'dan gelen detection'lar bağlandığında burası dolar
    };

    const text = await analyzeDroneStatus(input);
    setDroneAiAnalysis({ isLoading: false, text });
    addLog('AI', `${drone.name} ChatGPT analizi tamamlandı.`, 'INFO', drone.id);
  }, [selectedDroneId, drones, grid.cellData, addLog]);

  // ── Loading Screen ───────────────────────

  if (!backend.loaded) {
    return (
      <div className="flex h-screen w-screen bg-slate-950 text-cyan-400 items-center justify-center">
        <div className="text-center">
          <i className="fa-solid fa-satellite-dish text-4xl mb-4 animate-pulse"></i>
          <p className="text-sm font-mono">Sistem yükleniyor…</p>
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────

  return (
    <div className="flex h-screen w-screen bg-slate-950 text-slate-200 overflow-hidden relative">

      {/* Backend Status Badge */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[60] pointer-events-none">
        <div className={`
          px-3 py-1 rounded-full text-[10px] font-mono flex items-center gap-2 backdrop-blur border shadow-lg
          ${backend.online
            ? 'bg-emerald-900/40 border-emerald-500/30 text-emerald-400'
            : 'bg-red-900/40 border-red-500/30 text-red-400'}
        `}>
          <div className={`w-1.5 h-1.5 rounded-full ${backend.online ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`} />
          {backend.online ? 'BACKEND ÇEVRİMİÇİ' : 'ÇEVRİMDIŞI MOD'}
        </div>
      </div>

      {/* ── Left Sidebar ──────────────────── */}
      <div className={`
        absolute md:relative inset-y-0 left-0 z-30
        bg-slate-900/95 backdrop-blur border-r border-white/10
        transition-all duration-300 ease-in-out flex flex-col flex-shrink-0
        ${isLeftOpen ? 'translate-x-0 w-80' : '-translate-x-full w-80 md:w-0 md:translate-x-0'}
      `}>
        <div className={`flex flex-col h-full w-80 ${isLeftOpen ? 'opacity-100' : 'md:opacity-0 md:pointer-events-none'} transition-opacity duration-200`}>
          <div className="p-4 border-b border-white/10 flex justify-between items-center">
            <h1 className="text-xl font-bold tracking-tighter text-white flex items-center gap-2">
              <i className="fa-solid fa-dragon text-cyan-500" />
              DRONE<span className="text-cyan-500">CMD</span>
            </h1>
            <button onClick={() => setIsLeftOpen(false)} className="md:hidden text-slate-400 hover:text-white">
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
          <FleetPanel drones={drones} onSelectDrone={handleDroneSelect} selectedDroneId={selectedDroneId} logs={logs} />
        </div>
      </div>

      {/* ── Map Area ──────────────────────── */}
      <div className="flex-1 relative z-10 bg-black flex flex-col overflow-hidden">
        {/* Sidebar toggles */}
        <div className="absolute top-4 left-4 z-50">
          <button onClick={() => setIsLeftOpen(p => !p)} className="bg-black/60 hover:bg-cyan-900/80 text-cyan-400 border border-white/20 w-10 h-10 rounded flex items-center justify-center backdrop-blur transition-all shadow-lg group" title="Menü">
            <i className={`fa-solid ${isLeftOpen ? 'fa-chevron-left' : 'fa-bars'} group-hover:scale-110 transition-transform`} />
          </button>
        </div>
        <div className="absolute top-4 right-4 z-50">
          <button onClick={() => setIsRightOpen(p => !p)} className="bg-black/60 hover:bg-cyan-900/80 text-cyan-400 border border-white/20 w-10 h-10 rounded flex items-center justify-center backdrop-blur transition-all shadow-lg group" title="Panel">
            <i className={`fa-solid ${isRightOpen ? 'fa-chevron-right' : 'fa-chart-radar'} group-hover:scale-110 transition-transform`} />
          </button>
        </div>

        {/* HUD overlay */}
        <div className="absolute top-4 left-16 right-16 flex justify-center pointer-events-none z-20">
          <div className="flex gap-4">
            <div className="bg-black/50 backdrop-blur px-4 py-2 rounded border border-white/10 text-xs font-mono text-cyan-400 shadow-lg flex items-center">
              <i className="fa-solid fa-satellite-dish mr-2 animate-pulse" />
              <span className="hidden sm:inline">SİSTEM ÇEVRİMİÇİ</span>
            </div>
            {interaction.isTargeting && (
              <div className="bg-yellow-500/20 backdrop-blur px-4 py-2 rounded border border-yellow-500 text-xs font-mono text-yellow-400 shadow-lg flex items-center animate-pulse">
                <i className="fa-solid fa-location-crosshairs mr-2" /> HEDEF SEÇİNİZ...
              </div>
            )}
            {interaction.isMeasuring && (
              <div className="bg-purple-500/20 backdrop-blur px-4 py-2 rounded border border-purple-500 text-xs font-mono text-purple-400 shadow-lg flex items-center animate-pulse">
                <i className="fa-solid fa-ruler mr-2" />
                {!interaction.measurementPoints.start ? 'BAŞLANGIÇ NOKTASINI SEÇİN' : !interaction.measurementPoints.end ? 'BİTİŞ NOKTASINI SEÇİN' : 'ÖLÇÜM TAMAMLANDI'}
              </div>
            )}
            <div className="bg-black/50 backdrop-blur px-4 py-2 rounded border border-white/10 text-xs font-mono text-white/70 shadow-lg">
              {new Date().toLocaleTimeString()}
            </div>
          </div>
        </div>

        <div className="flex-1 relative">
          <MapArea
            drones={drones}
            selectedCell={grid.selectedCell}
            onSelectCell={handleCellSelect}
            gridOrigin={gridOrigin}
            onUpdateGridOrigin={setGridOrigin}
            cellSize={cellSize}
            onUpdateCellSize={setCellSize}
            selectedDroneId={selectedDroneId}
            isTargetingMode={interaction.isTargeting}
            getGridTemperature={grid.getTemperature}
            isMeasuringMode={interaction.isMeasuring}
            measurementPoints={interaction.measurementPoints}
          />
          <div className="absolute top-20 left-4 z-20 flex flex-col gap-2">
            <button
              onClick={interaction.toggleMeasuring}
              className={`w-10 h-10 rounded flex items-center justify-center border transition-all shadow-lg ${interaction.isMeasuring ? 'bg-purple-600 text-white border-purple-400' : 'bg-black/60 text-purple-400 border-white/20 hover:bg-black/80'}`}
              title="Mesafe Ölçümü"
            >
              <i className="fa-solid fa-ruler-combined" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Right Sidebar ─────────────────── */}
      <div className={`
        absolute md:relative inset-y-0 right-0 z-30
        bg-slate-900/95 backdrop-blur border-l border-white/10
        transition-all duration-300 ease-in-out flex flex-col flex-shrink-0
        ${isRightOpen ? 'translate-x-0 w-96' : 'translate-x-full w-96 md:w-0 md:translate-x-0'}
      `}>
        <div className={`flex flex-col h-full w-96 ${isRightOpen ? 'opacity-100' : 'md:opacity-0 md:pointer-events-none'} transition-opacity duration-200 shadow-2xl`}>
          <TelemetryPanel
            data={grid.cellData}
            activeDrone={activeDrone}
            analysis={analysis}
            feedAnalysis={feedAnalysis}
            droneAiAnalysis={droneAiAnalysis}
            onAnalyze={handleAnalyze}
            onAnalyzeFeed={handleAnalyzeFeed}
            onDroneAiAnalyze={handleDroneAiAnalysis}
            isTargetingMode={interaction.isTargeting}
            onToggleTargetingMode={interaction.toggleTargeting}
            onAddLog={addLog}
            onStatusChange={changeStatus}
            logs={logs}
          />
        </div>
      </div>
    </div>
  );
}
