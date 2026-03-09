const MAX_TRAIL_LENGTH = 20;
const MESH_DISTANCE_THRESHOLD = 150;

class BlobTracker {
  constructor() {
    this.blobs = [];
    this.stats = { fps: 0, blobCount: 0 };
    this.processingRef = {
      prevFrame: null,
      nextId: 1,
      activeBlobs: [],
      recordedChunks: [],
      mediaRecorder: null,
      frameCount: 0,
      exportData: []
    };
    this.requestRef = null;
    this.isPlaying = false;
    this.isCvLoaded = false;
    this.config = {
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
      mode: 'threshold',
      blobColor: '#ffffff',
      trailHue: 0,
      lineThickness: 1
    };
    this.filters = {
      brightness: 0,
      contrast: 1,
      saturation: 1,
      sharpness: 0
    };
    this.videoFilters = {
      grain: 0,
      bitCrush: 16,
      brightness: 0,
      contrast: 1,
      saturation: 1
    };
    this.videoElement = null;
    this.canvasElement = null;
    this.overlayElement = null;
    this.gooCanvas = null;
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

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  updateFilters(newFilters) {
    this.filters = { ...this.filters, ...newFilters };
  }

  updateVideoFilters(newFilters) {
    this.videoFilters = { ...this.videoFilters, ...newFilters };
  }

  startTracking() {
    this.isPlaying = true;
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

  processFrame = () => {
    if (!this.videoElement || !this.canvasElement || !this.overlayElement || !this.isCvLoaded) return;
    const cv = window.cv;
    const video = this.videoElement;
    const canvas = this.canvasElement;
    const overlay = this.overlayElement;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const oCtx = overlay.getContext('2d');

    if (!ctx || !oCtx || video.paused || video.ended) return;

    // Match canvas size to video
    if (canvas.width !== video.videoWidth) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      overlay.width = video.videoWidth;
      overlay.height = video.videoHeight;
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

    // Apply bit crush (reduce color precision)
    if (this.videoFilters.bitCrush < 16) {
      const factor = Math.pow(2, this.videoFilters.bitCrush);
      src.convertTo(src, -1, 1, 0);
      src.convertTo(src, -1, factor / 255, 0);
      src.convertTo(src, cv.CV_8U, 255 / factor, 0);
    }

    // Apply grain (add noise)
    if (this.videoFilters.grain > 0) {
      const noise = new cv.Mat(src.rows, src.cols, src.type());
      cv.randn(noise, 0, this.videoFilters.grain);
      cv.add(src, noise, src);
      noise.delete();
    }

    cv.imshow(canvas, src);

    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    const binary = new cv.Mat();
    if (this.config.mode === 'threshold') {
      cv.threshold(gray, binary, this.config.threshold, 255, cv.THRESH_BINARY);
    } else {
      if (this.processingRef.prevFrame) {
        cv.absdiff(gray, this.processingRef.prevFrame, binary);
        cv.threshold(binary, this.config.threshold, 255, cv.THRESH_BINARY);
      } else {
        gray.copyTo(binary);
      }
      if (this.processingRef.prevFrame) this.processingRef.prevFrame.delete();
      this.processingRef.prevFrame = gray.clone();
    }

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

    this.processingRef.exportData.push({
      frame: this.processingRef.frameCount++,
      blobs: nextBlobs.map(b => ({ id: b.id, x: b.x, y: b.y, w: b.width, h: b.height }))
    });

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
  }

  renderGoo() {
    if (!this.gooCanvas || !this.blobs.length) return;

    const ctx = this.gooCanvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, this.gooCanvas.width, this.gooCanvas.height);

    // Simple goo effect - pulsing circles based on blob positions
    this.blobs.forEach(blob => {
      const time = Date.now() * 0.005;
      const pulse = Math.sin(time + blob.id) * 0.5 + 0.5;
      const radius = 20 + pulse * 10;

      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = blob.color;
      ctx.beginPath();
      ctx.arc(blob.x * (this.gooCanvas.width / 640), blob.y * (this.gooCanvas.height / 480), radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  exportData() {
    const dataStr = JSON.stringify(this.processingRef.exportData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'blob_data.json';
    link.click();
  }

  startRecording() {
    if (!this.overlayElement || !this.canvasElement) return;
    const recordCanvas = document.createElement('canvas');
    recordCanvas.width = this.canvasElement.width;
    recordCanvas.height = this.canvasElement.height;
    const rCtx = recordCanvas.getContext('2d');
    const stream = recordCanvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
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
        rCtx?.drawImage(this.canvasElement, 0, 0);
        rCtx?.drawImage(this.overlayElement, 0, 0);
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