import { VHSEngine } from './VHS.js';

const MAX_TRAIL_LENGTH = 20;

class BlobTracker {
  constructor() {
    this.blobs = [];
    this.stats = { fps: 0, blobCount: 0 };
    this.processingRef = {
      prevFrame: null,
      nextId: 1,
      activeBlobs: [],
      matteTiles: [],
      recordedChunks: [],
      mediaRecorder: null,
      frameCount: 0,
      echoHistory: []
    };
    this.requestRef = null;
    this.isPlaying = false;
    this.isCvLoaded = false;
    this.config = {
      minSize: 4,
      maxSize: 7000,
      blur: 1,
      sensitivity: 360,
      showBoxes: true,
      showCenters: true,
      showTrails: true,
      showCoords: true,
      fxNegative: false,
      fxBlur: false,
      fxMagnifierLink: false,
      showMatteBlob: false,
      matteVideoOpacity: 0.35,
      matteGenerationSlowdown: 3,
      matteDensity: 7,
      matteRadius: 92,
      matteTileScale: 1.05,
      matteVerticalSpread: 0.8,
      mattePersistence: 14,
      blobColor: '#ffffff',
      lineColor: '#ffffff',
      trailHue: 0,
      lineThickness: 1
    };
    this.videoFilters = {
      sharpness: 0,
      brightness: 0,
      contrast: 1,
      saturation: 1,
      edgeDetect: 0,
      scanlineThickness: 0,
      gamma: 1,
      slitScanSpeed: 0,
      heatAmplitude: 0,
      heatSpeed: 2,
      echoFrames: 1,
      echoDecay: 0.7,
      pixelSortThreshold: 0,
      scanCollapseStrength: 0,
      shuffleAmount: 0,
      crtScanlines: 0,
      crtGlow: 0,
      edgeGlow: 0,
      edgeThreshold: 50,
      noiseDisplace: 0,
      noiseSpeed: 1,
      rgbShift: { r: 0, g: 0, b: 0 },
      scanlineIntensity: 0.3
    };
    this.videoElement = null;
    this.canvasElement = null;
    this.overlayElement = null;
    this.gooCanvas = null;
    this.hiddenBlobIds = new Set();
    this.audioContext = null;
    this.audioAnalyser = null;
    this.audioData = null;
    this.audioSource = null;
    this.audioLevel = 0;
    this.fxCanvas = null;
    this.vhsEngine = new VHSEngine(this.processingRef);
  }

  init(videoId, canvasId, overlayId, gooCanvasId) {
    this.videoElement = document.getElementById(videoId);
    this.canvasElement = document.getElementById(canvasId);
    this.overlayElement = document.getElementById(overlayId);
    this.gooCanvas = document.getElementById(gooCanvasId);

    // Check for OpenCV
    const checkCv = setInterval(() => {
      if (window.cv && window.cv.Mat) {
        this.isCvLoaded = true;
        document.getElementById('status-display').textContent = 'STATUS: READY';
        clearInterval(checkCv);
      }
    }, 100);
  }

