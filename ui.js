import { BlobTracker } from './blobtracker.js';

// Global variables
let blobTracker;
let videoSrc = null;
let reverseTimer = null;
const ICONS = {
  play: '<svg class="ui-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.5l7 4.5-7 4.5z"></path></svg>',
  pause: '<svg class="ui-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.5v9M11 3.5v9"></path></svg>',
  gear: '<svg class="ui-icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="2.5"></circle><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M12.8 3.2l-1.4 1.4M4.6 11.4l-1.4 1.4"></path></svg>',
  chevronRight: '<svg class="ui-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5L10.5 8 6 12.5"></path></svg>',
  camera: '<svg class="ui-icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="4" width="8" height="8" rx="1.5"></rect><path d="M10.5 7l3-1.5v5l-3-1.5z"></path></svg>',
  chevronDown: '<svg class="ui-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 6L8 10.5 12.5 6"></path></svg>',
  stop: '<svg class="ui-icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="4.5" y="4.5" width="7" height="7"></rect></svg>'
};
const MORE_FILTER_IDS = [
  'edge-detect-slider',
  'scanline-thickness-slider',
  'gamma-slider',
  'sepia-slider',
  'rgb-shift-r-slider',
  'rgb-shift-g-slider',
  'rgb-shift-b-slider',
  'scanline-intensity-slider'
];

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  blobTracker = new BlobTracker();
  blobTracker.init('video', 'canvas', 'overlay', 'goo-canvas');

  initializeIcons();
  setupEventListeners();
  updateUI();
});

// Setup all event listeners
function setupEventListeners() {
  // Video upload
  document.getElementById('video-upload').addEventListener('change', handleFileUpload);
  document.getElementById('upload-zone').addEventListener('click', () => {
    document.getElementById('video-upload').click();
  });

  // Drag and drop
  const videoSection = document.getElementById('video-section');
  videoSection.addEventListener('dragover', (e) => {
    e.preventDefault();
    videoSection.classList.add('dragover');
  });
  videoSection.addEventListener('dragleave', () => {
    videoSection.classList.remove('dragover');
  });
  videoSection.addEventListener('drop', handleDrop);

  // Play/pause controls
  document.getElementById('play-btn').addEventListener('click', togglePlay);
  document.getElementById('start-btn').addEventListener('click', startTracking);
  document.getElementById('player-toggle-btn').addEventListener('click', togglePlay);
  document.getElementById('player-reverse-btn').addEventListener('click', toggleReversePlayback);

  // Module controls
  document.getElementById('video-editor-toggle').addEventListener('click', toggleVideoEditor);
  document.getElementById('matte-blob-toggle').addEventListener('click', toggleMatteBlobPanel);
  document.getElementById('blob-params-toggle').addEventListener('click', toggleBlobParamsPanel);

  // Video editor
  document.getElementById('sharpen-slider').addEventListener('input', updateVideoFilters);
  document.getElementById('brightness-slider').addEventListener('input', updateVideoFilters);
  document.getElementById('contrast-slider').addEventListener('input', updateVideoFilters);
  document.getElementById('saturation-slider').addEventListener('input', updateVideoFilters);
  MORE_FILTER_IDS.forEach(id => document.getElementById(id).addEventListener('input', updateVideoFilters));
  document.getElementById('reset-video-filters').addEventListener('click', resetVideoFilters);

  // Detection controls
  document.getElementById('blur-slider').addEventListener('input', updateConfig);

  // Tracking controls
  document.getElementById('min-size-slider').addEventListener('input', updateConfig);
  document.getElementById('max-size-slider').addEventListener('input', updateConfig);
  document.getElementById('sensitivity-slider').addEventListener('input', updateConfig);

  // Visualization toggles
  document.getElementById('show-boxes').addEventListener('change', updateConfig);
  document.getElementById('show-centers').addEventListener('change', updateConfig);
  document.getElementById('show-trails').addEventListener('change', updateConfig);
  document.getElementById('show-mesh').addEventListener('change', updateConfig);
  document.getElementById('show-coords').addEventListener('change', updateConfig);
  document.getElementById('show-matte-blob').addEventListener('change', () => {
    syncMatteBlobControls();
    updateConfig();
  });
  document.getElementById('matte-adaptive').addEventListener('change', updateConfig);
  document.getElementById('matte-density-slider').addEventListener('input', updateConfig);
  document.getElementById('matte-radius-slider').addEventListener('input', updateConfig);
  document.getElementById('matte-size-slider').addEventListener('input', updateConfig);
  document.getElementById('matte-vertical-slider').addEventListener('input', updateConfig);
  document.getElementById('matte-persistence-slider').addEventListener('input', updateConfig);
  document.getElementById('matte-coverage-slider').addEventListener('input', updateConfig);

  // More tab
  document.getElementById('more-tab-toggle').addEventListener('click', toggleMoreTab);

  // Color science
  document.getElementById('color-science-toggle').addEventListener('click', toggleColorScience);
  document.getElementById('trail-hue-slider').addEventListener('input', updateConfig);
  document.getElementById('line-thickness-slider').addEventListener('input', updateConfig);
  document.getElementById('fx-negative').addEventListener('change', updateConfig);
  document.getElementById('fx-blur').addEventListener('change', updateConfig);
  document.getElementById('fx-glow').addEventListener('change', updateConfig);

  // Color buttons
  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const color = e.target.dataset.color;
      setBlobColor(color);
    });
  });
  document.querySelectorAll('.line-color-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const color = e.target.dataset.lineColor;
      setLineColor(color);
    });
  });

  // Record
  document.getElementById('record-btn').addEventListener('click', toggleRecording);

  // Info modal
  document.getElementById('info-btn').addEventListener('click', () => {
    document.getElementById('info-modal').classList.remove('hidden');
  });
  document.getElementById('close-modal').addEventListener('click', () => {
    document.getElementById('info-modal').classList.add('hidden');
  });
  document.getElementById('modal-backdrop').addEventListener('click', () => {
    document.getElementById('info-modal').classList.add('hidden');
  });

  // Test mode button
  document.getElementById('test-mode-btn').addEventListener('click', () => {
    window.location.href = 'testplace.html';
  });

  // Mobile panel toggles
  document.getElementById('mobile-inspector-toggle').addEventListener('click', toggleInspector);
  document.getElementById('mobile-hud-toggle').addEventListener('click', toggleHUDMobile);

  // Global keyboard controls
  document.addEventListener('keydown', handleGlobalKeydown);
}

