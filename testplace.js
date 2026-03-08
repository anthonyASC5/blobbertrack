import { BlobTracker } from './blobtracker.js';

// Extend BlobTracker for test features
class TestBlobTracker extends BlobTracker {
  constructor() {
    super();
    this.glassMode = false;
    this.noiseReduction = 0;
    this.edgeEnhancement = 0;
  }

  updateTestConfig(config) {
    this.glassMode = config.glassMode || false;
    this.noiseReduction = config.noiseReduction || 0;
    this.edgeEnhancement = config.edgeEnhancement || 0;
    this.updateConfig(config);
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

    // --- Test Filters ---
    src.convertTo(src, -1, this.filters.contrast, this.filters.brightness);

    if (this.filters.saturation !== 1) {
      const hsv = new cv.Mat();
      cv.cvtColor(src, hsv, cv.COLOR_RGB2HSV);
      const channels = new cv.MatVector();
      cv.split(hsv, channels);
      const s = channels.get(1);
      s.convertTo(s, -1, this.filters.saturation, 0);
      cv.merge(channels, hsv);
      cv.cvtColor(hsv, src, cv.COLOR_HSV2RGB);
      hsv.delete();
      channels.delete();
      s.delete();
    }

    // Noise reduction
    if (this.noiseReduction > 0) {
      const blurred = new cv.Mat();
      cv.GaussianBlur(src, blurred, new cv.Size(0, 0), this.noiseReduction);
      cv.addWeighted(src, 1, blurred, -0.5, 0, src);
      blurred.delete();
    }

    // Edge enhancement
    if (this.edgeEnhancement > 0) {
      const edges = new cv.Mat();
      cv.Canny(src, edges, 100, 200);
      cv.cvtColor(edges, edges, cv.COLOR_GRAY2RGB);
      cv.addWeighted(src, 1, edges, this.edgeEnhancement * 0.1, 0, src);
      edges.delete();
    }

    cv.imshow(canvas, src);

    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    const binary = new cv.Mat();
    cv.threshold(gray, binary, this.config.threshold, 255, cv.THRESH_BINARY);

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
    this.renderTestOverlay(oCtx, nextBlobs, this.config, canvas);

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

  renderTestOverlay(oCtx, nextBlobs, config, sourceCanvas) {
    const overlay = this.overlayElement;
    if (!overlay) return;
    oCtx.clearRect(0, 0, overlay.width, overlay.height);

    const primaryColor = config.blobColor || '#00ff00';
    const trailHue = config.trailHue || 120;
    const thickness = config.lineThickness || 2;

    // Glass Effect (Rendered first so other overlays stay on top)
    if (this.glassMode) {
      nextBlobs.forEach(blob => {
        const glassScale = 1.8;
        const glassW = blob.width * glassScale;
        const glassH = blob.height * glassScale;
        const glassX = blob.x - glassW / 2;
        const glassY = blob.y - glassH / 2;

        oCtx.save();

        // Create circular lens mask
        oCtx.beginPath();
        oCtx.ellipse(blob.x, blob.y, glassW / 2, glassH / 2, 0, Math.PI * 2);
        oCtx.clip();

        // Draw distorted background
        const sampleScale = 0.7;
        const sw = glassW * sampleScale;
        const sh = glassH * sampleScale;
        const sx = blob.x - sw / 2;
        const sy = blob.y - sh / 2;

        oCtx.drawImage(sourceCanvas, sx, sy, sw, sh, glassX, glassY, glassW, glassH);

        oCtx.restore();
      });
    }

    nextBlobs.forEach(blob => {
      // Trails
      if (config.showTrails && blob.lastPositions.length > 1) {
        oCtx.beginPath();
        oCtx.strokeStyle = `hsla(${trailHue}, 100%, 50%, 0.3)`;
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

      // ID
      oCtx.fillStyle = primaryColor;
      oCtx.font = '10px JetBrains Mono';
      oCtx.fillText(`ID:${blob.id}`, blob.x - blob.width / 2, blob.y - blob.height / 2 - 5);
    });
  }
}

// Global variables
let testBlobTracker;
let videoSrc = null;

// Initialize the test application
document.addEventListener('DOMContentLoaded', () => {
  testBlobTracker = new TestBlobTracker();
  testBlobTracker.init('video', 'canvas', 'overlay', null);

  setupTestEventListeners();
  updateTestUI();
});

// Setup test event listeners
function setupTestEventListeners() {
  // Video upload
  document.getElementById('upload-zone').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const url = URL.createObjectURL(file);
        loadTestVideo(url);
      }
    };
    input.click();
  });

  // Controls
  document.getElementById('start-btn').addEventListener('click', startTestTracking);
  document.getElementById('threshold-slider').addEventListener('input', updateTestConfig);
  document.getElementById('min-size-slider').addEventListener('input', updateTestConfig);
  document.getElementById('sensitivity-slider').addEventListener('input', updateTestConfig);
  document.getElementById('trail-hue-slider').addEventListener('input', updateTestConfig);

  // Toggles
  document.getElementById('show-boxes').addEventListener('change', updateTestConfig);
  document.getElementById('show-centers').addEventListener('change', updateTestConfig);
  document.getElementById('show-trails').addEventListener('change', updateTestConfig);
  document.getElementById('glass-mode').addEventListener('change', updateTestConfig);

  // Test features
  document.getElementById('noise-slider').addEventListener('input', updateTestConfig);
  document.getElementById('edge-slider').addEventListener('input', updateTestConfig);

  // Color buttons
  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const color = e.target.dataset.color;
      setTestBlobColor(color);
    });
  });
}