  getRenderDimensions() {
    if (!this.videoElement) return null;
    const vw = this.videoElement.videoWidth || 0;
    const vh = this.videoElement.videoHeight || 0;
    if (!vw || !vh) return null;
    const maxWidth = 1920;
    const maxHeight = 1080;
    const scale = Math.min(1, maxWidth / vw, maxHeight / vh);
    return {
      width: Math.max(1, Math.round(vw * scale)),
      height: Math.max(1, Math.round(vh * scale))
    };
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  updateVideoFilters(newFilters) {
    this.videoFilters = { ...this.videoFilters, ...newFilters };
  }

  startTracking() {
    this.isPlaying = true;
    this.setupAudioAnalyser();
    if (this.audioContext?.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
    if (this.videoElement) {
      this.videoElement.play();
    }
    this.processFrame();
  }

  stopTracking() {
    this.isPlaying = false;
    if (this.requestRef) {
      cancelAnimationFrame(this.requestRef);
    }
  }

  renderStillFrame() {
    if (!this.videoElement || !this.canvasElement || !this.overlayElement) return;
    const video = this.videoElement;
    const canvas = this.canvasElement;
    const overlay = this.overlayElement;
    const ctx = canvas.getContext('2d');
    const oCtx = overlay.getContext('2d');
    if (!ctx || !oCtx || !video.videoWidth) return;
    const dims = this.getRenderDimensions();
    if (!dims) return;
    if (canvas.width !== dims.width || canvas.height !== dims.height) {
      canvas.width = dims.width;
      canvas.height = dims.height;
      overlay.width = dims.width;
      overlay.height = dims.height;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    oCtx.clearRect(0, 0, overlay.width, overlay.height);
  }

  processFrame = () => {
    if (!this.videoElement || !this.canvasElement || !this.overlayElement || !this.isCvLoaded) return;
    const cv = window.cv;
    const video = this.videoElement;
    const canvas = this.canvasElement;
    const overlay = this.overlayElement;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const oCtx = overlay.getContext('2d');

    if (!ctx || !oCtx || video.paused || video.ended) return;
    this.updateAudioLevel();

    // Match canvas size to video
    const dims = this.getRenderDimensions();
    if (!dims) return;
    if (canvas.width !== dims.width || canvas.height !== dims.height) {
      canvas.width = dims.width;
      canvas.height = dims.height;
      overlay.width = dims.width;
      overlay.height = dims.height;
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const src = cv.imread(canvas);

    // --- Video Editor Filters ---
    // Apply brightness and contrast
    src.convertTo(src, -1, this.videoFilters.contrast, this.videoFilters.brightness);

    // Apply saturation
    if (this.videoFilters.saturation !== 1) {
      const hsv = new cv.Mat();
      cv.cvtColor(src, hsv, cv.COLOR_RGB2HSV);
      const channels = new cv.MatVector();
      cv.split(hsv, channels);
      const s = channels.get(1);
      s.convertTo(s, -1, this.videoFilters.saturation, 0);
      cv.merge(channels, hsv);
      cv.cvtColor(hsv, src, cv.COLOR_HSV2RGB);
      hsv.delete();
      channels.delete();
      s.delete();
    }

    // Sharpen via unsharp mask for cleaner edge detail.
    if (this.videoFilters.sharpness > 0) {
      const blurred = new cv.Mat();
      cv.GaussianBlur(src, blurred, new cv.Size(0, 0), 1.25, 1.25, cv.BORDER_DEFAULT);
      cv.addWeighted(src, 1 + this.videoFilters.sharpness * 1.4, blurred, -this.videoFilters.sharpness * 1.4, 0, src);
      blurred.delete();
    }

    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    const binary = new cv.Mat();
    cv.threshold(gray, binary, 150, 255, cv.THRESH_BINARY);

    const ksize = new cv.Size(this.config.blur * 2 + 1, this.config.blur * 2 + 1);
    cv.GaussianBlur(binary, binary, ksize, 0, 0, cv.BORDER_DEFAULT);

    const M = cv.Mat.ones(5, 5, cv.CV_8U);
    cv.dilate(binary, binary, M);
    cv.erode(binary, binary, M);

    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const detectedBlobs = [];
    for (let i = 0; i < contours.size(); ++i) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      if (area > this.config.minSize && area < this.config.maxSize) {
        const rect = cv.boundingRect(cnt);
        const moments = cv.moments(cnt);
        if (moments.m00 !== 0) {
          const cx = moments.m10 / moments.m00;
          const cy = moments.m01 / moments.m00;
          detectedBlobs.push({
            x: cx,
            y: cy,
            width: rect.width,
            height: rect.height,
            area: area
          });
        }
      }
      cnt.delete();
    }

    const prevBlobs = this.processingRef.activeBlobs;
    const nextBlobs = [];
    const usedIndices = new Set();

    detectedBlobs.forEach(detected => {
      let bestMatch = null;
      let minDistance = Infinity;
      let bestIdx = -1;

      prevBlobs.forEach((prev, idx) => {
        if (usedIndices.has(idx)) return;
        const dist = Math.hypot(detected.x - prev.x, detected.y - prev.y);
        if (dist < minDistance && dist < this.config.sensitivity * 2) {
          minDistance = dist;
          bestMatch = prev;
          bestIdx = idx;
        }
      });

      if (bestMatch && bestIdx !== -1) {
        usedIndices.add(bestIdx);
        const lastPositions = [...bestMatch.lastPositions, { x: bestMatch.x, y: bestMatch.y }].slice(-MAX_TRAIL_LENGTH);
        nextBlobs.push({
          ...bestMatch,
          x: detected.x,
          y: detected.y,
          width: detected.width,
          height: detected.height,
          area: detected.area,
          velocityX: detected.x - bestMatch.x,
          velocityY: detected.y - bestMatch.y,
          lastPositions,
          isActive: true
        });
      } else {
        nextBlobs.push({
          id: this.processingRef.nextId++,
          x: detected.x,
          y: detected.y,
          width: detected.width,
          height: detected.height,
          area: detected.area,
          velocityX: 0,
          velocityY: 0,
          lastPositions: [],
          color: `hsl(${Math.random() * 360}, 70%, 60%)`,
          isActive: true
        });
      }
    });

    this.processingRef.activeBlobs = nextBlobs;
    this.blobs = nextBlobs;
    this.stats = { fps: Math.round(1000 / 33), blobCount: nextBlobs.length };

    this.processingRef.frameCount++;

    cv.imshow(canvas, src);
    this.applyBlobFx(ctx, canvas.width, canvas.height, nextBlobs);
    this.vhsEngine.apply(ctx, canvas.width, canvas.height, this.videoFilters, nextBlobs, this.hiddenBlobIds);

    // --- Rendering Overlays ---
    this.renderOverlay(oCtx, nextBlobs, this.config, canvas);

    // Clean up
    src.delete();
    gray.delete();
    binary.delete();
    contours.delete();
    hierarchy.delete();
    M.delete();

    if (this.isPlaying) {
      this.requestRef = requestAnimationFrame(this.processFrame);
    }
  }

  renderOverlay(oCtx, nextBlobs, config, sourceCanvas) {
    const overlay = this.overlayElement;
    if (!overlay) return;
    oCtx.clearRect(0, 0, overlay.width, overlay.height);

    const primaryColor = config.blobColor || '#ffffff';
    const lineColor = config.lineColor || primaryColor;
    const thickness = config.lineThickness || 1;
    const visibleBlobs = nextBlobs.filter(blob => !this.hiddenBlobIds.has(blob.id));

    if (config.showMatteBlob) {
      this.renderMatteBlob(oCtx, visibleBlobs, sourceCanvas);
      this.renderBlobCloseControls([], true);
      return;
    }

    this.renderBlobCloseControls(config.showBoxes ? visibleBlobs : [], false);

    if (config.fxMagnifierLink) {
      this.renderMagnifierLinkOverlay(oCtx, visibleBlobs, sourceCanvas, primaryColor, lineColor, thickness);
    }

    visibleBlobs.forEach(blob => {
      // Trails: one straight connection to nearest visible blob.
      if (config.showTrails && !config.fxMagnifierLink && visibleBlobs.length > 1) {
        let nearest = null;
        let nearestDist = Infinity;
        for (const other of visibleBlobs) {
          if (other.id === blob.id) continue;
          const dist = Math.hypot(blob.x - other.x, blob.y - other.y);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearest = other;
          }
        }
        if (nearest) {
          oCtx.beginPath();
          oCtx.strokeStyle = `${lineColor}99`;
          oCtx.lineWidth = thickness;
          oCtx.moveTo(blob.x, blob.y);
          oCtx.lineTo(nearest.x, nearest.y);
          oCtx.stroke();
        }
      }

      // Box
      if (config.showBoxes) {
        oCtx.strokeStyle = lineColor;
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

      if (config.showCoords) {
        oCtx.fillStyle = primaryColor;
        oCtx.font = '10px JetBrains Mono';
        oCtx.fillText(`ID:${blob.id} X:${Math.round(blob.x)} Y:${Math.round(blob.y)}`, blob.x - blob.width / 2, blob.y - blob.height / 2 - 5);
      }
    });
  }

  renderMagnifierLinkOverlay(oCtx, blobs, sourceCanvas, primaryColor, lineColor, thickness) {
    if (!sourceCanvas || blobs.length < 2) return;

    blobs.forEach(blob => {
      let nearest = null;
      let nearestDist = Infinity;
      for (const other of blobs) {
        if (other.id === blob.id) continue;
        const dist = Math.hypot(blob.x - other.x, blob.y - other.y);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = other;
        }
      }
      if (!nearest) return;

      const lensW = Math.max(32, nearest.width * 1.4);
      const lensH = Math.max(32, nearest.height * 1.4);
      const lensX = nearest.x - lensW / 2;
      const lensY = nearest.y - lensH / 2;
      const sampleW = Math.max(18, blob.width * 0.6);
      const sampleH = Math.max(18, blob.height * 0.6);
      const sampleX = Math.max(0, Math.min(sourceCanvas.width - sampleW, blob.x - sampleW / 2));
      const sampleY = Math.max(0, Math.min(sourceCanvas.height - sampleH, blob.y - sampleH / 2));

      oCtx.save();
      oCtx.beginPath();
      oCtx.rect(lensX, lensY, lensW, lensH);
      oCtx.clip();
      oCtx.drawImage(sourceCanvas, sampleX, sampleY, sampleW, sampleH, lensX, lensY, lensW, lensH);
      oCtx.restore();

      oCtx.beginPath();
      oCtx.strokeStyle = `${lineColor}aa`;
      oCtx.lineWidth = thickness;
      oCtx.moveTo(blob.x, blob.y);
      oCtx.lineTo(nearest.x, nearest.y);
      oCtx.stroke();

      oCtx.strokeStyle = primaryColor;
      oCtx.lineWidth = thickness;
      oCtx.strokeRect(lensX, lensY, lensW, lensH);
    });
  }

  renderMatteBlob(oCtx, blobs, sourceCanvas) {
    const width = oCtx.canvas.width;
    const height = oCtx.canvas.height;
    oCtx.fillStyle = '#000';
    oCtx.fillRect(0, 0, width, height);

    if (!sourceCanvas) return;
    const videoBehindOpacity = Math.max(0, Math.min(1, this.config.matteVideoOpacity ?? 0));
    if (videoBehindOpacity > 0) {
      oCtx.save();
      oCtx.globalAlpha = videoBehindOpacity;
      oCtx.drawImage(sourceCanvas, 0, 0, width, height);
      oCtx.restore();
    }

    const minArea = Math.max(4, this.config.minSize * 0.3);
    const activeBlobs = blobs.filter(blob => blob.area >= minArea);
    const frameTiles = [];
    const centerX = width / 2;
    const centerY = height / 2;
    const densityBase = Math.max(1, this.config.matteDensity || 5);
    const radius = this.config.matteRadius || 60;
    const tileScale = this.config.matteTileScale || 1.3;
    const verticalSpread = this.config.matteVerticalSpread || 0.7;
    const persistence = this.config.mattePersistence || 10;
    const frameSeed = Math.floor(performance.now() / 100);
    const generationSlowdown = Math.max(1, this.config.matteGenerationSlowdown || 1);
    const shouldGenerateTiles = this.processingRef.frameCount % generationSlowdown === 0;

    if (shouldGenerateTiles) {
      activeBlobs.forEach(blob => {
        const tileCount = Math.max(2, Math.round(densityBase + (blob.area / 950)));
        for (let i = 0; i < tileCount; i++) {
          const angle = ((blob.id * 13 + i * 47 + frameSeed) % 360) * (Math.PI / 180);
          const distance = (radius * (0.35 + (i % 7) / 7)) * (0.7 + (blob.area / (this.config.maxSize + 1)));
          const tileW = Math.max(24, (Math.sqrt(blob.area) * 0.7 + 12) * tileScale);
          const tileH = Math.max(20, (Math.sqrt(blob.area) * 0.62 + 10) * tileScale);
          const sx = Math.max(0, Math.min(sourceCanvas.width - tileW, blob.x + Math.cos(angle) * distance * 0.35 - tileW / 2));
          const sy = Math.max(0, Math.min(sourceCanvas.height - tileH, blob.y + Math.sin(angle) * distance * 0.35 - tileH / 2));
          const nx = (blob.x / width) - 0.5;
          const ny = (blob.y / height) - 0.5;
          const dx = centerX + nx * width * 0.35 + Math.cos(angle) * distance - tileW / 2;
          const dy = centerY + ny * height * (0.45 * verticalSpread) + Math.sin(angle) * (distance * 0.52) - tileH / 2;
          frameTiles.push({
            sx,
            sy,
            sw: tileW,
            sh: tileH,
            dx: Math.max(0, Math.min(width - tileW, dx)),
            dy: Math.max(0, Math.min(height - tileH, dy)),
            dw: tileW,
            dh: tileH,
            life: persistence,
            maxLife: Math.max(1, persistence)
          });
        }
      });
    }

    const persistedTiles = this.processingRef.matteTiles
      .map(tile => ({ ...tile, life: tile.life - 1 }))
      .filter(tile => tile.life > 0);
    let combinedTiles = [...persistedTiles, ...frameTiles];
    if (!combinedTiles.length) {
      const fallbackSize = Math.max(28, width * 0.06);
      for (let i = 0; i < 8; i++) {
        const fx = width * (0.2 + ((i % 4) * 0.18));
        const fy = height * (0.3 + (Math.floor(i / 4) * 0.22));
        combinedTiles.push({
          sx: Math.max(0, Math.min(sourceCanvas.width - fallbackSize, fx)),
          sy: Math.max(0, Math.min(sourceCanvas.height - fallbackSize, fy)),
          sw: fallbackSize,
          sh: fallbackSize,
          dx: fx,
          dy: fy,
          dw: fallbackSize,
          dh: fallbackSize,
          life: Math.max(2, Math.floor(persistence * 0.4)),
          maxLife: Math.max(2, Math.floor(persistence * 0.4))
        });
      }
    }

    const coverage = this.computeTileCoverage(combinedTiles, width, height);
    this.processingRef.matteTiles = combinedTiles.filter(tile => tile.life > 0).slice(-1500);

    combinedTiles.forEach(tile => {
      const lifeAlpha = Math.max(0.2, tile.life / Math.max(1, tile.maxLife));
      const distanceFromCenter = Math.abs((tile.dy + tile.dh / 2) - centerY) / (height * 0.55);
      const edgeFade = Math.max(0.15, 1 - distanceFromCenter);
      oCtx.globalAlpha = Math.min(1, 0.25 + edgeFade * 0.7) * lifeAlpha;
      oCtx.drawImage(sourceCanvas, tile.sx, tile.sy, tile.sw, tile.sh, tile.dx, tile.dy, tile.dw, tile.dh);
      oCtx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
      oCtx.lineWidth = 1;
      oCtx.strokeRect(tile.dx, tile.dy, tile.dw, tile.dh);
    });

    const matteStrength = Math.max(0.25, 0.75 - coverage * 0.9);
    const topGradient = oCtx.createLinearGradient(0, 0, 0, height * 0.25);
    topGradient.addColorStop(0, `rgba(0,0,0,${0.98})`);
    topGradient.addColorStop(1, `rgba(0,0,0,${matteStrength})`);
    oCtx.fillStyle = topGradient;
    oCtx.fillRect(0, 0, width, height * 0.25);

    const bottomGradient = oCtx.createLinearGradient(0, height, 0, height * 0.75);
    bottomGradient.addColorStop(0, `rgba(0,0,0,${0.98})`);
    bottomGradient.addColorStop(1, `rgba(0,0,0,${matteStrength})`);
    oCtx.fillStyle = bottomGradient;
    oCtx.fillRect(0, height * 0.75, width, height * 0.25);

    oCtx.globalAlpha = 1;
  }

  renderBlobCloseControls(blobs, isMatteMode) {
    const controlsLayer = document.getElementById('blob-controls-layer');
    if (!controlsLayer || !this.overlayElement) return;
    controlsLayer.innerHTML = '';

    blobs.forEach(blob => {
      const button = document.createElement('button');
      const left = (blob.x - blob.width / 2) - 7;
      const top = (blob.y - blob.height / 2) - 7;
      button.type = 'button';
      button.className = 'blob-close-btn';
      button.textContent = '×';
      button.style.left = `${Math.max(0, left)}px`;
      button.style.top = `${Math.max(0, top)}px`;
      button.title = `Hide Blob ${blob.id}`;
      button.dataset.blobId = String(blob.id);
      button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.hideBlobFromVisualization(blob.id);
      });

      if (isMatteMode) {
        button.style.opacity = '0.8';
      }

      controlsLayer.appendChild(button);
    });
  }

