import { BlobTracker } from './blobtracker.js';

// Global variables
let blobTracker;
let videoSrc = null;
let isMuted = false;

const ICONS = {
  play: '<svg class="ui-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.5l7 4.5-7 4.5z"></path></svg>',
  pause: '<svg class="ui-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.5v9M11 3.5v9"></path></svg>',
  gear: '<svg class="ui-icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="2.5"></circle><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M12.8 3.2l-1.4 1.4M4.6 11.4l-1.4 1.4"></path></svg>',
  chevronRight: '<svg class="ui-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5L10.5 8 6 12.5"></path></svg>',
  speaker: '<svg class="ui-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 6h3l3-2.5v9L5.5 10h-3z"></path><path d="M10.5 6a2.5 2.5 0 010 4"></path><path d="M12 4.5a4.5 4.5 0 010 7"></path></svg>',
  muted: '<svg class="ui-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 6h3l3-2.5v9L5.5 10h-3z"></path><path d="M10.5 6l3 4M13.5 6l-3 4"></path></svg>',
  camera: '<svg class="ui-icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="4" width="8" height="8" rx="1.5"></rect><path d="M10.5 7l3-1.5v5l-3-1.5z"></path></svg>',
  stop: '<svg class="ui-icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="4.5" y="4.5" width="7" height="7"></rect></svg>'
};

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

  // HUD controls
  document.getElementById('toggle-hud').addEventListener('click', toggleHUD);
  document.getElementById('close-editor').addEventListener('click', () => {
    document.getElementById('editor-panel').classList.add('hidden');
  });

  // Video editor
  document.getElementById('brightness-slider').addEventListener('input', updateFilters);
  document.getElementById('contrast-slider').addEventListener('input', updateFilters);
  document.getElementById('saturation-slider').addEventListener('input', updateFilters);
  document.getElementById('sharpness-slider').addEventListener('input', updateFilters);
  document.getElementById('reset-filters').addEventListener('click', resetFilters);

  // Detection controls
  document.getElementById('threshold-slider').addEventListener('input', updateConfig);
  document.getElementById('blur-slider').addEventListener('input', updateConfig);
  document.getElementById('threshold-mode').addEventListener('click', () => setMode('threshold'));
  document.getElementById('difference-mode').addEventListener('click', () => setMode('differencing'));

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

  // Color science
  document.getElementById('color-science-toggle').addEventListener('click', toggleColorScience);
  document.getElementById('trail-hue-slider').addEventListener('input', updateConfig);
  document.getElementById('line-thickness-slider').addEventListener('input', updateConfig);

  // Color buttons
  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const color = e.target.dataset.color;
      setBlobColor(color);
    });
  });

  // Audio controls
  document.getElementById('mute-btn').addEventListener('click', toggleMute);

  // Export and record
  document.getElementById('export-btn').addEventListener('click', () => blobTracker.exportData());
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
  videoSrc = url;
  const video = document.getElementById('video');
  video.src = url;
  document.getElementById('upload-zone').classList.add('hidden');
  document.getElementById('video-container').classList.remove('hidden');
  document.getElementById('start-overlay').classList.remove('hidden');
  blobTracker.processingRef.nextId = 1;
  blobTracker.processingRef.activeBlobs = [];
  blobTracker.processingRef.frameCount = 0;
  blobTracker.processingRef.exportData = [];
  updateViewportInfo();
}

function startTracking() {
  blobTracker.startTracking();
  document.getElementById('start-overlay').classList.add('hidden');
  setPlayButtonState(true);
}

function togglePlay() {
  if (!videoSrc) return;

  if (blobTracker.isPlaying) {
    blobTracker.stopTracking();
    document.getElementById('video').pause();
    setPlayButtonState(false);
  } else {
    blobTracker.startTracking();
    setPlayButtonState(true);
  }
}

function toggleHUD() {
  const hudPanel = document.getElementById('hud-panel');
  const isCollapsed = hudPanel.classList.contains('collapsed');
  if (isCollapsed) {
    hudPanel.classList.remove('collapsed');
    document.getElementById('hud-toggle-icon').innerHTML = ICONS.gear;
  } else {
    hudPanel.classList.add('collapsed');
    document.getElementById('hud-toggle-icon').innerHTML = ICONS.chevronRight;
  }
}

function updateFilters() {
  const filters = {
    brightness: parseInt(document.getElementById('brightness-slider').value),
    contrast: parseInt(document.getElementById('contrast-slider').value) / 100,
    saturation: parseInt(document.getElementById('saturation-slider').value) / 100,
    sharpness: parseInt(document.getElementById('sharpness-slider').value) / 10
  };
  blobTracker.updateFilters(filters);
}

function resetFilters() {
  document.getElementById('brightness-slider').value = 0;
  document.getElementById('contrast-slider').value = 100;
  document.getElementById('saturation-slider').value = 100;
  document.getElementById('sharpness-slider').value = 0;
  updateFilters();
}

function updateConfig() {
  const config = {
    threshold: parseInt(document.getElementById('threshold-slider').value),
    blur: parseInt(document.getElementById('blur-slider').value),
    minSize: parseInt(document.getElementById('min-size-slider').value),
    maxSize: parseInt(document.getElementById('max-size-slider').value),
    sensitivity: parseInt(document.getElementById('sensitivity-slider').value),
    showBoxes: document.getElementById('show-boxes').checked,
    showCenters: document.getElementById('show-centers').checked,
    showTrails: document.getElementById('show-trails').checked,
    showMesh: document.getElementById('show-mesh').checked,
    showCoords: document.getElementById('show-coords').checked,
    trailHue: parseInt(document.getElementById('trail-hue-slider').value),
    lineThickness: parseInt(document.getElementById('line-thickness-slider').value)
  };
  blobTracker.updateConfig(config);
}

function setMode(mode) {
  blobTracker.updateConfig({ mode });
  document.getElementById('threshold-mode').classList.toggle('bg-white', mode === 'threshold');
  document.getElementById('threshold-mode').classList.toggle('text-black', mode === 'threshold');
  document.getElementById('difference-mode').classList.toggle('bg-white', mode === 'differencing');
  document.getElementById('difference-mode').classList.toggle('text-black', mode === 'differencing');
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

function setBlobColor(color) {
  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector(`.color-btn[data-color="${color}"]`)?.classList.add('active');
  blobTracker.updateConfig({ blobColor: color });
}

function toggleMute() {
  const video = document.getElementById('video');
  isMuted = !isMuted;
  video.muted = isMuted;
  document.getElementById('mute-icon').innerHTML = isMuted ? ICONS.muted : ICONS.speaker;
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
  document.getElementById('hud-toggle-icon').innerHTML = ICONS.gear;
  document.getElementById('mute-icon').innerHTML = ICONS.speaker;
  document.getElementById('record-icon').innerHTML = ICONS.camera;
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
