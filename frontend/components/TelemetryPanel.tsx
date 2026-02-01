import React, { useState } from 'react';
import { GridCellData, AnalysisResult, Drone, DroneStatus, WaveformType, LogEntry } from '../types';

interface TelemetryPanelProps {
  data: GridCellData | null;
  activeDrone: Drone | null;
  analysis: AnalysisResult;
  feedAnalysis?: AnalysisResult;
  droneAiAnalysis?: AnalysisResult;
  onAnalyze: () => void;
  onAnalyzeFeed?: () => void;
  onDroneAiAnalyze?: () => void;
  isTargetingMode: boolean;
  onToggleTargetingMode: () => void;
  onAddLog: (source: string, message: string, type: 'INFO' | 'WARNING' | 'ALERT' | 'ACTION') => void;
  onStatusChange: (id: string, status: DroneStatus) => void;
  logs: LogEntry[];
}

export const TelemetryPanel: React.FC<TelemetryPanelProps> = ({ 
    data, 
    activeDrone, 
    analysis, 
    feedAnalysis,
    droneAiAnalysis,
    onAnalyze, 
    onAnalyzeFeed,
    onDroneAiAnalyze,
    isTargetingMode, 
    onToggleTargetingMode,
    onAddLog,
    onStatusChange,
    logs
}) => {
  const [waveform, setWaveform] = useState<WaveformType>('SINE');
  const [isEmitting, setIsEmitting] = useState(false);
  const [isCameraLive, setIsCameraLive] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  
  // Helper to determine weather icon
  const getWeatherIcon = (condition: string) => {
      if (condition.includes('Güneş')) return 'fa-sun text-yellow-400';
      if (condition.includes('Bulut')) return 'fa-cloud-sun text-gray-300';
      if (condition.includes('Yağmur') || condition.includes('Sağanak')) return 'fa-cloud-showers-heavy text-blue-400';
      if (condition.includes('Fırtına')) return 'fa-bolt text-purple-400';
      if (condition.includes('Sis')) return 'fa-smog text-slate-400';
      return 'fa-cloud text-gray-400';
  };

  const handleStartIntervention = () => {
      if (!activeDrone) return;
      
      setIsEmitting(true);
      onAddLog(activeDrone.name, `Ses frekans müdahalesi başlatıldı: ${waveform}`, 'ACTION');
      
      // Stop emitting after 3 seconds for simulation
      setTimeout(() => {
          setIsEmitting(false);
          onAddLog(activeDrone.name, `Müdahale tamamlandı.`, 'INFO');
      }, 3000);
  };

  const renderEnvironmentData = () => {
    if (!data) return null;

    const thermalColor = 
        data.thermalAnomaly.level === 'KRİTİK' ? 'text-red-500' : 
        data.thermalAnomaly.level === 'YÜKSEK' ? 'text-orange-500' : 
        data.thermalAnomaly.level === 'ORTA' ? 'text-yellow-400' : 'text-emerald-400';
      
    const thermalBg =
        data.thermalAnomaly.level === 'KRİTİK' ? 'bg-red-500/20 border-red-500/50' : 
        data.thermalAnomaly.level === 'YÜKSEK' ? 'bg-orange-500/20 border-orange-500/50' : 
        data.thermalAnomaly.level === 'ORTA' ? 'bg-yellow-500/20 border-yellow-500/50' : 'bg-emerald-500/20 border-emerald-500/50';

    return (
      <div className="space-y-6 animate-fade-in">
          {/* Main Weather Card */}
          <div className="bg-slate-800/60 p-4 rounded border border-white/10 flex items-center gap-4">
              <div className="text-4xl w-16 text-center">
                  <i className={`fa-solid ${getWeatherIcon(data.weatherCondition)}`}></i>
              </div>
              <div>
                  <div className="text-slate-400 text-xs uppercase tracking-widest mb-1">Anlık Durum</div>
                  <div className="text-white font-bold text-lg">{data.weatherCondition}</div>
                  <div className="text-xs text-slate-400">{data.temperature}°C • {data.humidity}% Nem</div>
              </div>
          </div>

          {/* Detailed Atmospheric Data Grid */}
          <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-800/40 p-2 rounded border border-white/5 relative">
                  <div className="text-[10px] text-slate-500 uppercase">Rüzgar</div>
                  <div className="text-white font-bold flex items-center gap-2">
                     <i className="fa-solid fa-wind text-slate-400 text-xs"></i>
                     {data.windSpeed} <span className="text-[10px] text-slate-500 font-normal">km/h</span>
                     <span className="text-cyan-400 text-xs font-bold ml-1">{data.windDirection}</span>
                  </div>
                  <div className="text-[9px] text-slate-500 mt-1">
                      Hamle: <span className="text-slate-300">{data.gustSpeed} km/h</span>
                  </div>
              </div>
              <div className="bg-slate-800/40 p-2 rounded border border-white/5">
                  <div className="text-[10px] text-slate-500 uppercase">Yağış</div>
                  <div className="text-white font-bold flex items-center gap-2">
                     <i className="fa-solid fa-cloud-rain text-blue-400 text-xs"></i>
                     {data.precipitation} <span className="text-[10px] text-slate-500 font-normal">mm</span>
                  </div>
              </div>
               <div className="bg-slate-800/40 p-2 rounded border border-white/5">
                  <div className="text-[10px] text-slate-500 uppercase">Basınç</div>
                  <div className="text-white font-bold flex items-center gap-2">
                     <i className="fa-solid fa-gauge-high text-emerald-400 text-xs"></i>
                     {data.pressure} <span className="text-[10px] text-slate-500 font-normal">hPa</span>
                  </div>
              </div>
              <div className="bg-slate-800/40 p-2 rounded border border-white/5">
                  <div className="text-[10px] text-slate-500 uppercase">Buharlaşma</div>
                  <div className="text-white font-bold flex items-center gap-2">
                     <i className="fa-solid fa-arrow-up-from-water text-cyan-400 text-xs"></i>
                     {data.evaporation}
                  </div>
              </div>
          </div>

          {/* --- Topography Summary --- */}
          <div className="space-y-2">
              <h3 className="text-xs font-bold text-slate-400 flex items-center gap-2 uppercase tracking-widest">
                  <i className="fa-solid fa-mountain text-cyan-600"></i> Topoğrafya Özeti
              </h3>
              <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-800/40 p-2 rounded border border-white/5">
                      <div className="text-[10px] text-slate-500">MİN YÜKSEKLİK</div>
                      <div className="text-white font-bold">{data.elevationMin}m</div>
                  </div>
                  <div className="bg-slate-800/40 p-2 rounded border border-white/5">
                      <div className="text-[10px] text-slate-500">MAX YÜKSEKLİK</div>
                      <div className="text-white font-bold">{data.elevationMax}m</div>
                  </div>
                  <div className="bg-slate-800/40 p-2 rounded border border-white/5">
                      <div className="text-[10px] text-slate-500">ORT. EĞİM</div>
                      <div className="text-white font-bold">{data.avgSlope}°</div>
                  </div>
                  <div className="bg-slate-800/40 p-2 rounded border border-white/5">
                      <div className="text-[10px] text-slate-500">BASKIN BAKI</div>
                      <div className="text-white font-bold">{data.dominantAspect}</div>
                  </div>
              </div>
          </div>

          {/* --- Land Cover Distribution --- */}
          <div className="space-y-2">
               <h3 className="text-xs font-bold text-slate-400 flex items-center gap-2 uppercase tracking-widest">
                  <i className="fa-solid fa-earth-europe text-green-600"></i> Arazi Örtüsü Dağılımı
              </h3>
              <div className="bg-slate-800/40 p-3 rounded border border-white/5 space-y-3">
                  {data.landCover.map((cover, idx) => (
                      <div key={idx}>
                          <div className="flex justify-between text-xs mb-1">
                              <span className="text-slate-300">{cover.type}</span>
                              <span className="text-slate-400 font-bold">%{cover.percentage}</span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-700 rounded-full overflow-hidden">
                              <div 
                                  className="h-full rounded-full" 
                                  style={{ width: `${cover.percentage}%`, backgroundColor: cover.color }}
                              ></div>
                          </div>
                      </div>
                  ))}
              </div>
          </div>

          {/* --- Thermal Anomaly --- */}
          <div className={`p-4 rounded border ${thermalBg} relative overflow-hidden`}>
               <div className="flex justify-between items-start z-10 relative">
                   <div>
                       <h3 className="text-xs font-bold uppercase tracking-widest opacity-80 mb-1">Termal Anomali</h3>
                       <div className={`text-2xl font-black ${thermalColor} tracking-tighter`}>
                          {data.thermalAnomaly.score}<span className="text-sm font-normal text-slate-400">/100</span>
                       </div>
                   </div>
                   <div className={`px-2 py-1 rounded text-xs font-bold border ${thermalBg} ${thermalColor}`}>
                       {data.thermalAnomaly.level} RİSK
                   </div>
               </div>
               {/* Background Icon */}
               <i className={`fa-solid fa-fire-burner absolute -bottom-4 -right-2 text-6xl opacity-10 ${thermalColor}`}></i>
          </div>

          {/* ── ChatGPT Termal Yorum Paneli ── */}
          <div className="bg-gradient-to-br from-emerald-900/20 to-slate-900/80 border border-emerald-500/30 rounded p-4 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
              <div className="flex justify-between items-center mb-3">
                  <h3 className="text-emerald-400 text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                      <i className="fa-solid fa-robot"></i>
                      ChatGPT Termal Yorum
                  </h3>
                  <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                      <span className="text-[9px] text-emerald-500/70 font-mono">GPT-4o</span>
                  </div>
              </div>
              
              <div className="text-[11px] text-slate-300 leading-relaxed mb-3 min-h-[48px] max-h-52 overflow-y-auto custom-scrollbar whitespace-pre-wrap font-mono bg-black/30 p-3 rounded border border-white/5">
                  {analysis.isLoading ? (
                      <div className="flex items-center gap-2 text-emerald-400 animate-pulse">
                          <i className="fa-solid fa-gear fa-spin"></i>
                          <span>ChatGPT bölge verilerini analiz ediyor...</span>
                      </div>
                  ) : analysis.text ? (
                      analysis.text
                  ) : (
                      <span className="text-slate-600 italic">
                          Bölge verilerini ChatGPT'ye göndererek termal anomali yorumu, 
                          yangın risk değerlendirmesi ve aksiyon önerileri alabilirsiniz.
                      </span>
                  )}
              </div>

              <button 
                  onClick={onAnalyze}
                  disabled={analysis.isLoading}
                  className={`
                      w-full py-2.5 rounded font-bold text-[10px] tracking-widest transition-all
                      flex items-center justify-center gap-2 border
                      ${analysis.isLoading 
                          ? 'bg-emerald-900/30 text-emerald-600 border-emerald-800 cursor-wait' 
                          : 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-600/40 hover:border-emerald-400 hover:text-emerald-200'
                      }
                      disabled:opacity-60
                  `}
              >
                  {analysis.isLoading ? (
                      <><i className="fa-solid fa-circle-notch fa-spin"></i> ANALİZ EDİLİYOR...</>
                  ) : (
                      <><i className="fa-brands fa-openai"></i> CHATGPT İLE ANALİZ ET</>
                  )}
              </button>
          </div>
      </div>
    );
  };

  const renderCameraFeed = (isFull: boolean) => (
      <div className={`relative overflow-hidden group ${isFull ? 'w-full h-full' : 'rounded border border-white/10 h-40'}`}>
          <div className="absolute top-2 left-2 text-[10px] font-mono flex items-center gap-1 z-20 transition-colors duration-300">
            <div className={`w-2 h-2 rounded-full ${isCameraLive ? 'bg-red-500 animate-pulse' : 'bg-slate-500'}`}></div>
            <span className={`bg-black/50 px-1 rounded ${isCameraLive ? 'text-red-500 font-bold' : 'text-slate-400'}`}>
                {isCameraLive ? 'CANLI YAYIN' : 'BAĞLANTI BEKLENİYOR'}
            </span>
          </div>

          {/* Full Screen Toggle Button */}
          {!isFull && (
              <button 
                  onClick={() => setIsFullScreen(true)}
                  className="absolute top-2 right-2 z-20 w-6 h-6 bg-black/50 text-white rounded hover:bg-black/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Tam Ekran"
              >
                  <i className="fa-solid fa-expand text-xs"></i>
              </button>
          )}

          {isFull && (
              <button 
                  onClick={() => setIsFullScreen(false)}
                  className="absolute top-4 right-4 z-50 w-10 h-10 bg-red-600/80 text-white rounded-full hover:bg-red-500 flex items-center justify-center shadow-lg"
                  title="Kapat"
              >
                  <i className="fa-solid fa-xmark"></i>
              </button>
          )}
          
          {isCameraLive ? (
              <>
                {/* Simulated live feed visual */}
                <div className="w-full h-full bg-[url('https://source.unsplash.com/random/800x600/?terrain,forest,mountains,drone')] bg-cover opacity-80 mix-blend-overlay grayscale contrast-125 brightness-75 animate-pulse-slow"></div>
                <div className="absolute inset-0 bg-green-900/10 pointer-events-none"></div>

                 {/* Analyze Button (Only when live) */}
                 <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30">
                     <button 
                        onClick={onAnalyzeFeed}
                        disabled={feedAnalysis?.isLoading}
                        className={`
                            px-4 py-2 rounded-full font-bold text-xs tracking-widest shadow-[0_0_15px_rgba(0,0,0,0.8)] border transition-all flex items-center gap-2
                            ${feedAnalysis?.isLoading 
                                ? 'bg-slate-900/90 text-slate-400 border-slate-700' 
                                : 'bg-cyan-600/90 hover:bg-cyan-500 text-white border-cyan-400'
                            }
                        `}
                     >
                         {feedAnalysis?.isLoading ? (
                             <><i className="fa-solid fa-gear fa-spin"></i> GÖRÜNTÜ İŞLENİYOR...</>
                         ) : (
                             <><i className="fa-solid fa-eye"></i> GÖRÜNTÜ ANALİZİ</>
                         )}
                     </button>
                 </div>
              </>
          ) : (
            <div className="w-full h-full opacity-30 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]"></div>
          )}

          <div className="absolute inset-0 flex items-center justify-center">
            {!isCameraLive && (
                <button 
                    onClick={() => setIsCameraLive(true)}
                    className="bg-slate-800/80 hover:bg-cyan-600 text-white px-4 py-2 rounded text-xs font-bold border border-white/10 backdrop-blur transition-all"
                >
                    <i className="fa-solid fa-video mr-2"></i>
                    BAĞLAN
                </button>
            )}
          </div>

          {/* Camera HUD Overlay */}
          {isCameraLive && (
              <div className="absolute inset-0 p-4 pointer-events-none opacity-80">
                  <div className="w-full h-full border border-white/40 border-dashed rounded relative">
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 border border-cyan-400"></div>
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-[1px] bg-cyan-400/50"></div>
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-20 w-[1px] bg-cyan-400/50"></div>
                      
                      <div className="absolute bottom-2 left-2 text-[10px] font-mono text-cyan-400 bg-black/40 px-2 rounded">
                          ISO: 800 | SHUTTER: 1/2000 | EXP: +0.3
                      </div>
                      <div className="absolute top-2 right-2 text-[10px] font-mono text-white text-right">
                          REC <i className="fa-solid fa-circle text-red-500 text-[8px] animate-pulse"></i><br/>
                          00:04:12
                      </div>
                  </div>
              </div>
          )}

          {/* Analysis Result Overlay inside Camera Feed */}
          {feedAnalysis?.text && isCameraLive && (
              <div className="absolute top-12 left-4 right-4 bg-black/80 border border-cyan-500/50 p-3 rounded z-40 animate-in fade-in slide-in-from-bottom-4">
                  <div className="flex justify-between items-start mb-1">
                      <h4 className="text-cyan-400 text-[10px] font-bold uppercase tracking-widest"><i className="fa-solid fa-robot mr-1"></i> GÖRÜNTÜ İSTİHBARATI</h4>
                      <button onClick={onAnalyzeFeed} className="text-slate-400 hover:text-white"><i className="fa-solid fa-rotate-right text-xs"></i></button>
                  </div>
                  <p className="text-[10px] text-white leading-relaxed font-mono whitespace-pre-wrap">
                      {feedAnalysis.text}
                  </p>
              </div>
          )}
      </div>
  );

  const renderDroneDetails = () => {
    if (!activeDrone) return null;

    // Filter logs for this drone
    const droneLogs = logs
        .filter(l => l.source === activeDrone.name)
        .slice(0, 10); // Last 10

    return (
      <div className="space-y-6 animate-fade-in">
         {/* Drone Header Card */}
         <div className="bg-gradient-to-br from-cyan-900/40 to-slate-900 border border-cyan-500/30 p-4 rounded relative overflow-hidden">
            <div className="absolute top-0 right-0 p-2 opacity-10">
               <i className="fa-solid fa-jet-fighter text-6xl"></i>
            </div>
            
            <div className="relative z-10">
               <div className="text-cyan-400 text-xs font-bold tracking-widest mb-1">{activeDrone.model.toUpperCase()}</div>
               <h2 className="text-2xl font-black text-white mb-2">{activeDrone.name}</h2>
               
               <div className="flex flex-wrap gap-2">
                 <span className={`px-2 py-1 rounded text-[10px] font-bold border uppercase tracking-wider ${
                    activeDrone.status === DroneStatus.PATROLLING || activeDrone.status === DroneStatus.FOLLOWING_PATH ? 'bg-green-500/20 border-green-500 text-green-400' :
                    activeDrone.status === DroneStatus.OFFLINE ? 'bg-red-500/20 border-red-500 text-red-400' :
                    activeDrone.status === DroneStatus.RETURNING ? 'bg-orange-500/20 border-orange-500 text-orange-400' :
                    'bg-yellow-500/20 border-yellow-500 text-yellow-400'
                 }`}>
                   {activeDrone.status}
                 </span>
                 <span className="px-2 py-1 rounded text-[10px] font-bold border border-white/20 text-slate-300 bg-black/20">
                   ID: {activeDrone.id}
                 </span>
               </div>
            </div>
         </div>

         {/* Flight Mode Controls */}
         <div className="grid grid-cols-2 gap-2">
             <button 
               onClick={onToggleTargetingMode}
               disabled={activeDrone.status === DroneStatus.OFFLINE}
               className={`
                 py-2 rounded font-bold text-[10px] tracking-widest transition-all shadow-lg flex items-center justify-center gap-2 border
                 ${isTargetingMode 
                    ? 'bg-yellow-500 text-black border-yellow-400 animate-pulse' 
                    : 'bg-slate-800 text-cyan-400 border-white/10 hover:bg-slate-700'
                 }
                 disabled:opacity-50 disabled:cursor-not-allowed
               `}
             >
               <i className={`fa-solid ${isTargetingMode ? 'fa-location-crosshairs' : 'fa-route'}`}></i>
               ROTA ÇİZ
             </button>

             <button 
                onClick={() => onStatusChange(activeDrone.id, DroneStatus.HOVERING)}
                disabled={activeDrone.status === DroneStatus.OFFLINE || activeDrone.status === DroneStatus.HOVERING}
                className="py-2 rounded font-bold text-[10px] tracking-widest bg-slate-800 text-blue-400 border border-white/10 hover:bg-slate-700 disabled:opacity-50 disabled:bg-blue-900/20 disabled:border-blue-500"
             >
                <i className="fa-solid fa-arrows-up-down-left-right mr-1"></i> SABİTLE
             </button>

             <button 
                onClick={() => onStatusChange(activeDrone.id, DroneStatus.PATROLLING)}
                disabled={activeDrone.status === DroneStatus.OFFLINE || activeDrone.status === DroneStatus.PATROLLING}
                className="py-2 rounded font-bold text-[10px] tracking-widest bg-slate-800 text-green-400 border border-white/10 hover:bg-slate-700 disabled:opacity-50 disabled:bg-green-900/20 disabled:border-green-500"
             >
                <i className="fa-solid fa-binoculars mr-1"></i> DEVRİYE
             </button>

             <button 
                onClick={() => onStatusChange(activeDrone.id, DroneStatus.RETURNING)}
                disabled={activeDrone.status === DroneStatus.OFFLINE || activeDrone.status === DroneStatus.RETURNING}
                className="py-2 rounded font-bold text-[10px] tracking-widest bg-slate-800 text-orange-400 border border-white/10 hover:bg-slate-700 disabled:opacity-50 disabled:bg-orange-900/20 disabled:border-orange-500"
             >
                <i className="fa-solid fa-house-signal mr-1"></i> ÜSSE DÖN
             </button>
         </div>

         {/* Systems Grid */}
         <div className="grid grid-cols-2 gap-3">
             {/* Battery */}
             <div className="bg-slate-800/40 p-3 rounded border border-white/5">
                <div className="flex justify-between items-center mb-2">
                   <span className="text-[10px] text-slate-400 uppercase">Batarya</span>
                   <i className={`fa-solid fa-battery-${activeDrone.battery > 80 ? 'full' : 'quarter'} text-xs ${activeDrone.battery < 20 ? 'text-red-500' : 'text-emerald-400'}`}></i>
                </div>
                <div className="text-2xl font-bold text-white mb-1">%{activeDrone.battery}</div>
                <div className="w-full bg-slate-700 h-1 rounded-full overflow-hidden">
                   <div className={`h-full ${activeDrone.battery < 20 ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${activeDrone.battery}%` }}></div>
                </div>
             </div>

             {/* Signal */}
             <div className="bg-slate-800/40 p-3 rounded border border-white/5">
                <div className="flex justify-between items-center mb-2">
                   <span className="text-[10px] text-slate-400 uppercase">Sinyal</span>
                   <i className="fa-solid fa-tower-broadcast text-xs text-cyan-400"></i>
                </div>
                <div className="text-2xl font-bold text-white mb-1">%{activeDrone.signalQuality}</div>
                <div className="w-full bg-slate-700 h-1 rounded-full overflow-hidden">
                   <div className="h-full bg-cyan-500" style={{ width: `${activeDrone.signalQuality}%` }}></div>
                </div>
             </div>

             {/* Altitude */}
             <div className="bg-slate-800/40 p-3 rounded border border-white/5">
                <div className="text-[10px] text-slate-400 uppercase mb-1">İrtifa (AGL)</div>
                <div className="text-xl font-bold text-white flex items-end gap-1">
                   {activeDrone.altitude} <span className="text-xs font-normal text-slate-500 mb-1">m</span>
                </div>
             </div>

             {/* Speed */}
             <div className="bg-slate-800/40 p-3 rounded border border-white/5">
                <div className="text-[10px] text-slate-400 uppercase mb-1">Hız (GS)</div>
                <div className="text-xl font-bold text-white flex items-end gap-1">
                   {activeDrone.speed} <span className="text-xs font-normal text-slate-500 mb-1">km/h</span>
                </div>
             </div>
         </div>

         {/* Camera Feed Placeholder with Full Screen Capability */}
         {renderCameraFeed(false)}

         {/* Drone System Logs */}
         <div className="bg-slate-900/50 border border-white/10 rounded p-3 max-h-48 overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between mb-2 sticky top-0 bg-slate-900/90 pb-2 border-b border-white/5">
               <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                   <i className="fa-solid fa-file-code mr-2 text-cyan-500"></i>
                   Sistem Kayıtları ({activeDrone.name})
               </h3>
               <span className="text-[9px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-500">CANLI</span>
            </div>
            <div className="space-y-1.5 font-mono text-[10px]">
                {droneLogs.length === 0 ? (
                    <div className="text-slate-600 text-center py-4">Kayıt yok</div>
                ) : (
                    droneLogs.map(log => (
                        <div key={log.id} className="grid grid-cols-[auto_1fr] gap-2">
                            <span className="text-slate-600">{log.timestamp.toLocaleTimeString()}</span>
                            <span className={
                                log.type === 'ALERT' ? 'text-red-400 font-bold' :
                                log.type === 'WARNING' ? 'text-yellow-400' :
                                log.type === 'ACTION' ? 'text-cyan-300' : 'text-slate-400'
                            }>
                                {log.type === 'ACTION' && '> '}
                                {log.message}
                            </span>
                        </div>
                    ))
                )}
            </div>
         </div>

         {/* --- Audio Intervention Panel --- */}
         <div className="bg-gradient-to-br from-emerald-900/20 to-slate-900/80 border border-emerald-500/30 rounded p-4 relative overflow-hidden">
             <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
             <div className="flex justify-between items-center mb-3">
                 <h3 className="text-emerald-400 text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                     <i className="fa-solid fa-robot"></i>
                     ChatGPT Drone Analizi
                 </h3>
                 <div className="flex items-center gap-1.5">
                     <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                     <span className="text-[9px] text-emerald-500/70 font-mono">GPT-4o</span>
                 </div>
             </div>

             <div className="text-[10px] text-slate-400 mb-3 flex items-center gap-2 bg-black/20 px-2 py-1.5 rounded border border-white/5">
                 <i className="fa-solid fa-info-circle text-emerald-500/60"></i>
                 <span>Drone telemetri verileri, konum bilgileri ve algılama sonuçları ChatGPT'ye gönderilir.</span>
             </div>
              
             <div className="text-[11px] text-slate-300 leading-relaxed mb-3 min-h-[60px] max-h-64 overflow-y-auto custom-scrollbar whitespace-pre-wrap font-mono bg-black/30 p-3 rounded border border-white/5">
                 {droneAiAnalysis?.isLoading ? (
                     <div className="flex items-center gap-2 text-emerald-400 animate-pulse">
                         <i className="fa-solid fa-satellite-dish fa-spin"></i>
                         <span>ChatGPT drone verilerini işliyor...</span>
                     </div>
                 ) : droneAiAnalysis?.text ? (
                     droneAiAnalysis.text
                 ) : (
                     <span className="text-slate-600 italic">
                         Drone'un mevcut durum bilgileri, telemetri verileri, 
                         batarya durumu, sinyal kalitesi ve bölge verileri 
                         ChatGPT'ye gönderilerek detaylı operasyonel analiz 
                         ve risk değerlendirmesi yapılabilir.
                     </span>
                 )}
             </div>

             <button 
                 onClick={onDroneAiAnalyze}
                 disabled={droneAiAnalysis?.isLoading}
                 className={`
                     w-full py-2.5 rounded font-bold text-[10px] tracking-widest transition-all
                     flex items-center justify-center gap-2 border
                     ${droneAiAnalysis?.isLoading 
                         ? 'bg-emerald-900/30 text-emerald-600 border-emerald-800 cursor-wait' 
                         : 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-600/40 hover:border-emerald-400 hover:text-emerald-200'
                     }
                     disabled:opacity-60
                 `}
             >
                 {droneAiAnalysis?.isLoading ? (
                     <><i className="fa-solid fa-circle-notch fa-spin"></i> VERİLER İŞLENİYOR...</>
                 ) : (
                     <><i className="fa-brands fa-openai"></i> DRONE'U CHATGPT İLE ANALİZ ET</>
                 )}
             </button>
         </div>

         {/* --- Ses Frekans Müdahalesi --- */}
         <div className="bg-slate-900/80 border border-purple-500/30 rounded p-4 relative overflow-hidden">
             <div className="absolute top-0 left-0 w-1 h-full bg-purple-500"></div>
             <h3 className="text-purple-400 text-xs font-bold mb-3 flex items-center gap-2 uppercase tracking-widest">
                 <i className="fa-solid fa-wave-square"></i> Ses Frekans Müdahalesi
             </h3>
             
             {/* Waveform Selectors */}
             <div className="flex gap-2 mb-4">
                 <button 
                   onClick={() => setWaveform('SINE')}
                   className={`flex-1 py-2 text-[10px] font-bold rounded border flex flex-col items-center gap-1 transition-all ${waveform === 'SINE' ? 'bg-purple-500/20 border-purple-400 text-purple-300' : 'bg-slate-800/50 border-white/10 text-slate-500 hover:border-purple-500/30'}`}
                 >
                     <i className="fa-solid fa-water"></i>
                     SİNÜS
                 </button>
                 <button 
                   onClick={() => setWaveform('SQUARE')}
                   className={`flex-1 py-2 text-[10px] font-bold rounded border flex flex-col items-center gap-1 transition-all ${waveform === 'SQUARE' ? 'bg-purple-500/20 border-purple-400 text-purple-300' : 'bg-slate-800/50 border-white/10 text-slate-500 hover:border-purple-500/30'}`}
                 >
                     <i className="fa-solid fa-square-full text-[8px]"></i>
                     KARE
                 </button>
                 <button 
                   onClick={() => setWaveform('SAWTOOTH')}
                   className={`flex-1 py-2 text-[10px] font-bold rounded border flex flex-col items-center gap-1 transition-all ${waveform === 'SAWTOOTH' ? 'bg-purple-500/20 border-purple-400 text-purple-300' : 'bg-slate-800/50 border-white/10 text-slate-500 hover:border-purple-500/30'}`}
                 >
                     <i className="fa-solid fa-caret-up"></i>
                     TESTERE
                 </button>
             </div>

             <button 
               onClick={handleStartIntervention}
               disabled={isEmitting || activeDrone.status === DroneStatus.OFFLINE}
               className={`
                 w-full py-2 rounded font-bold text-xs tracking-widest transition-all
                 flex items-center justify-center gap-2
                 ${isEmitting 
                    ? 'bg-red-500 text-white animate-pulse' 
                    : 'bg-purple-900/50 text-purple-300 border border-purple-500/30 hover:bg-purple-800 hover:text-white'
                 }
                  disabled:opacity-50 disabled:cursor-not-allowed
               `}
             >
               {isEmitting ? (
                   <>
                     <i className="fa-solid fa-tower-broadcast fa-fade"></i>
                     SİNYAL GÖNDERİLİYOR...
                   </>
               ) : (
                   <>
                     <i className="fa-solid fa-play"></i>
                     MÜDAHALEYE BAŞLA
                   </>
               )}
             </button>
         </div>
      </div>
    );
  };

  return (
    <>
      <div className="h-full flex flex-col p-4 overflow-y-auto custom-scrollbar">
         {/* Header */}
         <div className="mb-4 pb-4 border-b border-white/10 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-400 tracking-widest flex items-center gap-2">
               <i className="fa-solid fa-chart-line text-cyan-500"></i>
               TELEMETRİ & ANALİZ
            </h2>
            {data && (
               <div className="text-[10px] font-mono text-slate-500">
                  GRID: {data.x}-{data.y}
               </div>
            )}
         </div>

         {/* Content */}
         <div className="space-y-4">
            {activeDrone ? renderDroneDetails() : data ? renderEnvironmentData() : (
                <div className="text-center py-20 text-slate-500">
                    <i className="fa-solid fa-satellite-dish text-4xl mb-4 opacity-20"></i>
                    <p className="text-xs">Veri görüntülemek için haritadan bir bölge veya drone seçin.</p>
                </div>
            )}
         </div>

         {/* Data for Selected Drone Region (User Requirement: Show region info when drone selected) */}
         {activeDrone && data && (
             <div className="mt-8 pt-8 border-t border-white/10">
                 <h3 className="text-xs font-bold text-slate-400 mb-4 flex items-center gap-2 uppercase tracking-widest">
                     <i className="fa-solid fa-map-location-dot text-cyan-500"></i>
                     MEVCUT KONUM VERİLERİ
                 </h3>
                 {renderEnvironmentData()}
             </div>
         )}

         {/* AI Analysis now integrated into ChatGPT Termal Yorum panel above */}
      </div>

      {/* Full Screen Camera Modal */}
      {isFullScreen && (
          <div className="fixed inset-0 z-[100] bg-black flex flex-col">
               <div className="flex-1 relative">
                   {renderCameraFeed(true)}
               </div>
          </div>
      )}
    </>
  );
};