  hideBlobFromVisualization(blobId) {
    this.hiddenBlobIds.add(blobId);
  }

  clearHiddenBlobs() {
    this.hiddenBlobIds.clear();
    const controlsLayer = document.getElementById('blob-controls-layer');
    if (controlsLayer) controlsLayer.innerHTML = '';
    this.processingRef.matteTiles = [];
    this.processingRef.echoHistory = [];
  }

  computeTileCoverage(tiles, width, height) {
    if (!tiles.length || width <= 0 || height <= 0) return 0;
    const area = tiles.reduce((sum, tile) => sum + (tile.dw * tile.dh), 0);
    return Math.min(1, area / (width * height));
  }

  setupAudioAnalyser() {
    if (!this.videoElement || this.audioAnalyser || !window.AudioContext) return;
    try {
      this.audioContext = new window.AudioContext();
      this.audioSource = this.audioContext.createMediaElementSource(this.videoElement);
      this.audioAnalyser = this.audioContext.createAnalyser();
      this.audioAnalyser.fftSize = 256;
      this.audioData = new Uint8Array(this.audioAnalyser.frequencyBinCount);
      this.audioSource.connect(this.audioAnalyser);
      this.audioAnalyser.connect(this.audioContext.destination);
    } catch (_e) {
      this.audioAnalyser = null;
    }
  }