function loadTestVideo(url) {
  videoSrc = url;
  const video = document.getElementById('video');
  video.src = url;
  document.getElementById('upload-zone').classList.add('hidden');
  document.getElementById('video-container').classList.remove('hidden');
  document.getElementById('start-overlay').classList.remove('hidden');
  testBlobTracker.processingRef.nextId = 1;
  testBlobTracker.processingRef.activeBlobs = [];
  testBlobTracker.processingRef.frameCount = 0;
  testBlobTracker.processingRef.exportData = [];
  updateTestViewportInfo();
}

function startTestTracking() {
  testBlobTracker.startTracking();
  document.getElementById('start-overlay').classList.add('hidden');
}

function updateTestConfig() {
  const config = {
    threshold: parseInt(document.getElementById('threshold-slider').value),
    minSize: parseInt(document.getElementById('min-size-slider').value),
    sensitivity: parseInt(document.getElementById('sensitivity-slider').value),
    showBoxes: document.getElementById('show-boxes').checked,
    showCenters: document.getElementById('show-centers').checked,
    showTrails: document.getElementById('show-trails').checked,
    trailHue: parseInt(document.getElementById('trail-hue-slider').value),
    glassMode: document.getElementById('glass-mode').checked,
    noiseReduction: parseInt(document.getElementById('noise-slider').value),
    edgeEnhancement: parseInt(document.getElementById('edge-slider').value)
  };
  testBlobTracker.updateTestConfig(config);
}

function setTestBlobColor(color) {
  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  event.target.classList.add('active');
  testBlobTracker.updateConfig({ blobColor: color });
}

function updateTestViewportInfo() {
  const video = document.getElementById('video');
  document.getElementById('viewport-info').textContent =
    `Test_Viewport // ${video.videoWidth || 0}x${video.videoHeight || 0}`;
}

function updateTestUI() {
  // Update stats
  document.getElementById('fps-display').textContent = `FPS: ${testBlobTracker.stats.fps}`;
  document.getElementById('blob-count-display').textContent = `BLOBS: ${testBlobTracker.stats.blobCount}`;

  // Update debug info
  const debugInfo = document.getElementById('debug-info');
  if (testBlobTracker.blobs.length > 0) {
    const blob = testBlobTracker.blobs[0];
    debugInfo.innerHTML = `
      First Blob ID: ${blob.id}<br>
      Position: (${Math.round(blob.x)}, ${Math.round(blob.y)})<br>
      Size: ${Math.round(blob.width)}x${Math.round(blob.height)}<br>
      Area: ${Math.round(blob.area)}<br>
      Velocity: (${Math.round(blob.velocityX)}, ${Math.round(blob.velocityY)})
    `;
  } else {
    debugInfo.textContent = 'Waiting for video input...';
  }

  requestAnimationFrame(updateTestUI);
}