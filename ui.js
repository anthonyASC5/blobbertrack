import { BlobTracker } from './blobtracker.js';
import { initVHSUI } from './VHS.js';

// Global variables
let blobTracker;
let videoSrc = null;
let debugLines = [];
const MOBILE_BREAKPOINT_QUERY = '(max-width: 900px)';
const ICONS = {
  play: '<svg class="ui-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.5l7 4.5-7 4.5z"></path></svg>',
  pause: '<svg class="ui-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.5v9M11 3.5v9"></path></svg>',
  reverse: '<svg class="ui-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 3.5L6 8l4.5 4.5M6 3.5L1.5 8 6 12.5"></path></svg>',
  forward: '<svg class="ui-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 3.5L10 8l-4.5 4.5M10 3.5L14.5 8 10 12.5"></path></svg>',
  restart: '<svg class="ui-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 7a4.5 4.5 0 1 1 1.2 3.1M3.5 7V3.5M3.5 3.5H7"></path></svg>',
  chevronRight: '<svg class="ui-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5L10.5 8 6 12.5"></path></svg>',
  camera: '<svg class="ui-icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="4" width="8" height="8" rx="1.5"></rect><path d="M10.5 7l3-1.5v5l-3-1.5z"></path></svg>',
  chevronDown: '<svg class="ui-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 6L8 10.5 12.5 6"></path></svg>',
  stop: '<svg class="ui-icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="4.5" y="4.5" width="7" height="7"></rect></svg>'
};
const MORE_FILTER_IDS = [
  'edge-detect-slider',
  'scanline-thickness-slider',
  'gamma-slider',
  'slit-scan-speed-slider',
  'heat-amplitude-slider',
  'heat-speed-slider',
  'echo-frames-slider',
  'echo-decay-slider',
  'pixel-sort-threshold-slider',
  'scan-collapse-strength-slider',
  'shuffle-amount-slider',
  'crt-scanlines-slider',
  'crt-glow-slider',
  'edge-glow-slider',
  'edge-threshold-slider',
  'noise-displace-slider',
  'noise-speed-slider',
  'rgb-shift-r-slider',
  'rgb-shift-g-slider',
  'rgb-shift-b-slider',
  'scanline-intensity-slider'
];

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  blobTracker = new BlobTracker();
  blobTracker.init('video', 'canvas', 'overlay', 'goo-canvas');
  mountVHSPanel();
  logDebug('Blob Tracker initialized.');

  initializeIcons();
  setupEventListeners();
  syncResponsiveLayout();
  updateUI();
});

function mountVHSPanel() {
  const slot = document.getElementById('vhs-slot');
  const machine = document.querySelector('#video-editor-content .dither-machine.more-tab');
  if (!slot || !machine) return;
  machine.classList.add('vhs-left-machine');
  slot.appendChild(machine);
  initVHSUI();
}