// Event handlers
function handleFileUpload(e) {
  const file = e.target.files[0];
  if (file) {
    const url = URL.createObjectURL(file);
    loadVideo(url);
  }
}

function handleDrop(e) {
  e.preventDefault();
  document.getElementById('video-section').classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('video/')) {
    const url = URL.createObjectURL(file);
    loadVideo(url);
  }
}

function loadVideo(url) {
  stopReversePlayback();
  videoSrc = url;
  const video = document.getElementById('video');
  video.src = url;
  video.muted = false;
  document.getElementById('upload-zone').classList.add('hidden');
  document.getElementById('video-container').classList.remove('hidden');
  document.getElementById('start-overlay').classList.remove('hidden');
  blobTracker.processingRef.nextId = 1;
  blobTracker.processingRef.activeBlobs = [];
  blobTracker.processingRef.frameCount = 0;
  blobTracker.clearHiddenBlobs();
  updateViewportInfo();
}

function startTracking() {
  blobTracker.startTracking();
  document.getElementById('start-overlay').classList.add('hidden');
  setPlayButtonState(true);
}

function togglePlay() {
  if (!videoSrc) return;
  stopReversePlayback();

  if (blobTracker.isPlaying) {
    blobTracker.stopTracking();
    document.getElementById('video').pause();
    setPlayButtonState(false);
  } else {
    blobTracker.startTracking();
    setPlayButtonState(true);
  }
}

function toggleReversePlayback() {
  const video = document.getElementById('video');
  if (!videoSrc || !video.duration) return;

  if (reverseTimer) {
    stopReversePlayback();
    return;
  }

  blobTracker.stopTracking();
  setPlayButtonState(false);
  reverseTimer = window.setInterval(() => {
    if (video.currentTime <= 0.05) {
      stopReversePlayback();
      return;
    }
    video.currentTime = Math.max(0, video.currentTime - (1 / 30));
    blobTracker.renderStillFrame();
  }, 33);
}

function stopReversePlayback() {
  if (reverseTimer) {
    window.clearInterval(reverseTimer);
    reverseTimer = null;
  }
}

function toggleVideoEditor() {
  const videoEditorPanel = document.getElementById('video-editor-panel');
  const isCollapsed = videoEditorPanel.classList.contains('collapsed');
  if (isCollapsed) {
    videoEditorPanel.classList.remove('collapsed');
    document.getElementById('video-editor-toggle-icon').innerHTML = ICONS.chevronDown;
  } else {
    videoEditorPanel.classList.add('collapsed');
    document.getElementById('video-editor-toggle-icon').innerHTML = ICONS.chevronRight;
  }
}

function toggleInspector() {
  const panel = document.querySelector('.inspector-panel');
  panel.classList.toggle('inspector-visible');
}

function toggleHUDMobile() {
  const panel = document.querySelector('.hud-panel');
  panel.classList.toggle('hud-visible');
}

