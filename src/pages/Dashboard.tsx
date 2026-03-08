import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { 
  Upload, 
  Play, 
  Pause, 
  Download, 
  Settings2, 
  Activity, 
  Layers, 
  Target, 
  Maximize2,
  FileJson,
  Video,
  Gamepad2,
  Volume2,
  VolumeX
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useBlobTracker } from '../hooks/useBlobTracker';
import { BlobData, TrackingConfig, VideoFilters } from '../types';

const MESH_DISTANCE_THRESHOLD = 150;

export default function Dashboard() {
  // --- State ---
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isCvLoaded, setIsCvLoaded] = useState(false);
  const [config, setConfig] = useState<TrackingConfig>({
    threshold: 180,
    minSize: 10,
    maxSize: 1000,
    blur: 3,
    sensitivity: 197,
    showBoxes: true,
    showCenters: true,
    showTrails: true,
    showMesh: true,
    showCoords: false,
    mode: 'threshold'
  });
  const [isHudOpen, setIsHudOpen] = useState(true);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isColorScienceOpen, setIsColorScienceOpen] = useState(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [showStartOverlay, setShowStartOverlay] = useState(false);
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

  // --- Rendering Callback ---
  const renderOverlay = useCallback((oCtx: CanvasRenderingContext2D, nextBlobs: BlobData[], config: TrackingConfig, sourceCanvas: HTMLCanvasElement) => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    oCtx.clearRect(0, 0, overlay.width, overlay.height);
    
    const primaryColor = config.blobColor || 'white';
    const trailHue = config.trailHue || 0;
    const thickness = config.lineThickness || 1;

    // Mesh
    if (config.showMesh) {
      oCtx.strokeStyle = config.blobColor ? `${config.blobColor}44` : 'rgba(255, 255, 255, 0.15)';
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
        oCtx.strokeStyle = config.trailHue !== undefined ? `hsla(${trailHue}, 100%, 50%, 0.3)` : 'rgba(255, 255, 255, 0.3)';
        oCtx.lineWidth = thickness;
        oCtx.moveTo(blob.lastPositions[0].x, blob.lastPositions[0].y);
        blob.lastPositions.forEach(p => oCtx.lineTo(p.x, p.y));
        oCtx.stroke();
      }

      // Box
      if (config.showBoxes) {
        oCtx.strokeStyle = primaryColor;
        oCtx.lineWidth = thickness;
        oCtx.strokeRect(blob.x - blob.width / 2, blob.y - blob.height / 2, blob.width, blob.height);
      }

      // Center
      if (config.showCenters) {
        oCtx.fillStyle = primaryColor;
        oCtx.beginPath();
        oCtx.arc(blob.x, blob.y, 3, 0, Math.PI * 2);
        oCtx.fill();
      }

      // ID & Coords
      oCtx.fillStyle = primaryColor;
      oCtx.font = '10px JetBrains Mono';
      oCtx.fillText(`ID:${blob.id}`, blob.x - blob.width / 2, blob.y - blob.height / 2 - 5);
      if (config.showCoords) {
        oCtx.fillText(`X:${Math.round(blob.x)} Y:${Math.round(blob.y)}`, blob.x - blob.width / 2, blob.y + blob.height / 2 + 12);
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

  // --- Handlers ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setVideoSrc(url);
      setIsPlaying(false);
      setShowStartOverlay(true);
      processingRef.current.nextId = 1;
      processingRef.current.activeBlobs = [];
      processingRef.current.frameCount = 0;
      processingRef.current.exportData = [];
    }
  };

  const startTracking = () => {
    setIsPlaying(true);
    setShowStartOverlay(false);
    if (videoRef.current) {
      videoRef.current.play();
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

  const exportData = () => {
    const dataStr = JSON.stringify(processingRef.current.exportData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'blob_data.json';
    link.click();
  };

  const startRecording = () => {
    if (!overlayRef.current || !canvasRef.current) return;
    const recordCanvas = document.createElement('canvas');
    recordCanvas.width = canvasRef.current.width;
    recordCanvas.height = canvasRef.current.height;
    const rCtx = recordCanvas.getContext('2d');
    const stream = recordCanvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) processingRef.current.recordedChunks.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(processingRef.current.recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'processed_video.webm';
      link.click();
      processingRef.current.recordedChunks = [];
    };
    processingRef.current.mediaRecorder = recorder;
    recorder.start();
    const drawRecord = () => {
      if (recorder.state === 'recording') {
        rCtx?.drawImage(canvasRef.current!, 0, 0);
        rCtx?.drawImage(overlayRef.current!, 0, 0);
        requestAnimationFrame(drawRecord);
      }
    };
    drawRecord();
  };

  const stopRecording = () => {
    processingRef.current.mediaRecorder?.stop();
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-900">
      {/* Top Bar */}
      <header className="h-14 border-b border-slate-200 flex items-center justify-between px-6 shrink-0 bg-white shadow-sm">
        <div className="flex items-center gap-3">
          <Activity className="w-5 h-5 text-slate-600" />
          <h1 className="text-sm font-bold tracking-widest uppercase mono text-slate-900">Blob Machine</h1>
          <div className="h-4 w-[1px] bg-slate-200 mx-2" />
          <div className="flex gap-4 text-[10px] mono text-slate-400">
            <span>FPS: {stats.fps}</span>
            <span>BLOBS: {stats.blobCount}</span>
            <span>STATUS: {isCvLoaded ? 'READY' : 'LOADING CV...'}</span>
            
            {/* Retro TEST MODE Button */}
            {isCvLoaded && (
              <Link 
                to="/playground"
                className="ml-4 flex items-center gap-2 px-3 py-1 bg-slate-100 border-2 border-slate-300 border-b-slate-400 border-r-slate-400 hover:bg-slate-200 active:border-t-slate-400 active:border-l-slate-400 active:border-b-slate-200 active:border-r-slate-200 transition-all group"
              >
                <Gamepad2 className="w-3 h-3 text-emerald-600 group-hover:animate-pulse" />
                <span className="text-[9px] font-black text-emerald-600 tracking-tighter">TEST MODE</span>
              </Link>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="cursor-pointer flex items-center gap-2 px-3 py-1.5 rounded-sm bg-slate-100 hover:bg-slate-200 transition-colors text-[10px] mono uppercase tracking-wider text-slate-600">
            <Upload className="w-3 h-3" />
            Upload
            <input type="file" accept="video/*" className="hidden" onChange={handleFileUpload} />
          </label>
          
          <button 
            onClick={() => setIsInfoModalOpen(true)}
            className="w-6 h-6 rounded-full border border-slate-900 bg-white text-slate-900 flex items-center justify-center text-[14px] mono hover:bg-slate-50 transition-colors"
            title="Control Explanations"
          >
            i
          </button>

          <button 
            onClick={togglePlay}
            disabled={!videoSrc}
            className="flex items-center gap-2 px-3 py-1.5 rounded-sm bg-slate-900 text-white hover:bg-slate-800 transition-colors text-[10px] mono uppercase tracking-wider disabled:opacity-50"
          >
            {isPlaying ? <Pause className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
            {isPlaying ? 'Pause' : 'Start Tracking'}
          </button>
          <div className="h-4 w-[1px] bg-slate-200 mx-2" />
          <button 
            onClick={startRecording}
            className="p-1.5 rounded-sm hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            title="Record Video"
          >
            <Video className="w-4 h-4" />
          </button>
          <button 
            onClick={exportData}
            className="p-1.5 rounded-sm hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            title="Export JSON"
          >
            <FileJson className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden relative">
        {/* Left Panel - Inspector & Majin Boo */}
        <aside className="w-72 border-r border-slate-200 flex flex-col shrink-0 bg-black text-white">
          {/* Grid 1: Blob Inspector */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-white/40" />
                <span className="text-[10px] mono uppercase tracking-widest font-bold text-white/60">Blob Inspector</span>
              </div>
              <span className="text-[10px] mono text-white/20">{blobs.length} ACTIVE</span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <AnimatePresence>
                {blobs.map(blob => (
                  <motion.div 
                    key={blob.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="p-3 border border-white/5 rounded-sm bg-white/[0.02] hover:bg-white/[0.05] transition-colors group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] mono text-white font-bold">ID_{blob.id.toString().padStart(3, '0')}</span>
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: blob.color }} />
                    </div>
                    <div className="grid grid-cols-2 gap-y-1 text-[9px] mono text-white/40">
                      <span>POS_X:</span> <span className="text-white text-right">{Math.round(blob.x)}</span>
                      <span>POS_Y:</span> <span className="text-white text-right">{Math.round(blob.y)}</span>
                      <span>AREA:</span> <span className="text-white text-right">{Math.round(blob.area)}</span>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {blobs.length === 0 && (
                <div className="h-full flex items-center justify-center opacity-20">
                  <p className="text-[10px] mono uppercase tracking-widest text-white/40">No data stream</p>
                </div>
              )}
            </div>
          </div>

          {/* Grid 2: Majin Boo Goo */}
          <div className="h-64 border-t border-white/10 bg-black flex flex-col overflow-hidden">
            <div className="p-3 border-b border-white/5 flex items-center gap-2">
              <Activity className="w-3 h-3 text-pink-500" />
              <span className="text-[9px] mono uppercase tracking-widest font-bold text-white/40">Majin_Boo_Goo.sys</span>
            </div>
            <div className="flex-1 flex items-center justify-center relative overflow-hidden bg-white/5">
              <MajinBooGoo blobs={blobs} isPlaying={isPlaying} />
              <div className="absolute bottom-2 left-3 text-[8px] mono text-pink-500/40 uppercase tracking-tighter">
                Reactive_Goo_v2.0
              </div>
            </div>
          </div>
        </aside>

        {/* Center - Video Preview */}
        <section 
          className="flex-1 relative bg-black flex items-center justify-center overflow-hidden group"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) handleFileUpload({ target: { files: [file] } } as any);
          }}
        >
          {!videoSrc && (
            <label className="text-center space-y-4 cursor-pointer hover:bg-white/5 p-12 rounded-2xl transition-all border border-dashed border-white/10 group/upload">
              <div className="w-20 h-20 border border-dashed border-white/20 rounded-full flex items-center justify-center mx-auto group-hover/upload:border-white/40 group-hover/upload:scale-110 transition-all">
                <Upload className="w-8 h-8 text-white/20 group-hover/upload:text-white/60" />
              </div>
              <div className="space-y-2">
                <p className="text-[12px] mono text-white/40 uppercase tracking-widest group-hover/upload:text-white/60">Drop video or click to upload</p>
                <p className="text-[9px] mono text-white/20 uppercase tracking-tighter italic">Supported: MP4, WebM, MOV</p>
              </div>
              <input type="file" accept="video/*" className="hidden" onChange={handleFileUpload} />
            </label>
          )}
          
          <div className="relative max-w-full max-h-full">
            <video 
              ref={videoRef} 
              src={videoSrc || undefined} 
              className="hidden" 
              loop 
              muted={isMuted} 
              playsInline
            />
            <canvas ref={canvasRef} className="max-w-full max-h-full opacity-100" />
            <canvas ref={overlayRef} className="absolute inset-0 max-w-full max-h-full" />
          </div>

          {/* Xbox 360 Style Start Button Overlay */}
          <AnimatePresence>
            {showStartOverlay && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.1 }}
                className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 backdrop-blur-sm"
              >
                <button 
                  onClick={startTracking}
                  className="relative group flex items-center justify-center"
                >
                  <div className="absolute inset-0 rounded-full bg-red-600/20 blur-2xl group-hover:bg-red-500/40 transition-all duration-500" />
                  <div className="relative w-48 h-48 rounded-full bg-gradient-to-b from-red-500 via-red-600 to-red-800 border-4 border-red-400/50 shadow-[0_0_50px_rgba(220,38,38,0.5),inset_0_4px_12px_rgba(255,255,255,0.4)] flex flex-col items-center justify-center overflow-hidden group-active:scale-95 transition-transform">
                    <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/30 to-transparent pointer-events-none" />
                    <Play className="w-12 h-12 text-white mb-2 drop-shadow-[0_0_10px_rgba(255,255,255,0.8)] fill-white" />
                    <span className="text-[12px] font-black mono text-white uppercase tracking-[0.2em] drop-shadow-md">
                      Start<br/>Tracking
                    </span>
                    <div className="absolute inset-2 rounded-full border border-red-300/20 pointer-events-none" />
                  </div>
                  <div className="absolute -inset-4 border-2 border-red-500/10 rounded-full pointer-events-none group-hover:border-red-500/30 transition-colors" />
                  <div className="absolute -inset-8 border border-red-500/5 rounded-full pointer-events-none" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="absolute inset-0 pointer-events-none border-[20px] border-black/50" />
          <div className="absolute top-8 left-8 text-[10px] mono text-white/20 uppercase tracking-widest">
            Viewport_01 // {videoRef.current?.videoWidth || 0}x{videoRef.current?.videoHeight || 0}
          </div>
        </section>

        {/* Right Panel - HUD Controls */}
        <div className="flex shrink-0">
          <motion.aside 
            initial={false}
            animate={{ width: isEditorOpen ? 280 : 0 }}
            className="border-l border-slate-200 flex flex-col bg-white overflow-hidden relative"
          >
            <div className={`flex-1 overflow-y-auto overflow-x-hidden ${isEditorOpen ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}>
              <div className="p-4 space-y-4 min-w-[280px]">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Video className="w-4 h-4 text-slate-400" />
                    <span className="text-[10px] mono uppercase tracking-widest font-bold text-slate-600">Video Editor</span>
                  </div>
                  <button onClick={() => setIsEditorOpen(false)} className="p-1 hover:bg-slate-100 rounded text-slate-400">
                    <Maximize2 className="w-3 h-3 rotate-45" />
                  </button>
                </div>
                <div className="space-y-4">
                  <ControlSlider label="Brightness" value={filters.brightness} min={-100} max={100} onChange={v => setFilters(f => ({ ...f, brightness: v }))} />
                  <ControlSlider label="Contrast" value={Math.round(filters.contrast * 100)} min={50} max={200} onChange={v => setFilters(f => ({ ...f, contrast: v / 100 }))} />
                  <ControlSlider label="Saturation" value={Math.round(filters.saturation * 100)} min={0} max={200} onChange={v => setFilters(f => ({ ...f, saturation: v / 100 }))} />
                  <ControlSlider label="Sharpness" value={Math.round(filters.sharpness * 10)} min={0} max={50} onChange={v => setFilters(f => ({ ...f, sharpness: v / 10 }))} />
                  <button onClick={() => setFilters({ brightness: 0, contrast: 1, saturation: 1, sharpness: 0 })} className="w-full py-1.5 bg-slate-100 hover:bg-slate-200 text-[9px] mono uppercase tracking-widest transition-colors border border-slate-200 text-slate-600">Reset</button>
                </div>
              </div>
            </div>
          </motion.aside>

          <motion.aside 
            initial={false}
            animate={{ width: isHudOpen ? 320 : 40 }}
            className="border-l border-slate-200 flex flex-col bg-black text-white relative z-10"
          >
            {!isEditorOpen && isHudOpen && (
              <button onClick={() => setIsEditorOpen(true)} className="absolute -left-10 top-20 w-8 h-24 bg-black border border-white/10 border-r-0 rounded-l-md flex items-center justify-center group transition-colors shadow-sm" title="Open Video Editor">
                <Video className="w-4 h-4 text-white/20 group-hover:text-white rotate-90" />
              </button>
            )}
            <button onClick={() => setIsHudOpen(!isHudOpen)} className="absolute -left-4 top-1/2 -translate-y-1/2 w-8 h-8 bg-white text-black rounded-full flex items-center justify-center shadow-lg z-20 hover:scale-110 transition-transform">
              {isHudOpen ? <Maximize2 className="w-4 h-4 rotate-90" /> : <Settings2 className="w-4 h-4" />}
            </button>
            <div className={`flex-1 overflow-y-auto overflow-x-hidden ${isHudOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'} transition-opacity duration-300`}>
              <div className="p-4 space-y-8 min-w-[320px]">
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Settings2 className="w-4 h-4 text-white/40" />
                      <span className="text-[10px] mono uppercase tracking-widest font-bold text-white/60">Detection Pipeline</span>
                    </div>
                    <button 
                      onClick={toggleMute}
                      className={`p-1.5 rounded-sm transition-colors ${isMuted ? 'bg-red-500/20 text-red-500' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
                      title={isMuted ? "Unmute Audio" : "Mute Audio"}
                    >
                      {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <ControlSlider label="Threshold" value={config.threshold} min={0} max={255} onChange={v => setConfig(c => ({ ...c, threshold: v }))} isDark />
                  <ControlSlider label="Blur Strength" value={config.blur} min={0} max={10} onChange={v => setConfig(c => ({ ...c, blur: v }))} isDark />
                  <div className="flex gap-2 pt-2">
                    <button onClick={() => setConfig(c => ({ ...c, mode: 'threshold' }))} className={`flex-1 py-2 text-[9px] mono uppercase tracking-widest transition-colors ${config.mode === 'threshold' ? 'bg-white text-black' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>Threshold</button>
                    <button onClick={() => setConfig(c => ({ ...c, mode: 'differencing' }))} className={`flex-1 py-2 text-[9px] mono uppercase tracking-widest transition-colors ${config.mode === 'differencing' ? 'bg-white text-black' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>Difference</button>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-4">
                    <Maximize2 className="w-4 h-4 text-white/40" />
                    <span className="text-[10px] mono uppercase tracking-widest font-bold text-white/60">Tracking Logic</span>
                  </div>
                  <ControlSlider label="Min Blob Size" value={config.minSize} min={1} max={1000} onChange={v => setConfig(c => ({ ...c, minSize: v }))} isDark />
                  <ControlSlider label="Max Blob Size" value={config.maxSize} min={100} max={10000} onChange={v => setConfig(c => ({ ...c, maxSize: v }))} isDark />
                  <ControlSlider label="Sensitivity" value={config.sensitivity} min={1} max={500} onChange={v => setConfig(c => ({ ...c, sensitivity: v }))} isDark />
                </div>
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-4">
                    <Layers className="w-4 h-4 text-white/40" />
                    <span className="text-[10px] mono uppercase tracking-widest font-bold text-white/60">Visualization Layer</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    <Toggle label="Bounding Boxes" active={config.showBoxes} onClick={() => setConfig(c => ({ ...c, showBoxes: !c.showBoxes }))} isDark />
                    <Toggle label="Blob Centers" active={config.showCenters} onClick={() => setConfig(c => ({ ...c, showCenters: !c.showCenters }))} isDark />
                    <Toggle label="Motion Trails" active={config.showTrails} onClick={() => setConfig(c => ({ ...c, showTrails: !c.showTrails }))} isDark />
                    <Toggle label="Mesh Network" active={config.showMesh} onClick={() => setConfig(c => ({ ...c, showMesh: !c.showMesh }))} isDark />
                    <Toggle label="Coordinates" active={config.showCoords} onClick={() => setConfig(c => ({ ...c, showCoords: !c.showCoords }))} isDark />
                  </div>
                </div>

                {/* Color Science Collapsible */}
                <div className="space-y-4">
                  <button 
                    onClick={() => setIsColorScienceOpen(!isColorScienceOpen)}
                    className="flex items-center justify-between w-full group"
                  >
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-pink-500" />
                      <span className="text-[10px] mono uppercase tracking-widest font-bold text-pink-500">Color Science</span>
                    </div>
                    <div className={`w-2 h-2 rounded-full transition-all ${isColorScienceOpen ? 'bg-pink-500 scale-125' : 'bg-pink-900 scale-75'}`} />
                  </button>
                  
                  <AnimatePresence>
                    {isColorScienceOpen && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden space-y-4"
                      >
                        <div className="p-4 bg-pink-500/5 border border-pink-500/20 rounded-sm space-y-4">
                          <ControlSlider 
                            label="Trail Hue" 
                            value={config.trailHue || 0} 
                            min={0} 
                            max={360} 
                            onChange={v => setConfig(c => ({ ...c, trailHue: v }))} 
                            isDark 
                          />
                          <ControlSlider 
                            label="Line Thickness" 
                            value={config.lineThickness || 1} 
                            min={1} 
                            max={10} 
                            onChange={v => setConfig(c => ({ ...c, lineThickness: v }))} 
                            isDark 
                          />
                          <div className="space-y-2">
                            <span className="text-[9px] mono uppercase tracking-widest text-pink-500/60">Blob Color</span>
                            <div className="flex gap-2">
                              {['#ffffff', '#ec4899', '#00ff00', '#3b82f6', '#f59e0b'].map(color => (
                                <button
                                  key={color}
                                  onClick={() => setConfig(c => ({ ...c, blobColor: color }))}
                                  className={`w-6 h-6 rounded-full border-2 transition-all ${config.blobColor === color ? 'border-white scale-110' : 'border-transparent opacity-50 hover:opacity-100'}`}
                                  style={{ backgroundColor: color }}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </motion.aside>
        </div>
      </main>

      {/* Info Modal */}
      <AnimatePresence>
        {isInfoModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsInfoModalOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="relative w-full max-w-[480px] max-h-[80vh] bg-black border border-white p-6 overflow-y-auto mono text-white shadow-2xl">
              <div className="flex justify-between items-center mb-6 border-b border-white/20 pb-4">
                <h2 className="text-sm font-bold uppercase tracking-widest">Blob Tracker Controls</h2>
                <button onClick={() => setIsInfoModalOpen(false)} className="p-1 hover:bg-white/10 rounded transition-colors"><Maximize2 className="w-4 h-4 rotate-45" /></button>
              </div>
              <div className="space-y-8 text-[11px] leading-relaxed">
                <section>
                  <h3 className="text-white/60 mb-3 uppercase tracking-wider font-bold border-l-2 border-white pl-2">Video Editor</h3>
                  <div className="space-y-4">
                    <div><p className="font-bold text-white mb-1">Brightness</p><p className="text-white/40">Adjusts the overall light level. Higher values make pixels brighter. Useful for dark footage.</p></div>
                    <div><p className="font-bold text-white mb-1">Contrast</p><p className="text-white/40">Controls the difference between light and dark areas. Higher contrast makes blobs easier to separate, but too much may cause noise.</p></div>
                    <div><p className="font-bold text-white mb-1">Saturation</p><p className="text-white/40">Controls color intensity. Affects threshold separation even though tracking is grayscale.</p></div>
                    <div><p className="font-bold text-white mb-1">Sharpness</p><p className="text-white/40">Enhances edges. Improves boundary detection, but too much creates noise.</p></div>
                  </div>
                </section>
                <section>
                  <h3 className="text-white/60 mb-3 uppercase tracking-wider font-bold border-l-2 border-white pl-2">Detection Pipeline</h3>
                  <div className="space-y-4">
                    <div><p className="font-bold text-white mb-1">Threshold</p><p className="text-white/40">Defines the cutoff between foreground and background. Main control for blob detection.</p></div>
                    <div><p className="font-bold text-white mb-1">Blur Strength</p><p className="text-white/40">Applies Gaussian blur to remove small noise artifacts and smooth blob shapes.</p></div>
                    <div><p className="font-bold text-white mb-1">Detection Mode</p><p className="text-white/40">Threshold: Uses brightness. Difference: Detects motion by comparing frames.</p></div>
                  </div>
                </section>
                <section>
                  <h3 className="text-white/60 mb-3 uppercase tracking-wider font-bold border-l-2 border-white pl-2">Tracking Logic</h3>
                  <div className="space-y-4">
                    <div><p className="font-bold text-white mb-1">Min Blob Size</p><p className="text-white/40">Minimum pixel area required for tracking. Removes small noise particles.</p></div>
                    <div><p className="font-bold text-white mb-1">Max Blob Size</p><p className="text-white/40">Upper limit for detection. Prevents large background shapes from being tracked.</p></div>
                    <div><p className="font-bold text-white mb-1">Sensitivity</p><p className="text-white/40">Controls allowed movement between frames. Higher values allow faster motion tracking.</p></div>
                  </div>
                </section>
                <section>
                  <h3 className="text-white/60 mb-3 uppercase tracking-wider font-bold border-l-2 border-white pl-2">Visualization Layer</h3>
                  <p className="text-white/30 mb-3 italic">Visual overlays only; does not affect detection.</p>
                  <div className="space-y-4">
                    <div><p className="font-bold text-white mb-1">Bounding Boxes</p><p className="text-white/40">Draws rectangles around detected blobs.</p></div>
                    <div><p className="font-bold text-white mb-1">Blob Centers</p><p className="text-white/40">Shows centroid point of each blob.</p></div>
                    <div><p className="font-bold text-white mb-1">Motion Trails</p><p className="text-white/40">Draws fading trails showing previous positions.</p></div>
                    <div><p className="font-bold text-white mb-1">Mesh Network</p><p className="text-white/40">Connects nearby blobs with lines for network visualization.</p></div>
                    <div><p className="font-bold text-white mb-1">Coordinates</p><p className="text-white/40">Displays numeric blob positions on screen.</p></div>
                  </div>
                </section>
              </div>
              <div className="mt-8 pt-4 border-t border-white/20 flex justify-between items-center text-[9px] text-white/40 uppercase tracking-widest">
                <span>by Anthony L</span>
                <span>all266@cornell.edu</span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Helper Components ---

function MajinBooGoo({ blobs, isPlaying }: { blobs: BlobData[], isPlaying: boolean }) {
  const avgVelocity = blobs.length > 0 
    ? blobs.reduce((acc, b) => acc + Math.hypot(b.velocityX, b.velocityY), 0) / blobs.length 
    : 0;
  
  const scale = 0.8 + (avgVelocity / 40);
  const stretch = 1 + (blobs.length / 20);

  return (
    <motion.div
      animate={{
        scale: isPlaying ? [scale, scale * 1.05, scale] : 0.8,
        borderRadius: isPlaying 
          ? ["45% 55% 65% 35% / 45% 50% 55% 50%", "55% 45% 35% 65% / 50% 55% 45% 55%", "45% 55% 65% 35% / 45% 50% 55% 50%"]
          : "50%",
        rotate: isPlaying ? [0, 2, -2, 0] : 0,
        x: isPlaying ? [0, 2, -2, 0] : 0,
        y: isPlaying ? [0, -2, 2, 0] : 0,
      }}
      transition={{
        duration: 4,
        repeat: Infinity,
        ease: "easeInOut"
      }}
      className="w-24 h-24 bg-gradient-to-br from-pink-400 via-pink-500 to-pink-600 shadow-[0_0_20px_rgba(236,72,153,0.3)] relative"
    >
      {/* Eyes */}
      <div className="absolute top-1/3 left-1/4 w-2 h-2 bg-black rounded-full" />
      <div className="absolute top-1/3 right-1/4 w-2 h-2 bg-black rounded-full" />
      {/* Mouth */}
      <motion.div 
        animate={{ height: isPlaying ? [2, 6, 2] : 2 }}
        transition={{ duration: 2, repeat: Infinity }}
        className="absolute bottom-1/3 left-1/2 -translate-x-1/2 w-6 bg-black rounded-full" 
      />
    </motion.div>
  );
}

function ControlSlider({ label, value, min, max, onChange, isDark }: { label: string, value: number, min: number, max: number, onChange: (v: number) => void, isDark?: boolean }) {
  return (
    <div className="space-y-1.5">
      <div className={`flex justify-between text-[9px] mono uppercase tracking-widest ${isDark ? 'text-white/40' : 'text-slate-400'}`}>
        <span>{label}</span>
        <span className={`${isDark ? 'text-white' : 'text-slate-900'} font-bold`}>{value}</span>
      </div>
      <input 
        type="range" min={min} max={max} value={value} 
        onChange={e => onChange(parseInt(e.target.value))} 
        className={`w-full h-1 appearance-none cursor-pointer ${isDark ? 'bg-white/10 accent-white' : 'bg-slate-200 accent-slate-900'}`} 
      />
    </div>
  );
}

function Toggle({ label, active, onClick, isDark }: { label: string, active: boolean, onClick: () => void, isDark?: boolean }) {
  return (
    <button 
      onClick={onClick} 
      className={`flex items-center justify-between px-3 py-2 border rounded-sm transition-colors group ${
        active 
          ? (isDark ? 'bg-white border-white text-black' : 'bg-slate-900 border-slate-900 text-white') 
          : (isDark ? 'bg-black border-white/10 text-white/40 hover:border-white/40' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-400')
      }`}
    >
      <span className="text-[9px] mono uppercase tracking-widest">{label}</span>
      <div className={`w-1.5 h-1.5 rounded-full ${active ? (isDark ? 'bg-black' : 'bg-white') : (isDark ? 'bg-white/20' : 'bg-slate-200')}`} />
    </button>
  );
}