// Setup all event listeners
function setupEventListeners() {
  // Video upload
  document.getElementById('video-upload').addEventListener('change', handleFileUpload);
  document.getElementById('reset-all-btn').addEventListener('click', resetAllSettings);
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
  document.getElementById('nav-play-btn').addEventListener('click', togglePlay);
  document.getElementById('nav-stop-btn').addEventListener('click', stopPlayback);
  document.getElementById('nav-reverse-btn').addEventListener('click', reverseStepPlayback);
  document.getElementById('nav-forward-btn').addEventListener('click', fastForwardPlayback);
  document.getElementById('nav-restart-btn').addEventListener('click', restartPlayback);

  // Module controls
  document.getElementById('video-editor-toggle').addEventListener('click', toggleVideoEditor);
  document.getElementById('fx-presets-toggle').addEventListener('click', toggleFxPresetsPanel);
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
  document.getElementById('show-coords').addEventListener('change', updateConfig);
  document.getElementById('show-matte-blob').addEventListener('change', () => {
    syncMatteBlobControls();
    updateConfig();
  });
  document.getElementById('matte-video-opacity-slider').addEventListener('input', updateConfig);
  document.getElementById('matte-generation-slider').addEventListener('input', updateConfig);
  document.getElementById('matte-density-slider').addEventListener('input', updateConfig);
  document.getElementById('matte-radius-slider').addEventListener('input', updateConfig);
  document.getElementById('matte-size-slider').addEventListener('input', updateConfig);
  document.getElementById('matte-vertical-slider').addEventListener('input', updateConfig);
  document.getElementById('matte-persistence-slider').addEventListener('input', updateConfig);

  // More tab
  document.getElementById('more-tab-toggle').addEventListener('click', toggleMoreTab);

  // Color science
  document.getElementById('color-science-toggle').addEventListener('click', toggleColorScience);
  document.getElementById('trail-hue-slider').addEventListener('input', updateConfig);
  document.getElementById('line-thickness-slider').addEventListener('input', updateConfig);
  document.getElementById('fx-negative').addEventListener('change', updateConfig);
  document.getElementById('fx-blur').addEventListener('change', updateConfig);
  document.getElementById('fx-magnifier-link').addEventListener('change', updateConfig);

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
  document.getElementById('mobile-hud-drawer-toggle').addEventListener('click', toggleHUDMobile);
  window.addEventListener('resize', syncResponsiveLayout);

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
  videoSrc = url;
  const video = document.getElementById('video');
  video.src = url;
  video.muted = false;
  document.getElementById('upload-zone').classList.add('hidden');
  document.getElementById('video-container').classList.remove('hidden');
  document.getElementById('start-overlay').classList.remove('hidden');
  updateStartCode();
  blobTracker.processingRef.nextId = 1;
  blobTracker.processingRef.activeBlobs = [];
  blobTracker.processingRef.frameCount = 0;
  blobTracker.clearHiddenBlobs();
  setRecordButtonState(false);
  updateViewportInfo();
  logDebug('Video loaded.');
}

function startTracking() {
  blobTracker.startTracking();
  document.getElementById('start-overlay').classList.add('hidden');
  setPlayButtonState(true);
}

function togglePlay() {
  if (!videoSrc) return;

  if (blobTracker.isPlaying) {
    stopPlayback();
  } else {
    blobTracker.startTracking();
    setPlayButtonState(true);
  }
}

function stopPlayback() {
  if (!videoSrc) return;
  blobTracker.stopTracking();
  document.getElementById('video').pause();
  setPlayButtonState(false);
}

function reverseStepPlayback() {
  if (!videoSrc) return;
  const video = document.getElementById('video');
  stopPlayback();
  video.currentTime = Math.max(0, video.currentTime - (1 / 3));
  blobTracker.renderStillFrame();
}

function fastForwardPlayback() {
  if (!videoSrc) return;
  const video = document.getElementById('video');
  stopPlayback();
  const endTime = Number.isFinite(video.duration) ? video.duration : video.currentTime + (1 / 3);
  video.currentTime = Math.min(endTime, video.currentTime + (1 / 3));
  blobTracker.renderStillFrame();
}