function updateVideoFilters() {
  const filters = {
    sharpness: parseInt(document.getElementById('sharpen-slider').value) / 100,
    brightness: parseInt(document.getElementById('brightness-slider').value),
    contrast: parseInt(document.getElementById('contrast-slider').value) / 100,
    saturation: parseInt(document.getElementById('saturation-slider').value) / 100,
    edgeDetect: parseInt(document.getElementById('edge-detect-slider').value) / 100,
    scanlineThickness: parseInt(document.getElementById('scanline-thickness-slider').value),
    gamma: parseInt(document.getElementById('gamma-slider').value) / 100,
    sepia: parseInt(document.getElementById('sepia-slider').value) / 100,
    rgbShift: {
      r: parseInt(document.getElementById('rgb-shift-r-slider').value),
      g: parseInt(document.getElementById('rgb-shift-g-slider').value),
      b: parseInt(document.getElementById('rgb-shift-b-slider').value)
    },
    scanlineIntensity: parseInt(document.getElementById('scanline-intensity-slider').value) / 100
  };
  blobTracker.updateVideoFilters(filters);
}

function resetVideoFilters() {
  document.getElementById('sharpen-slider').value = 0;
  document.getElementById('brightness-slider').value = 0;
  document.getElementById('contrast-slider').value = 100;
  document.getElementById('saturation-slider').value = 100;
  document.getElementById('edge-detect-slider').value = 0;
  document.getElementById('scanline-thickness-slider').value = 0;
  document.getElementById('gamma-slider').value = 100;
  document.getElementById('sepia-slider').value = 0;
  document.getElementById('rgb-shift-r-slider').value = 0;
  document.getElementById('rgb-shift-g-slider').value = 0;
  document.getElementById('rgb-shift-b-slider').value = 0;
  document.getElementById('scanline-intensity-slider').value = 30;
  updateVideoFilters();
}

function updateConfig() {
  const config = {
    blur: parseInt(document.getElementById('blur-slider').value),
    minSize: parseInt(document.getElementById('min-size-slider').value),
    maxSize: parseInt(document.getElementById('max-size-slider').value),
    sensitivity: parseInt(document.getElementById('sensitivity-slider').value),
    showBoxes: document.getElementById('show-boxes').checked,
    showCenters: document.getElementById('show-centers').checked,
    showTrails: document.getElementById('show-trails').checked,
    showMesh: document.getElementById('show-mesh').checked,
    showCoords: document.getElementById('show-coords').checked,
    fxNegative: document.getElementById('fx-negative').checked,
    fxBlur: document.getElementById('fx-blur').checked,
    fxGlow: document.getElementById('fx-glow').checked,
    showMatteBlob: document.getElementById('show-matte-blob').checked,
    matteAdaptive: document.getElementById('matte-adaptive').checked,
    matteDensity: parseInt(document.getElementById('matte-density-slider').value),
    matteRadius: parseInt(document.getElementById('matte-radius-slider').value),
    matteTileScale: parseInt(document.getElementById('matte-size-slider').value) / 100,
    matteVerticalSpread: parseInt(document.getElementById('matte-vertical-slider').value) / 100,
    mattePersistence: parseInt(document.getElementById('matte-persistence-slider').value),
    matteCoverageMin: parseInt(document.getElementById('matte-coverage-slider').value) / 100,
    trailHue: parseInt(document.getElementById('trail-hue-slider').value),
    lineThickness: parseInt(document.getElementById('line-thickness-slider').value),
    lineColor: blobTracker.config.lineColor || '#ef4444'
  };
  blobTracker.updateConfig(config);
}

function toggleColorScience() {
  const panel = document.getElementById('color-science-panel');
  const indicator = document.getElementById('color-science-indicator');
  if (panel.classList.contains('hidden')) {
    panel.classList.remove('hidden');
    indicator.classList.remove('scale-75');
    indicator.classList.add('scale-125');
    indicator.classList.replace('bg-pink-900', 'bg-pink-500');
  } else {
    panel.classList.add('hidden');
    indicator.classList.add('scale-75');
    indicator.classList.remove('scale-125');
    indicator.classList.replace('bg-pink-500', 'bg-pink-900');
  }
}

function toggleMatteBlobPanel() {
  const panel = document.getElementById('matte-blob-panel');
  const indicator = document.getElementById('matte-blob-indicator');
  if (panel.classList.contains('hidden')) {
    panel.classList.remove('hidden');
    indicator.classList.remove('scale-75');
    indicator.classList.add('scale-125');
    indicator.classList.replace('bg-pink-900', 'bg-pink-500');
  } else {
    panel.classList.add('hidden');
    indicator.classList.add('scale-75');
    indicator.classList.remove('scale-125');
    indicator.classList.replace('bg-pink-500', 'bg-pink-900');
  }
}