  updateAudioLevel() {
    if (!this.audioAnalyser || !this.audioData) {
      this.audioLevel *= 0.92;
      return;
    }
    this.audioAnalyser.getByteFrequencyData(this.audioData);
    let sum = 0;
    for (let i = 0; i < this.audioData.length; i++) {
      sum += this.audioData[i];
    }
    const target = (sum / this.audioData.length) / 255;
    this.audioLevel = this.audioLevel * 0.8 + target * 0.2;
  }

  applyBlobFx(ctx, width, height, blobs) {
    const visibleBlobs = blobs.filter(blob => !this.hiddenBlobIds.has(blob.id));
    if ((!this.config.fxNegative && !this.config.fxBlur) || !visibleBlobs.length) return;

    if (this.config.fxNegative) {
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      visibleBlobs.forEach(blob => {
        const x0 = Math.max(0, Math.floor(blob.x - blob.width / 2));
        const y0 = Math.max(0, Math.floor(blob.y - blob.height / 2));
        const x1 = Math.min(width, Math.ceil(blob.x + blob.width / 2));
        const y1 = Math.min(height, Math.ceil(blob.y + blob.height / 2));
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const idx = (y * width + x) * 4;
            data[idx] = 255 - data[idx];
            data[idx + 1] = 255 - data[idx + 1];
            data[idx + 2] = 255 - data[idx + 2];
          }
        }
      });
      ctx.putImageData(imageData, 0, 0);
    }

    if (this.config.fxBlur) {
      if (!this.fxCanvas) this.fxCanvas = document.createElement('canvas');
      const fxCanvas = this.fxCanvas;
      if (fxCanvas.width !== width || fxCanvas.height !== height) {
        fxCanvas.width = width;
        fxCanvas.height = height;
      }
      const fxCtx = fxCanvas.getContext('2d');
      if (!fxCtx) return;
      fxCtx.drawImage(ctx.canvas, 0, 0);

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.filter = 'blur(8px) saturate(1.3)';
      visibleBlobs.forEach(blob => {
        const x = blob.x - blob.width / 2;
        const y = blob.y - blob.height / 2;
        const w = blob.width;
        const h = blob.height;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        ctx.drawImage(fxCanvas, 0, 0);
        ctx.restore();
      });
      ctx.restore();
    }

  }


  renderGoo() {
    if (!this.gooCanvas) return;

    const ctx = this.gooCanvas.getContext('2d');
    if (!ctx) return;

    const w = this.gooCanvas.clientWidth || this.gooCanvas.width;
    const h = this.gooCanvas.clientHeight || this.gooCanvas.height;
    if (this.gooCanvas.width !== w || this.gooCanvas.height !== h) {
      this.gooCanvas.width = w;
      this.gooCanvas.height = h;
    }

    ctx.clearRect(0, 0, w, h);
    const t = performance.now() * 0.0025;
    const amp = this.audioLevel;
    const blobMotion = this.blobs.length ? Math.min(1, this.blobs.length / 8) : 0;
    const stretch = 1 + amp * 0.35 + blobMotion * 0.25;
    const wobble = 8 + amp * 18 + blobMotion * 8;
    const cx = w / 2 + Math.sin(t * 0.75) * (5 + amp * 8);
    const cy = h / 2 + Math.cos(t * 0.9) * 3;
    const bw = Math.min(w * 0.78, 112 + amp * 35);
    const bh = Math.min(h * 0.74, 84 + amp * 26);
    const dripLen = 8 + amp * 16;

    const grad = ctx.createRadialGradient(cx - bw * 0.22, cy - bh * 0.45, 10, cx, cy + bh * 0.2, bw * 0.9);
    grad.addColorStop(0, '#fbcfe8');
    grad.addColorStop(0.58, '#f472b6');
    grad.addColorStop(1, '#831843');

    ctx.save();
    ctx.shadowColor = 'rgba(244,114,182,0.65)';
    ctx.shadowBlur = 28 + amp * 40;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx - bw * 0.5, cy - bh * 0.05);
    ctx.bezierCurveTo(cx - bw * 0.62, cy - bh * 0.62, cx + bw * 0.6, cy - bh * 0.58, cx + bw * 0.48, cy - bh * 0.06);
    ctx.bezierCurveTo(cx + bw * 0.7, cy + bh * 0.56 + Math.sin(t * 1.9) * wobble, cx - bw * 0.72, cy + bh * 0.56 + Math.cos(t * 1.6) * wobble, cx - bw * 0.5, cy - bh * 0.05);
    ctx.fill();

    // Elastic dripping strands
    ctx.fillStyle = '#db2777';
    for (let i = 0; i < 3; i++) {
      const px = cx - bw * 0.3 + i * bw * 0.2;
      const phase = t * (1.6 + i * 0.25);
      const py = cy + bh * 0.28 + Math.sin(phase) * 8;
      ctx.beginPath();
      ctx.moveTo(px - 6, py);
      ctx.quadraticCurveTo(px, py + dripLen * (0.75 + Math.abs(Math.sin(phase)) * 0.4), px + 6, py);
      ctx.fill();
    }
    ctx.restore();

    // Cute eyes
    const eyeY = cy - bh * 0.12;
    ctx.fillStyle = '#1f030f';
    ctx.beginPath();
    ctx.ellipse(cx - bw * 0.18, eyeY, 7, 9, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + bw * 0.18, eyeY, 7, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cx - bw * 0.2, eyeY - 2, 1.5, 0, Math.PI * 2);
    ctx.arc(cx + bw * 0.16, eyeY - 2, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Happy smile
    const mouthY = cy + bh * 0.14;
    ctx.strokeStyle = '#7f1d1d';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(cx, mouthY, bw * 0.17 * stretch, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }

  startRecording() {
    if (!this.overlayElement || !this.canvasElement) return;
    this.processingRef.recordedChunks = [];
    const recordCanvas = document.createElement('canvas');
    recordCanvas.width = 1280;
    recordCanvas.height = 720;
    const rCtx = recordCanvas.getContext('2d');
    const stream = recordCanvas.captureStream(30);
    const recorder = new MediaRecorder(stream, {
      mimeType: 'video/webm',
      videoBitsPerSecond: 5_000_000
    });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.processingRef.recordedChunks.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(this.processingRef.recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'processed_video.webm';
      link.click();
      this.processingRef.recordedChunks = [];
    };
    this.processingRef.mediaRecorder = recorder;
    recorder.start();
    const drawRecord = () => {
      if (recorder.state === 'recording') {
        rCtx?.clearRect(0, 0, recordCanvas.width, recordCanvas.height);
        rCtx?.drawImage(this.canvasElement, 0, 0, recordCanvas.width, recordCanvas.height);
        rCtx?.drawImage(this.overlayElement, 0, 0, recordCanvas.width, recordCanvas.height);
        requestAnimationFrame(drawRecord);
      }
    };
    drawRecord();
  }

  stopRecording() {
    this.processingRef.mediaRecorder?.stop();
  }

}

// Export for use in other modules
export { BlobTracker };