function restartPlayback() {
  if (!videoSrc) return;
  const video = document.getElementById('video');
  stopPlayback();
  video.currentTime = 0;
  blobTracker.renderStillFrame();
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

function toggleFxPresetsPanel() {
  const panel = document.getElementById('left-fx-panel');
  const icon = document.getElementById('fx-presets-toggle-icon');
  const isCollapsed = panel.classList.toggle('collapsed');
  icon.innerHTML = isCollapsed ? ICONS.chevronRight : ICONS.chevronDown;
}

function toggleInspector() {
  const panel = document.querySelector('.inspector-panel');
  panel.classList.toggle('inspector-visible');
}

function toggleHUDMobile() {
  if (!window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches) return;
  const shell = document.getElementById('app-shell');
  const isOpen = shell.classList.toggle('mobile-hud-open');
  setHUDToggleState(isOpen);
}

function setHUDToggleState(isOpen) {
  const mobileToggle = document.getElementById('mobile-hud-toggle');
  const drawerToggle = document.getElementById('mobile-hud-drawer-toggle');
  mobileToggle?.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  drawerToggle?.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

function syncResponsiveLayout() {
  const shell = document.getElementById('app-shell');
  const isMobile = window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches;
  if (!isMobile) {
    shell.classList.remove('mobile-hud-open');
  }
  setHUDToggleState(isMobile && shell.classList.contains('mobile-hud-open'));
}

function updateVideoFilters() {
  const gammaRaw = parseInt(document.getElementById('gamma-slider').value);
  const filters = {
    sharpness: parseInt(document.getElementById('sharpen-slider').value) / 100,
    brightness: parseInt(document.getElementById('brightness-slider').value),
    contrast: parseInt(document.getElementById('contrast-slider').value) / 100,
    saturation: parseInt(document.getElementById('saturation-slider').value) / 100,
    edgeDetect: parseInt(document.getElementById('edge-detect-slider').value) / 100,
    scanlineThickness: parseInt(document.getElementById('scanline-thickness-slider').value),
    gamma: gammaRaw === 0 ? 1 : (gammaRaw / 100),
    slitScanSpeed: parseInt(document.getElementById('slit-scan-speed-slider').value),
    heatAmplitude: parseInt(document.getElementById('heat-amplitude-slider').value),
    heatSpeed: parseInt(document.getElementById('heat-speed-slider').value) / 100,
    echoFrames: parseInt(document.getElementById('echo-frames-slider').value),
    echoDecay: parseInt(document.getElementById('echo-decay-slider').value) / 100,
    pixelSortThreshold: parseInt(document.getElementById('pixel-sort-threshold-slider').value),
    scanCollapseStrength: parseInt(document.getElementById('scan-collapse-strength-slider').value),
    shuffleAmount: parseInt(document.getElementById('shuffle-amount-slider').value) / 100,
    crtScanlines: parseInt(document.getElementById('crt-scanlines-slider').value) / 100,
    crtGlow: parseInt(document.getElementById('crt-glow-slider').value) / 100,
    edgeGlow: parseInt(document.getElementById('edge-glow-slider').value) / 100,
    edgeThreshold: parseInt(document.getElementById('edge-threshold-slider').value),
    noiseDisplace: parseInt(document.getElementById('noise-displace-slider').value),
    noiseSpeed: parseInt(document.getElementById('noise-speed-slider').value) / 100,
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
  document.getElementById('slit-scan-speed-slider').value = 0;
  document.getElementById('heat-amplitude-slider').value = 0;
  document.getElementById('heat-speed-slider').value = 200;
  document.getElementById('echo-frames-slider').value = 1;
  document.getElementById('echo-decay-slider').value = 70;
  document.getElementById('pixel-sort-threshold-slider').value = 0;
  document.getElementById('scan-collapse-strength-slider').value = 0;
  document.getElementById('shuffle-amount-slider').value = 0;
  document.getElementById('crt-scanlines-slider').value = 0;
  document.getElementById('crt-glow-slider').value = 0;
  document.getElementById('edge-glow-slider').value = 0;
  document.getElementById('edge-threshold-slider').value = 50;
  document.getElementById('noise-displace-slider').value = 0;
  document.getElementById('noise-speed-slider').value = 100;
  document.getElementById('rgb-shift-r-slider').value = 0;
  document.getElementById('rgb-shift-g-slider').value = 0;
  document.getElementById('rgb-shift-b-slider').value = 0;
  document.getElementById('scanline-intensity-slider').value = 30;
  updateVideoFilters();
}

function resetAllSettings() {
  blobTracker.clearHiddenBlobs();
  resetVideoFilters();
  document.getElementById('blur-slider').value = 3;
  document.getElementById('min-size-slider').value = 4;
  document.getElementById('max-size-slider').value = 7000;
  document.getElementById('sensitivity-slider').value = 360;
  document.getElementById('show-boxes').checked = true;
  document.getElementById('show-centers').checked = true;
  document.getElementById('show-trails').checked = true;
  document.getElementById('show-coords').checked = true;
  document.getElementById('show-matte-blob').checked = false;
  document.getElementById('matte-video-opacity-slider').value = 35;
  document.getElementById('matte-generation-slider').value = 3;
  document.getElementById('matte-density-slider').value = 7;
  document.getElementById('matte-radius-slider').value = 92;
  document.getElementById('matte-size-slider').value = 105;
  document.getElementById('matte-vertical-slider').value = 80;
  document.getElementById('matte-persistence-slider').value = 14;
  document.getElementById('trail-hue-slider').value = 0;
  document.getElementById('line-thickness-slider').value = 1;
  document.getElementById('fx-negative').checked = false;
  document.getElementById('fx-blur').checked = false;
  document.getElementById('fx-magnifier-link').checked = false;
  setBlobColor('#ffffff');
  setLineColor('#ffffff');
  setPanelExpanded('video-editor-panel', false, 'video-editor-toggle-icon');
  setPanelExpanded('left-fx-panel', false, 'fx-presets-toggle-icon');
  setSimpleTogglePanel('more-tab-content', false, 'more-tab-toggle-icon');
  setSimpleTogglePanel('blob-params-panel', true, 'blob-params-toggle-icon');
  setIndicatorPanelState('color-science-panel', 'color-science-indicator', false);
  setIndicatorPanelState('matte-blob-panel', 'matte-blob-indicator', false);
  document.querySelector('.inspector-panel')?.classList.remove('vhs-focus');
  document.getElementById('app-shell').classList.remove('mobile-hud-open');
  setHUDToggleState(false);
  syncMatteBlobControls();
  updateConfig();
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
    showCoords: document.getElementById('show-coords').checked,
    fxNegative: document.getElementById('fx-negative').checked,
    fxBlur: document.getElementById('fx-blur').checked,
    fxMagnifierLink: document.getElementById('fx-magnifier-link').checked,
    showMatteBlob: document.getElementById('show-matte-blob').checked,
    matteVideoOpacity: parseInt(document.getElementById('matte-video-opacity-slider').value) / 100,
    matteGenerationSlowdown: parseInt(document.getElementById('matte-generation-slider').value),
    matteDensity: parseInt(document.getElementById('matte-density-slider').value),
    matteRadius: parseInt(document.getElementById('matte-radius-slider').value),
    matteTileScale: parseInt(document.getElementById('matte-size-slider').value) / 100,
    matteVerticalSpread: parseInt(document.getElementById('matte-vertical-slider').value) / 100,
    mattePersistence: parseInt(document.getElementById('matte-persistence-slider').value),
    trailHue: parseInt(document.getElementById('trail-hue-slider').value),
    lineThickness: parseInt(document.getElementById('line-thickness-slider').value),
    lineColor: blobTracker.config.lineColor || '#ffffff'
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

function setPanelExpanded(panelId, expanded, iconId) {
  const panel = document.getElementById(panelId);
  const icon = document.getElementById(iconId);
  if (!panel) return;
  panel.classList.toggle('collapsed', !expanded);
  if (icon) {
    icon.innerHTML = expanded ? ICONS.chevronDown : ICONS.chevronRight;
  }
}

function setSimpleTogglePanel(panelId, expanded, iconId) {
  const panel = document.getElementById(panelId);
  const icon = document.getElementById(iconId);
  if (!panel) return;
  panel.classList.toggle('hidden', !expanded);
  if (icon) {
    icon.innerHTML = expanded ? ICONS.chevronDown : ICONS.chevronRight;
  }
}

function setIndicatorPanelState(panelId, indicatorId, expanded) {
  const panel = document.getElementById(panelId);
  const indicator = document.getElementById(indicatorId);
  if (!panel || !indicator) return;
  panel.classList.toggle('hidden', !expanded);
  indicator.classList.toggle('scale-75', !expanded);
  indicator.classList.toggle('scale-125', expanded);
  indicator.classList.toggle('bg-pink-900', !expanded);
  indicator.classList.toggle('bg-pink-500', expanded);
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
  const inspector = document.querySelector('.inspector-panel');
  const panel = document.getElementById('more-tab-content');
  const icon = document.getElementById('more-tab-toggle-icon');
  panel.classList.toggle('hidden');
  const isOpen = !panel.classList.contains('hidden');
  inspector?.classList.toggle('vhs-focus', isOpen);
  icon.innerHTML = isOpen ? ICONS.chevronDown : ICONS.chevronRight;
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
  if (!videoSrc) return;
  if (blobTracker.processingRef.mediaRecorder?.state === 'recording') {
    blobTracker.stopRecording();
    setRecordButtonState(false);
  } else {
    if (!blobTracker.isPlaying) {
      blobTracker.startTracking();
      setPlayButtonState(true);
    }
    blobTracker.startRecording();
    setRecordButtonState(true);
  }
}

function setPlayButtonState(isPlaying) {
  document.getElementById('play-icon').innerHTML = isPlaying ? ICONS.pause : ICONS.play;
  document.getElementById('play-text').textContent = isPlaying ? 'Pause' : 'Start Tracking';
  document.getElementById('nav-play-icon').innerHTML = isPlaying ? ICONS.pause : ICONS.play;
}

function initializeIcons() {
  setPlayButtonState(false);
  document.getElementById('nav-reverse-icon').innerHTML = ICONS.reverse;
  document.getElementById('nav-stop-icon').innerHTML = ICONS.stop;
  document.getElementById('nav-play-icon').innerHTML = ICONS.play;
  document.getElementById('nav-forward-icon').innerHTML = ICONS.forward;
  document.getElementById('nav-restart-icon').innerHTML = ICONS.restart;
  document.getElementById('video-editor-toggle-icon').innerHTML = ICONS.chevronRight;
  document.getElementById('fx-presets-toggle-icon').innerHTML = ICONS.chevronRight;
  document.getElementById('blob-params-toggle-icon').innerHTML = ICONS.chevronDown;
  document.getElementById('more-tab-toggle-icon').innerHTML = ICONS.chevronRight;
  setRecordButtonState(false);
  setPanelExpanded('left-fx-panel', false, 'fx-presets-toggle-icon');
  setBlobColor('#ffffff');
  setLineColor('#ffffff');
  syncMatteBlobControls();
  updateVideoFilters();
  updateConfig();
}

function setRecordButtonState(isRecording) {
  document.getElementById('record-icon').innerHTML = isRecording ? ICONS.stop : ICONS.camera;
  document.getElementById('record-text').textContent = isRecording ? 'Stop To Download' : 'Play To Render';
}

function updateStartCode() {
  const startCode = document.getElementById('start-code');
  if (!startCode) return;
  const randomValue = Math.floor(100000 + Math.random() * (90000000 - 100000));
  startCode.textContent = randomValue.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function logDebug(message) {
  const consoleEl = document.getElementById('debug-console');
  if (!consoleEl) return;
  const stamp = new Date().toISOString().slice(11, 19);
  debugLines.push(`[${stamp}] ${message}`);
  if (debugLines.length > 40) {
    debugLines = debugLines.slice(debugLines.length - 40);
  }
  consoleEl.innerHTML = debugLines.map(line => `<div>${line}</div>`).join('');
  consoleEl.scrollTop = consoleEl.scrollHeight;
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
    blobTracker.blobs.slice(0, 4).forEach(blob => {
      const blobItem = document.createElement('div');
      blobItem.className = 'blob-item';
      blobItem.innerHTML = `
        <div class="flex items-center justify-between mb-2">
          <span class="blob-id">ID_${blob.id.toString().padStart(3, '0')}</span>
          <div class="blob-color" style="background-color: ${blob.color}"></div>
        </div>
        <div class="blob-data">
          <div class="blob-data-row"><span class="blob-label">POS_X:</span><span class="blob-value">${Math.round(blob.x)}</span></div>
          <div class="blob-data-row"><span class="blob-label">POS_Y:</span><span class="blob-value">${Math.round(blob.y)}</span></div>
          <div class="blob-data-row"><span class="blob-label">AREA:</span><span class="blob-value">${Math.round(blob.area)}</span></div>
        </div>
      `;
      blobList.appendChild(blobItem);
    });
  }

  // Update goo effect
  blobTracker.renderGoo();

  requestAnimationFrame(updateUI);
}