function toggleMoreTab() {
  const panel = document.getElementById('more-tab-content');
  const icon = document.getElementById('more-tab-toggle-icon');
  panel.classList.toggle('hidden');
  icon.innerHTML = panel.classList.contains('hidden') ? ICONS.chevronRight : ICONS.chevronDown;
}

function toggleBlobParamsPanel() {
  const panel = document.getElementById('blob-params-panel');
  const icon = document.getElementById('blob-params-toggle-icon');
  panel.classList.toggle('hidden');
  icon.innerHTML = panel.classList.contains('hidden') ? ICONS.chevronRight : ICONS.chevronDown;
}

function syncMatteBlobControls() {
  const enabled = document.getElementById('show-matte-blob').checked;
  const controls = document.querySelectorAll('#matte-blob-panel input[type="range"], #matte-blob-panel input[type="checkbox"]:not(#show-matte-blob)');
  controls.forEach(control => {
    control.disabled = !enabled;
    control.closest('.control-slider')?.classList.toggle('opacity-40', !enabled);
    control.closest('.toggle-label')?.classList.toggle('opacity-40', !enabled);
  });
}

function setBlobColor(color) {
  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector(`.color-btn[data-color="${color}"]`)?.classList.add('active');
  blobTracker.updateConfig({ blobColor: color });
}

function setLineColor(color) {
  document.querySelectorAll('.line-color-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelector(`.line-color-btn[data-line-color="${color}"]`)?.classList.add('active');
  blobTracker.updateConfig({ lineColor: color });
}

function toggleRecording() {
  if (blobTracker.processingRef.mediaRecorder?.state === 'recording') {
    blobTracker.stopRecording();
    document.getElementById('record-icon').innerHTML = ICONS.camera;
  } else {
    blobTracker.startRecording();
    document.getElementById('record-icon').innerHTML = ICONS.stop;
  }
}

function setPlayButtonState(isPlaying) {
  document.getElementById('play-icon').innerHTML = isPlaying ? ICONS.pause : ICONS.play;
  document.getElementById('play-text').textContent = isPlaying ? 'Pause' : 'Start Tracking';
}

function initializeIcons() {
  setPlayButtonState(false);
  document.getElementById('video-editor-toggle-icon').innerHTML = ICONS.chevronRight;
  document.getElementById('more-tab-toggle-icon').innerHTML = ICONS.chevronRight;
  document.getElementById('blob-params-toggle-icon').innerHTML = ICONS.chevronRight;
  document.getElementById('record-icon').innerHTML = ICONS.camera;
  setBlobColor('#ef4444');
  setLineColor('#ef4444');
  syncMatteBlobControls();
  updateVideoFilters();
  updateConfig();
}

function handleGlobalKeydown(e) {
  if (e.code !== 'Space') return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  e.preventDefault();
  togglePlay();
}

function updateViewportInfo() {
  const video = document.getElementById('video');
  document.getElementById('viewport-info').textContent =
    `Viewport_01 // ${video.videoWidth || 0}x${video.videoHeight || 0}`;
}

// Update UI periodically
function updateUI() {
  // Update stats
  document.getElementById('fps-display').textContent = `FPS: ${blobTracker.stats.fps}`;
  document.getElementById('blob-count-display').textContent = `BLOBS: ${blobTracker.stats.blobCount}`;
  document.getElementById('active-blobs').textContent = `${blobTracker.blobs.length} ACTIVE`;

  // Enable test mode button when OpenCV is ready
  if (blobTracker.isCvLoaded) {
    document.getElementById('test-mode-btn').classList.remove('hidden');
  }

  // Update blob list
  const blobList = document.getElementById('blob-list');
  blobList.innerHTML = '';

  if (blobTracker.blobs.length === 0) {
    blobList.innerHTML = '<div class="h-full flex items-center justify-center opacity-20"><p class="text-[10px] mono uppercase tracking-widest text-white/40">No data stream</p></div>';
  } else {
    blobTracker.blobs.forEach(blob => {
      const blobItem = document.createElement('div');
      blobItem.className = 'blob-item';
      blobItem.innerHTML = `
        <div class="flex items-center justify-between mb-2">
          <span class="blob-id">ID_${blob.id.toString().padStart(3, '0')}</span>
          <div class="blob-color" style="background-color: ${blob.color}"></div>
        </div>
        <div class="blob-data">
          <span>POS_X:</span> <span>${Math.round(blob.x)}</span>
          <span>POS_Y:</span> <span>${Math.round(blob.y)}</span>
          <span>AREA:</span> <span>${Math.round(blob.area)}</span>
        </div>
      `;
      blobList.appendChild(blobItem);
    });
  }

  // Update goo effect
  blobTracker.renderGoo();

  requestAnimationFrame(updateUI);
}
