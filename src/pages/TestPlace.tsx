import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { 
  Upload, 
  Play, 
  Pause, 
  Settings2, 
  Activity, 
  Target, 
  ChevronLeft,
  Terminal,
  Cpu,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useBlobTracker } from '../hooks/useBlobTracker';
import { BlobData, TrackingConfig, VideoFilters } from '../types';

const MESH_DISTANCE_THRESHOLD = 150;

export default function TestPlace() {
  // --- State ---
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isCvLoaded, setIsCvLoaded] = useState(false);
  const [config, setConfig] = useState<TrackingConfig>({
    threshold: 50,
    minSize: 10,
    maxSize: 1000,
    blur: 3,
    sensitivity: 197,
    showBoxes: true,
    showCenters: true,
    showTrails: true,
    showMesh: true,
    showCoords: true,
    mode: 'threshold',
    blobColor: '#00ff00',
    trailHue: 120,
    lineThickness: 2
  });
  const [filters, setFilters] = useState<VideoFilters>({
    brightness: 0,
    contrast: 1,
    saturation: 1,
    sharpness: 0
  });
  const [isMuted, setIsMuted] = useState(false);

  // --- Refs ---
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  // --- OpenCV Initialization ---
  useEffect(() => {
    const checkCv = setInterval(() => {
      if (window.cv && window.cv.Mat) {
        setIsCvLoaded(true);
        clearInterval(checkCv);
      }
    }, 100);
    return () => clearInterval(checkCv);
  }, []);

  // --- Custom Arcade Rendering ---
  const renderOverlay = useCallback((oCtx: CanvasRenderingContext2D, nextBlobs: BlobData[], config: TrackingConfig, sourceCanvas: HTMLCanvasElement) => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    oCtx.clearRect(0, 0, overlay.width, overlay.height);
    
    const primaryColor = config.blobColor || '#00ff00';
    const trailHue = config.trailHue || 120;
    const thickness = config.lineThickness || 2;

    // Glass Effect (Rendered first so other overlays stay on top)
    if (config.glassMode) {
      nextBlobs.forEach(blob => {
        const glassScale = 1.8;
        const glassW = blob.width * glassScale;
        const glassH = blob.height * glassScale;
        const glassX = blob.x - glassW / 2;
        const glassY = blob.y - glassH / 2;

        oCtx.save();
        
        // Create circular lens mask
        oCtx.beginPath();
        oCtx.ellipse(blob.x, blob.y, glassW / 2, glassH / 2, 0, 0, Math.PI * 2);
        oCtx.clip();

        // Draw distorted background
        // We sample a smaller area from the source and stretch it to create magnification
        const sampleScale = 0.7;
        const sw = glassW * sampleScale;
        const sh = glassH * sampleScale;
        const sx = blob.x - sw / 2;
        const sy = blob.y - sh / 2;

        oCtx.drawImage(sourceCanvas, sx, sy, sw, sh, glassX, glassY, glassW, glassH);

        // Add "liquid glass" highlights
        const gradient = oCtx.createRadialGradient(
          blob.x - glassW / 4, blob.y - glassH / 4, 0,
          blob.x, blob.y, glassW / 2
        );
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
        gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.05)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0.1)');
        
        oCtx.fillStyle = gradient;
        oCtx.fill();

        // Lens rim
        oCtx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        oCtx.lineWidth = 1;
        oCtx.stroke();

        oCtx.restore();
      });
    }

    // Mesh
    if (config.showMesh) {
      oCtx.strokeStyle = `hsla(${trailHue}, 100%, 50%, 0.2)`;
      oCtx.lineWidth = thickness / 2;
      for (let i = 0; i < nextBlobs.length; i++) {
        for (let j = i + 1; j < nextBlobs.length; j++) {
          const dist = Math.hypot(nextBlobs[i].x - nextBlobs[j].x, nextBlobs[i].y - nextBlobs[j].y);
          if (dist < MESH_DISTANCE_THRESHOLD) {
            oCtx.beginPath();
            oCtx.moveTo(nextBlobs[i].x, nextBlobs[i].y);
            oCtx.lineTo(nextBlobs[j].x, nextBlobs[j].y);
            oCtx.stroke();
          }
        }
      }
    }

    nextBlobs.forEach(blob => {
      // Trails
      if (config.showTrails && blob.lastPositions.length > 1) {
        oCtx.beginPath();
        oCtx.strokeStyle = `hsla(${trailHue}, 100%, 50%, 0.5)`;
        oCtx.lineWidth = thickness;
        oCtx.setLineDash([5, 5]);
        oCtx.moveTo(blob.lastPositions[0].x, blob.lastPositions[0].y);
        blob.lastPositions.forEach(p => oCtx.lineTo(p.x, p.y));
        oCtx.stroke();
        oCtx.setLineDash([]);
      }

      // Box
      if (config.showBoxes) {
        oCtx.strokeStyle = primaryColor;
        oCtx.lineWidth = thickness;
        oCtx.strokeRect(blob.x - blob.width / 2, blob.y - blob.height / 2, blob.width, blob.height);
        
        // Corner accents
        const size = 10;
        oCtx.beginPath();
        oCtx.moveTo(blob.x - blob.width / 2, blob.y - blob.height / 2 + size);
        oCtx.lineTo(blob.x - blob.width / 2, blob.y - blob.height / 2);
        oCtx.lineTo(blob.x - blob.width / 2 + size, blob.y - blob.height / 2);
        oCtx.stroke();
      }

      // Center
      if (config.showCenters) {
        oCtx.fillStyle = primaryColor;
        oCtx.shadowBlur = 10;
        oCtx.shadowColor = primaryColor;
        oCtx.beginPath();
        oCtx.arc(blob.x, blob.y, 4, 0, Math.PI * 2);
        oCtx.fill();
        oCtx.shadowBlur = 0;
      }

      // ID & Coords
      if (config.showCoords) {
        oCtx.fillStyle = primaryColor;
        oCtx.font = '8px "Press Start 2P"';
        oCtx.fillText(`ID:${blob.id}`, blob.x - blob.width / 2, blob.y - blob.height / 2 - 10);
        oCtx.fillText(`X:${Math.round(blob.x)} Y:${Math.round(blob.y)}`, blob.x - blob.width / 2, blob.y + blob.height / 2 + 15);
      }
    });
  }, []);

  const { blobs, stats, processingRef } = useBlobTracker(
    videoRef,
    canvasRef,
    overlayRef,
    config,
    filters,
    isPlaying,
    isCvLoaded,
    renderOverlay
  );

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setVideoSrc(url);
      setIsPlaying(false);
      if (processingRef.current) {
        processingRef.current.nextId = 1;
        processingRef.current.activeBlobs = [];
        processingRef.current.frameCount = 0;
        processingRef.current.exportData = [];
      }
    }
  };

  const togglePlay = () => {
    if (!videoSrc) return;
    if (isPlaying) {
      videoRef.current?.pause();
    } else {
      videoRef.current?.play();
    }
    setIsPlaying(!isPlaying);
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-black text-green-500 font-['Press_Start_2P'] overflow-hidden">
      {/* Arcade Header */}
      <header className="h-16 border-b-4 border-green-900 flex items-center justify-between px-6 bg-black/80 backdrop-blur-sm z-50">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2 text-[10px] hover:text-green-400 transition-colors">
            <ChevronLeft className="w-4 h-4" />
            BACK
          </Link>
          <div className="flex items-center gap-3">
            <Zap className="w-5 h-5 animate-pulse" />
            <h1 className="text-sm tracking-tighter">BLOB_ARCADE_v1.0</h1>
          </div>
        </div>

        <div className="flex gap-8 text-[8px]">
          <div className="flex flex-col items-center">
            <span className="text-green-900 mb-1">FPS</span>
            <span className={stats.fps < 20 ? 'text-red-500' : 'text-green-500'}>{stats.fps.toString().padStart(2, '0')}</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-green-900 mb-1">BLOBS</span>
            <span>{stats.blobCount.toString().padStart(2, '0')}</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-green-900 mb-1">STATUS</span>
            <span className="animate-pulse">{isCvLoaded ? 'READY' : 'LOADING'}</span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex relative">
        {/* Main Viewport */}
        <section className="flex-1 relative bg-[#050505] flex items-center justify-center overflow-hidden">
          {/* CRT Scanline Effect */}
          <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%] z-40 opacity-30" />
          
          <div className="relative border-4 border-green-900 shadow-[0_0_20px_rgba(0,255,0,0.1)]">
            <video ref={videoRef} src={videoSrc || undefined} className="hidden" loop muted={isMuted} playsInline />
            <canvas ref={canvasRef} className="max-w-full max-h-[80vh]" />
            <canvas ref={overlayRef} className="absolute inset-0 max-w-full max-h-[80vh]" />
            
            {!videoSrc && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 gap-6">
                <Terminal className="w-12 h-12 text-green-900" />
                <p className="text-[10px] tracking-widest text-green-900">INSERT_VIDEO_DATA</p>
                <label className="px-6 py-3 border-2 border-green-500 hover:bg-green-500 hover:text-black transition-all cursor-pointer text-[10px]">
                  UPLOAD_CORE
                  <input type="file" accept="video/*" className="hidden" onChange={handleFileUpload} />
                </label>
              </div>
            )}
          </div>

          {/* Controls Overlay */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-4 z-50">
            <button 
              onClick={togglePlay}
              disabled={!videoSrc}
              className="px-6 py-3 bg-black border-2 border-green-500 hover:bg-green-500 hover:text-black transition-all disabled:opacity-30 flex items-center gap-3 text-[10px]"
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
              {isPlaying ? 'PAUSE_ENGINE' : 'INIT_TRACKING'}
            </button>
            <button 
              onClick={toggleMute}
              disabled={!videoSrc}
              className={`px-4 py-3 border-2 transition-all flex items-center justify-center ${isMuted ? 'bg-red-900/20 border-red-500 text-red-500' : 'bg-black border-green-500 text-green-500 hover:bg-green-500 hover:text-black'}`}
            >
              <Zap className={`w-4 h-4 ${isMuted ? 'opacity-50' : 'animate-pulse'}`} />
            </button>
          </div>
        </section>

        {/* Consolidated HUD */}
        <aside className="w-80 border-l-4 border-green-900 bg-black flex flex-col overflow-hidden">
          <div className="p-4 border-b-2 border-green-900 flex items-center gap-3 bg-green-900/10">
            <Cpu className="w-4 h-4" />
            <span className="text-[10px]">SYSTEM_CONFIG</span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 space-y-10">
            {/* Detection Settings */}
            <div className="space-y-6">
              <h3 className="text-[8px] text-green-900 uppercase">Detection_Params</h3>
              <ArcadeSlider label="Threshold" value={config.threshold} min={0} max={255} onChange={v => setConfig(c => ({ ...c, threshold: v }))} />
              <ArcadeSlider label="Blur" value={config.blur} min={0} max={10} onChange={v => setConfig(c => ({ ...c, blur: v }))} />
              <div className="flex gap-2">
                <button onClick={() => setConfig(c => ({ ...c, mode: 'threshold' }))} className={`flex-1 py-2 text-[7px] border ${config.mode === 'threshold' ? 'bg-green-500 text-black border-green-500' : 'border-green-900 text-green-900'}`}>THRSH</button>
                <button onClick={() => setConfig(c => ({ ...c, mode: 'differencing' }))} className={`flex-1 py-2 text-[7px] border ${config.mode === 'differencing' ? 'bg-green-500 text-black border-green-500' : 'border-green-900 text-green-900'}`}>DIFF</button>
              </div>
            </div>

            {/* Visual Settings */}
            <div className="space-y-6">
              <h3 className="text-[8px] text-green-900 uppercase">Visual_Output</h3>
              <ArcadeSlider label="Trail_Hue" value={config.trailHue || 120} min={0} max={360} onChange={v => setConfig(c => ({ ...c, trailHue: v }))} />
              <ArcadeSlider label="Thickness" value={config.lineThickness || 2} min={1} max={10} onChange={v => setConfig(c => ({ ...c, lineThickness: v }))} />
              
              <div className="space-y-3">
                <span className="text-[7px] text-green-900 uppercase">Core_Color</span>
                <div className="flex gap-2">
                  {['#ffffff', '#ec4899', '#00ff00', '#3b82f6', '#f59e0b'].map(color => (
                    <button
                      key={color}
                      onClick={() => setConfig(c => ({ ...c, blobColor: color }))}
                      className={`w-5 h-5 border-2 transition-all ${config.blobColor === color ? 'border-white scale-110 shadow-[0_0_10px_rgba(255,255,255,0.5)]' : 'border-green-900 opacity-40 hover:opacity-100'}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <ArcadeToggle label="Glass" active={!!config.glassMode} onClick={() => setConfig(c => ({ ...c, glassMode: !c.glassMode }))} />
                <ArcadeToggle label="Boxes" active={config.showBoxes} onClick={() => setConfig(c => ({ ...c, showBoxes: !c.showBoxes }))} />
                <ArcadeToggle label="Trails" active={config.showTrails} onClick={() => setConfig(c => ({ ...c, showTrails: !c.showTrails }))} />
                <ArcadeToggle label="Mesh" active={config.showMesh} onClick={() => setConfig(c => ({ ...c, showMesh: !c.showMesh }))} />
                <ArcadeToggle label="Coords" active={config.showCoords} onClick={() => setConfig(c => ({ ...c, showCoords: !c.showCoords }))} />
              </div>
            </div>

            {/* Live Log */}
            <div className="space-y-4">
              <h3 className="text-[8px] text-green-900 uppercase">Live_Log</h3>
              <div className="h-40 border border-green-900 bg-green-900/5 p-3 overflow-hidden font-mono text-[7px] leading-relaxed">
                <div className="animate-pulse mb-2 text-green-400">{" >> "}SYSTEM_READY</div>
                {blobs.slice(0, 5).map(b => (
                  <div key={b.id} className="text-green-700">
                    [BLOB_{b.id.toString().padStart(3, '0')}] X:{Math.round(b.x)} Y:{Math.round(b.y)}
                  </div>
                ))}
                {blobs.length > 5 && <div className="text-green-900">... AND {blobs.length - 5} MORE</div>}
              </div>
            </div>
          </div>

          <div className="p-4 border-t-2 border-green-900 text-[6px] text-green-900 text-center">
            ARCADE_ENGINE_v1.0 // (C) 1984 BLOB_CORP
          </div>
        </aside>
      </main>
    </div>
  );
}

function ArcadeSlider({ label, value, min, max, onChange }: { label: string, value: number, min: number, max: number, onChange: (v: number) => void }) {
  return (
    <div className="space-y-3">
      <div className="flex justify-between text-[7px] uppercase">
        <span>{label}</span>
        <span className="text-green-300">{value}</span>
      </div>
      <input 
        type="range" min={min} max={max} value={value} 
        onChange={e => onChange(parseInt(e.target.value))} 
        className="w-full h-2 bg-green-900/30 appearance-none cursor-pointer accent-green-500 border border-green-900" 
      />
    </div>
  );
}

function ArcadeToggle({ label, active, onClick }: { label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick} 
      className={`flex items-center justify-between px-3 py-2 border transition-all ${active ? 'bg-green-500/10 border-green-500 text-green-500' : 'border-green-900 text-green-900 opacity-50'}`}
    >
      <span className="text-[7px] uppercase tracking-tighter">{label}</span>
      <div className={`w-2 h-2 ${active ? 'bg-green-500 shadow-[0_0_8px_rgba(0,255,0,0.8)]' : 'bg-green-900'}`} />
    </button>
  );
}
