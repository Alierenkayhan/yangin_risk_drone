import React, { useState } from 'react';
import { Drone, DroneStatus, LogEntry } from '../types';

interface FleetPanelProps {
  drones: Drone[];
  onSelectDrone: (id: string) => void;
  selectedDroneId: string | null;
  logs: LogEntry[];
}

export const FleetPanel: React.FC<FleetPanelProps> = ({ drones, onSelectDrone, selectedDroneId, logs }) => {
  const [activeTab, setActiveTab] = useState<'FLEET' | 'LOGS'>('FLEET');

  const selectedDrone = drones.find(d => d.id === selectedDroneId);

  // Filter logs: If a drone is selected, show only its logs + generic System/AI logs. 
  // If no drone selected, show only System/Network generic logs (or all, depending on preference. Here: Global view).
  const filteredLogs = selectedDroneId
    ? logs.filter(l => l.source === selectedDrone?.name || l.source === 'AI' || (l.source === 'SYSTEM' && l.type === 'ALERT'))
    : logs;

  return (
    <div className="h-full flex flex-col font-mono">
      {/* Tabs */}
      <div className="flex border-b border-white/10">
          <button 
            onClick={() => setActiveTab('FLEET')}
            className={`flex-1 py-3 text-xs font-bold tracking-widest transition-colors ${activeTab === 'FLEET' ? 'bg-cyan-900/30 text-cyan-400 border-b-2 border-cyan-400' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
          >
            FİLO
          </button>
          <button 
            onClick={() => setActiveTab('LOGS')}
            className={`flex-1 py-3 text-xs font-bold tracking-widest transition-colors ${activeTab === 'LOGS' ? 'bg-cyan-900/30 text-cyan-400 border-b-2 border-cyan-400' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
          >
            {selectedDroneId ? 'DRONE LOG' : 'SİSTEM LOG'}
          </button>
      </div>

      {activeTab === 'FLEET' ? (
        <>
            <div className="p-3 bg-slate-900/50 flex justify-between items-center text-xs text-slate-400 border-b border-white/5">
                <span>DURUM</span>
                <span className="bg-slate-800 px-2 py-0.5 rounded text-slate-300">
                {drones.filter(d => d.status !== DroneStatus.OFFLINE).length} AKTİF
                </span>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {drones.map(drone => {
                const isSelected = drone.id === selectedDroneId;
                return (
                    <div 
                    key={drone.id}
                    onClick={() => onSelectDrone(drone.id)}
                    className={`
                        p-3 rounded border cursor-pointer transition-all
                        ${drone.status === DroneStatus.OFFLINE ? 'opacity-60 grayscale' : ''}
                        ${isSelected 
                        ? 'bg-cyan-900/30 border-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.2)]' 
                        : 'border-white/5 hover:bg-white/5 hover:border-cyan-500/30'
                        }
                    `}
                    >
                    <div className="flex justify-between items-start mb-2">
                        <span className={`font-bold ${isSelected ? 'text-cyan-300' : 'text-slate-200'}`}>{drone.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                        drone.status === DroneStatus.PATROLLING ? 'border-green-500/50 text-green-400 bg-green-500/10' :
                        drone.status === DroneStatus.OFFLINE ? 'border-red-500/50 text-red-400 bg-red-500/10' :
                        'border-yellow-500/50 text-yellow-400 bg-yellow-500/10'
                        }`}>
                        {drone.status}
                        </span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
                        <div className="flex items-center gap-1.5">
                        <i className={`fa-solid fa-battery-${drone.battery > 80 ? 'full' : drone.battery > 20 ? 'quarter' : 'empty'} ${drone.battery < 20 ? 'text-red-500' : 'text-emerald-400'}`}></i>
                        <span>{drone.battery}%</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                        <i className="fa-solid fa-location-crosshairs text-cyan-500"></i>
                        <span>{drone.position.x},{drone.position.y}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                        <i className="fa-solid fa-arrows-up-down text-purple-400"></i>
                        <span>{drone.altitude}m</span>
                        </div>
                    </div>
                    </div>
                );
                })}
            </div>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto bg-black/40 p-2 font-mono text-[10px]">
             {filteredLogs.length === 0 && (
                 <div className="text-center py-8 text-slate-500 italic">
                     Bu kaynak için kayıt bulunamadı.
                 </div>
             )}
             {filteredLogs.map(log => (
                 <div key={log.id} className="mb-2 p-2 border-l-2 border-white/10 bg-white/5 rounded-r">
                     <div className="flex justify-between text-slate-500 mb-1">
                         <span>{log.timestamp.toLocaleTimeString()}</span>
                         <span className={`font-bold ${
                             log.type === 'ALERT' ? 'text-red-500' :
                             log.type === 'WARNING' ? 'text-yellow-500' :
                             log.type === 'ACTION' ? 'text-cyan-400' : 'text-slate-400'
                         }`}>{log.source}</span>
                     </div>
                     <div className={`
                         ${log.type === 'ALERT' ? 'text-red-300' : 'text-slate-300'}
                     `}>
                         {log.type === 'ACTION' && <i className="fa-solid fa-angle-right mr-1 text-cyan-500"></i>}
                         {log.message}
                     </div>
                 </div>
             ))}
        </div>
      )}
    </div>
  );
};