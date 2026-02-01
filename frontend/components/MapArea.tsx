import React, { useEffect, useRef, useState } from 'react';
import { Drone, Coordinates } from '../types';
import { GRID_SIZE, GOOGLE_MAPS_API_KEY, MAP_CENTER, MAP_STYLE } from '../constants';
import { getCellTopology, getSectorCode } from '../utils/gridGenerator';

declare var google: any;

interface MapAreaProps {
  drones: Drone[];
  selectedCell: Coordinates | null;
  onSelectCell: (coords: Coordinates) => void;
  gridOrigin: { lat: number, lng: number };
  onUpdateGridOrigin: (origin: { lat: number, lng: number }) => void;
  cellSize: number;
  onUpdateCellSize: (size: number) => void;
  selectedDroneId: string | null;
  isTargetingMode: boolean;
  getGridTemperature: (x: number, y: number) => number;
  isMeasuringMode: boolean;
  measurementPoints: { start: Coordinates | null, end: Coordinates | null };
}

export const MapArea: React.FC<MapAreaProps> = ({ 
  drones, 
  selectedCell, 
  onSelectCell, 
  gridOrigin, 
  onUpdateGridOrigin,
  cellSize,
  onUpdateCellSize,
  selectedDroneId,
  isTargetingMode,
  getGridTemperature,
  isMeasuringMode,
  measurementPoints
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const gridRectanglesRef = useRef<any[]>([]);
  const previewRectanglesRef = useRef<any[]>([]); // For ghost grid
  const droneMarkersRef = useRef<any[]>([]);
  const flightPathPolylineRef = useRef<any>(null); // For path visualization
  const measurementPolylineRef = useRef<any>(null);
  const measurementLabelRef = useRef<any>(null);
  const cellLabelMarkersRef = useRef<any[]>([]); // For region name labels
  
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRelocating, setIsRelocating] = useState(false);
  const [previewOrigin, setPreviewOrigin] = useState<{ lat: number, lng: number } | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(false);

  // Load Google Maps Script
  useEffect(() => {
    if ((window as any).google && (window as any).google.maps) {
      setIsScriptLoaded(true);
      return;
    }

    if (!GOOGLE_MAPS_API_KEY) {
      setLoadError("Google Maps API Key eksik! Lütfen 'GOOGLE_MAPS_API_KEY' environment değişkenini ayarlayın.");
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=geometry`;
    script.async = true;
    script.defer = true;
    script.onload = () => setIsScriptLoaded(true);
    script.onerror = () => setLoadError("Google Maps yüklenirken hata oluştu.");
    document.head.appendChild(script);

    return () => {
    };
  }, []);

  // Initialize Map
  useEffect(() => {
    if (!isScriptLoaded || !mapRef.current || mapInstanceRef.current) return;

    mapInstanceRef.current = new google.maps.Map(mapRef.current, {
      center: MAP_CENTER,
      zoom: 15,
      styles: MAP_STYLE,
      disableDefaultUI: true, // We will build custom controls
      mapTypeId: 'satellite',
      tilt: 45, // Pseudo-3D effect
      draggableCursor: 'default',
      zoomControl: false, 
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
    });
    
  }, [isScriptLoaded]);

  // Handle Relocation Interaction (Click & Hover)
  useEffect(() => {
      if (!mapInstanceRef.current) return;

      google.maps.event.clearListeners(mapInstanceRef.current, 'click');
      google.maps.event.clearListeners(mapInstanceRef.current, 'mousemove');

      if (isRelocating) {
        // Hover Listener for Ghost Grid
        mapInstanceRef.current.addListener("mousemove", (e: any) => {
            const lat = e.latLng.lat();
            const lng = e.latLng.lng();
            setPreviewOrigin({ lat, lng });
        });

        // Click Listener to Confirm
        mapInstanceRef.current.addListener("click", (e: any) => {
              const newLat = e.latLng.lat();
              const newLng = e.latLng.lng();
              onUpdateGridOrigin({ lat: newLat, lng: newLng });
              setIsRelocating(false);
              setPreviewOrigin(null); // Clear ghost grid
              mapInstanceRef.current.setOptions({ draggableCursor: 'default' });
        });

        mapInstanceRef.current.setOptions({ draggableCursor: 'crosshair' });

      } else {
         // Normal interactions (managed by grid rectangle events)
         let cursor = 'default';
         if (isTargetingMode) cursor = 'crosshair';
         if (isMeasuringMode) cursor = 'context-menu'; // Different cursor for measuring
         
         mapInstanceRef.current.setOptions({ draggableCursor: cursor });
         setPreviewOrigin(null);
      }

  }, [isRelocating, onUpdateGridOrigin, isTargetingMode, isMeasuringMode]);

  // Render Ghost Grid (Preview)
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    // Clear previous ghost grid
    previewRectanglesRef.current.forEach(rect => rect.setMap(null));
    previewRectanglesRef.current = [];

    if (isRelocating && previewOrigin) {
        const rectangles: any[] = [];
        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
              const north = previewOrigin.lat - (y * cellSize);
              const south = previewOrigin.lat - ((y + 1) * cellSize);
              const west = previewOrigin.lng + (x * cellSize);
              const east = previewOrigin.lng + ((x + 1) * cellSize);
      
              const bounds = { north, south, east, west };
      
              const rectangle = new google.maps.Rectangle({
                strokeColor: "#eab308", // Yellow for preview
                strokeOpacity: 0.8,
                strokeWeight: 1,
                fillColor: "#eab308",
                fillOpacity: 0.2,
                map: mapInstanceRef.current,
                bounds: bounds,
                clickable: false, 
              });
              rectangles.push(rectangle);
            }
          }
          previewRectanglesRef.current = rectangles;
    }
  }, [previewOrigin, isRelocating, cellSize]);

  // Heatmap Color Helper
  const getThermalColor = (temp: number) => {
    if (temp >= 30) return "#ef4444"; // Red
    if (temp >= 20) return "#f97316"; // Orange
    if (temp >= 10) return "#eab308"; // Yellow
    if (temp >= 0) return "#22d3ee";  // Cyan
    return "#3b82f6"; // Blue
  };

  // Draw/Update Active Grid
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    // Clear existing rectangles
    gridRectanglesRef.current.forEach(rect => rect.setMap(null));
    gridRectanglesRef.current = [];

    // Don't render active grid if relocating (ghost grid takes over visually)
    if (isRelocating) return;

    const rectangles: any[] = [];
    
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        // Use prop gridOrigin
        const north = gridOrigin.lat - (y * cellSize);
        const south = gridOrigin.lat - ((y + 1) * cellSize);
        const west = gridOrigin.lng + (x * cellSize);
        const east = gridOrigin.lng + ((x + 1) * cellSize);

        const bounds = { north, south, east, west };

        // Determine styling
        let strokeColor = "#22d3ee"; // Cyan default
        let fillColor = "#22d3ee";
        let fillOpacity = 0.05;
        let strokeOpacity = 0.3;

        if (showHeatmap) {
            const temp = getGridTemperature(x, y);
            fillColor = getThermalColor(temp);
            strokeColor = fillColor;
            fillOpacity = 0.4;
            strokeOpacity = 0.5;
        }

        const rectangle = new google.maps.Rectangle({
          strokeColor: strokeColor,
          strokeOpacity: strokeOpacity,
          strokeWeight: 1,
          fillColor: fillColor,
          fillOpacity: fillOpacity,
          map: mapInstanceRef.current,
          bounds: bounds,
          clickable: true,
        });

        // Click Listener for Grid Cell
        rectangle.addListener("click", () => {
             onSelectCell({ x, y });
        });

        // Hover effects
        rectangle.addListener("mouseover", () => {
           if (selectedCell?.x !== x || selectedCell?.y !== y) {
             const cursorType = isMeasuringMode ? 'context-menu' : (isTargetingMode ? 'crosshair' : 'pointer');
             rectangle.setOptions({ 
                 fillOpacity: showHeatmap ? 0.6 : 0.2,
                 cursor: cursorType
             });
           }
        });
        rectangle.addListener("mouseout", () => {
           if (selectedCell?.x !== x || selectedCell?.y !== y) {
             rectangle.setOptions({ fillOpacity: showHeatmap ? 0.4 : 0.05 });
           }
        });

        rectangles.push(rectangle);
      }
    }
    gridRectanglesRef.current = rectangles;

  }, [isScriptLoaded, gridOrigin, isRelocating, cellSize, showHeatmap, getGridTemperature, isTargetingMode, isMeasuringMode]); 

  // Render Region Labels on Grid Cells
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    // Clear existing labels
    cellLabelMarkersRef.current.forEach(marker => marker.setMap(null));
    cellLabelMarkersRef.current = [];

    // Don't render labels if relocating
    if (isRelocating) return;

    const markers: any[] = [];

    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const centerLat = gridOrigin.lat - (y * cellSize) - (cellSize / 2);
        const centerLng = gridOrigin.lng + (x * cellSize) + (cellSize / 2);

        const sectorCode = getSectorCode(x, y);
        const topology = getCellTopology(x, y, gridOrigin, cellSize);

        // Topology icon
        let icon = '📍';
        if (topology.includes('Orman')) icon = '🌲';
        else if (topology.includes('Kentsel')) icon = '🏘️';
        else if (topology.includes('Su')) icon = '💧';
        else if (topology.includes('Dağ')) icon = '⛰️';
        else if (topology.includes('Engebe')) icon = '🏔️';
        else if (topology.includes('Düz') || topology.includes('Ova')) icon = '🌾';

        // Sector code label (top of cell)
        const sectorMarker = new google.maps.Marker({
          position: { lat: centerLat + cellSize * 0.25, lng: centerLng },
          map: mapInstanceRef.current,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 0,
          },
          label: {
            text: sectorCode,
            color: '#22d3ee',
            fontSize: '11px',
            fontWeight: 'bold',
            fontFamily: 'monospace',
          },
          clickable: false,
          zIndex: 5,
        });
        markers.push(sectorMarker);

        // Topology label (bottom of cell)
        const topoMarker = new google.maps.Marker({
          position: { lat: centerLat - cellSize * 0.15, lng: centerLng },
          map: mapInstanceRef.current,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 0,
          },
          label: {
            text: `${icon} ${topology}`,
            color: '#94a3b8',
            fontSize: '9px',
            fontWeight: 'normal',
            fontFamily: 'sans-serif',
          },
          clickable: false,
          zIndex: 5,
        });
        markers.push(topoMarker);
      }
    }

    cellLabelMarkersRef.current = markers;
  }, [isScriptLoaded, gridOrigin, isRelocating, cellSize]);

  // Update Grid Selection Visuals
  useEffect(() => {
    gridRectanglesRef.current.forEach((rect, index) => {
      const x = index % GRID_SIZE;
      const y = Math.floor(index / GRID_SIZE);
      const isSelected = selectedCell?.x === x && selectedCell?.y === y;
      
      // Measurement highlights
      const isMeasurementStart = measurementPoints.start?.x === x && measurementPoints.start?.y === y;
      const isMeasurementEnd = measurementPoints.end?.x === x && measurementPoints.end?.y === y;

      // Base styles
      let strokeColor = "#22d3ee";
      let fillColor = "#22d3ee";
      let fillOpacity = 0.05;

      if (showHeatmap) {
          const temp = getGridTemperature(x, y);
          fillColor = getThermalColor(temp);
          strokeColor = fillColor;
          fillOpacity = 0.4;
      }

      // Override for selection
      if (isSelected) {
          strokeColor = "#ffffff";
          fillOpacity = showHeatmap ? 0.7 : 0.4;
      }
      
      if (isMeasurementStart || isMeasurementEnd) {
          strokeColor = "#a855f7"; // Purple
          fillOpacity = 0.6;
          fillColor = "#a855f7";
      }

      rect.setOptions({
        strokeColor: strokeColor,
        strokeWeight: (isSelected || isMeasurementStart || isMeasurementEnd) ? 2 : 1,
        fillColor: fillColor,
        fillOpacity: fillOpacity,
        strokeOpacity: (isSelected || isMeasurementStart || isMeasurementEnd) ? 1 : (showHeatmap ? 0.5 : 0.3)
      });
    });
  }, [selectedCell, showHeatmap, getGridTemperature, measurementPoints]);

  // Render Drones
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    // Clear existing markers
    droneMarkersRef.current.forEach(marker => marker.setMap(null));
    droneMarkersRef.current = [];

    // Only render drones if grid is active (optional, but cleaner)
    if (isRelocating) return;

    drones.forEach(drone => {
      // Calculate LatLng based on Grid Position + Center offset
      const lat = gridOrigin.lat - (drone.position.y * cellSize) - (cellSize / 2);
      const lng = gridOrigin.lng + (drone.position.x * cellSize) + (cellSize / 2);

      // Color based on status
      let color = "#22d3ee"; // Cyan
      if (drone.status === 'Çevrimdışı') color = "#ef4444"; // Red
      if (drone.status === 'Dönüyor') color = "#fbbf24"; // Amber
      if (drone.status === 'Havada Sabit') color = "#3b82f6"; // Blue
      if (drone.status === 'Rota Takibi') color = "#a855f7"; // Purple

      // Check if this drone is selected for visual highlight
      const isSelected = drone.id === selectedDroneId;
      const scale = isSelected ? 1.8 : 1.5;
      const strokeColor = isSelected ? "#ffffff" : "#e2e8f0";
      const strokeWeight = isSelected ? 2 : 1;

      const svgIcon = {
        path: "M12 2L2 19h20L12 2zm0 3l6 11H6l6-11z", 
        fillColor: color,
        fillOpacity: 1,
        strokeWeight: strokeWeight,
        strokeColor: strokeColor,
        rotation: 0, 
        scale: scale,
        anchor: new google.maps.Point(12, 12),
      };

      const marker = new google.maps.Marker({
        position: { lat, lng },
        map: mapInstanceRef.current,
        icon: svgIcon,
        title: drone.name,
        zIndex: isSelected ? 100 : 10, // Bring selected to front
        animation: isSelected ? google.maps.Animation.BOUNCE : null, // Optional bounce
      });

      droneMarkersRef.current.push(marker);
    });

  }, [drones, gridOrigin, cellSize, isRelocating, selectedDroneId]); 

  // Render Flight Path for Selected Drone
  useEffect(() => {
      if (!mapInstanceRef.current) return;

      if (flightPathPolylineRef.current) {
          flightPathPolylineRef.current.setMap(null);
          flightPathPolylineRef.current = null;
      }

      if (!selectedDroneId) return;

      const drone = drones.find(d => d.id === selectedDroneId);
      if (!drone || drone.flightPath.length === 0) return;

      const pathCoordinates = [
          ...drone.flightPath,
          drone.position
      ].map(pos => ({
          lat: gridOrigin.lat - (pos.y * cellSize) - (cellSize / 2),
          lng: gridOrigin.lng + (pos.x * cellSize) + (cellSize / 2)
      }));

      const polyline = new google.maps.Polyline({
          path: pathCoordinates,
          geodesic: true,
          strokeColor: "#22d3ee",
          strokeOpacity: 0.6,
          strokeWeight: 3,
          map: mapInstanceRef.current,
          icons: [{
            icon: { path: google.maps.SymbolPath.CIRCLE, scale: 3, fillColor: '#22d3ee', fillOpacity: 1, strokeOpacity: 0 },
            offset: '0',
            repeat: '20px'
          }],
      });

      flightPathPolylineRef.current = polyline;

  }, [drones, selectedDroneId, gridOrigin, cellSize]);

  // Render Measurement Line
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    if (measurementPolylineRef.current) {
        measurementPolylineRef.current.setMap(null);
        measurementPolylineRef.current = null;
    }
    if (measurementLabelRef.current) {
        measurementLabelRef.current.setMap(null);
        measurementLabelRef.current = null;
    }

    if (measurementPoints.start && measurementPoints.end) {
        const startLat = gridOrigin.lat - (measurementPoints.start.y * cellSize) - (cellSize / 2);
        const startLng = gridOrigin.lng + (measurementPoints.start.x * cellSize) + (cellSize / 2);
        const endLat = gridOrigin.lat - (measurementPoints.end.y * cellSize) - (cellSize / 2);
        const endLng = gridOrigin.lng + (measurementPoints.end.x * cellSize) + (cellSize / 2);

        const path = [{ lat: startLat, lng: startLng }, { lat: endLat, lng: endLng }];

        // Draw Line
        const polyline = new google.maps.Polyline({
            path: path,
            geodesic: true,
            strokeColor: "#a855f7",
            strokeOpacity: 1.0,
            strokeWeight: 4,
            map: mapInstanceRef.current,
        });
        measurementPolylineRef.current = polyline;

        // Calculate Distance
        const distMeters = google.maps.geometry.spherical.computeDistanceBetween(
            new google.maps.LatLng(startLat, startLng),
            new google.maps.LatLng(endLat, endLng)
        );
        
        // Draw Label Marker (invisible marker with label)
        const midLat = (startLat + endLat) / 2;
        const midLng = (startLng + endLng) / 2;

        const labelMarker = new google.maps.Marker({
            position: { lat: midLat, lng: midLng },
            map: mapInstanceRef.current,
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 0, 
            },
            label: {
                text: `${(distMeters / 1000).toFixed(2)} km`,
                color: "#a855f7",
                fontSize: "14px",
                fontWeight: "bold",
                className: "bg-black/80 px-2 py-1 rounded text-white" 
            }
        });
        measurementLabelRef.current = labelMarker;
    }

  }, [measurementPoints, gridOrigin, cellSize]);

  const handleZoom = (delta: number) => {
    if (mapInstanceRef.current) {
        const currentZoom = mapInstanceRef.current.getZoom();
        mapInstanceRef.current.setZoom(currentZoom + delta);
    }
  };

  if (loadError) return <div className="text-red-500 p-8">{loadError}</div>;
  if (!isScriptLoaded) return <div className="text-cyan-500 p-8">Yükleniyor...</div>;

  return (
    <div className="relative w-full h-full bg-slate-900 group">
      <div ref={mapRef} className="absolute inset-0 w-full h-full" />
      
      <div className="absolute inset-0 pointer-events-none opacity-20 bg-[url('https://www.transparenttextures.com/patterns/diagmonds-light.png')]"></div>

      {/* Targeting Overlay */}
      {isTargetingMode && (
         <div className="absolute inset-0 pointer-events-none border-4 border-yellow-500/50 z-10 animate-pulse bg-yellow-500/5">
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-yellow-500 text-lg font-bold bg-black/50 px-4 py-2 rounded">
                 YENİ ROTA İÇİN HARİTAYA TIKLAYIN
             </div>
         </div>
      )}
      
      {/* Measurement Overlay */}
      {isMeasuringMode && (
         <div className="absolute inset-0 pointer-events-none border-4 border-purple-500/50 z-10 bg-purple-500/5">
         </div>
      )}

      {/* Manual Zoom Controls (Bottom Right) */}
      <div className="absolute bottom-32 right-8 flex flex-col gap-2 z-20">
          <button 
            onClick={() => handleZoom(1)}
            className="w-10 h-10 bg-slate-800/90 text-white rounded border border-white/20 hover:bg-slate-700 flex items-center justify-center shadow-lg active:scale-95 transition-transform"
          >
            <i className="fa-solid fa-plus"></i>
          </button>
          <button 
            onClick={() => handleZoom(-1)}
            className="w-10 h-10 bg-slate-800/90 text-white rounded border border-white/20 hover:bg-slate-700 flex items-center justify-center shadow-lg active:scale-95 transition-transform"
          >
            <i className="fa-solid fa-minus"></i>
          </button>
      </div>

      {/* Heatmap Toggle (Top Right) */}
      <div className="absolute top-20 right-8 z-20">
          <button
             onClick={() => setShowHeatmap(!showHeatmap)}
             className={`
                px-4 py-2 rounded border font-bold text-xs tracking-wider shadow-lg backdrop-blur transition-all
                flex items-center gap-2
                ${showHeatmap 
                    ? 'bg-red-500/80 border-red-400 text-white' 
                    : 'bg-slate-900/80 border-white/20 text-slate-300 hover:text-white'
                }
             `}
          >
             <i className="fa-solid fa-fire-burner"></i>
             TERMAL HARİTA
          </button>
      </div>

      {/* Controls Bar */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex flex-col md:flex-row items-center gap-4 w-full max-w-xl px-4">
         
         {/* Relocate Button */}
         <button 
           onClick={() => setIsRelocating(!isRelocating)}
           className={`
             flex-shrink-0 flex items-center gap-2 px-6 py-3 rounded-full shadow-lg border backdrop-blur-md transition-all
             font-bold tracking-widest text-xs uppercase whitespace-nowrap
             ${isRelocating 
               ? 'bg-yellow-500/80 border-yellow-400 text-black hover:bg-yellow-500 animate-pulse' 
               : 'bg-black/80 border-cyan-500/30 text-cyan-400 hover:bg-cyan-900/50 hover:border-cyan-400'
             }
           `}
         >
           <i className={`fa-solid ${isRelocating ? 'fa-location-dot' : 'fa-arrows-up-down-left-right'}`}></i>
           {isRelocating ? 'Konumu Onayla' : 'Grid Taşı'}
         </button>

         {/* Grid Size Slider */}
         <div className="flex-1 bg-black/80 backdrop-blur-md border border-white/10 rounded-full px-6 py-3 flex items-center gap-4 w-full">
            <span className="text-xs font-mono text-slate-400 whitespace-nowrap">
              <i className="fa-solid fa-maximize mr-2"></i>
              GRID BOYUTU
            </span>
            <input 
              type="range" 
              min="0.0005" 
              max="0.01" 
              step="0.0001"
              value={cellSize}
              onChange={(e) => onUpdateCellSize(parseFloat(e.target.value))}
              className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
            <span className="text-xs font-mono text-cyan-400 w-12 text-right">
              {Math.round(cellSize * 111139)}m
            </span>
         </div>
      </div>
    </div>
  );
};