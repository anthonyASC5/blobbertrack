import { BlobTracker } from './blobtracker.js';
import { initVHSUI } from './VHS.js';

// Global variables
let blobTracker;
let videoSrc = null;
let isExporting = false;
let debugLines = [];
const MOBILE_BREAKPOINT_QUERY = '(max-width: 900px)';
const NIGHT_VISION_PRESET = {
  video: {
    sharpen: 100,
    brightness: 6,
    contrast: 150,
    saturation: 0,
    edgeDetect: 18,
    scanlineThickness: 1,
    gamma: 110,
    slitScanWidth: 3,
    slitScanSpeed: 2,
    datamoshIntensity: 12,
    datamoshPersistence: 86,
    warpStrength: 4,
    warpScale: 16,
    warpSpeed: 40,
    heatAmplitude: 0,
    heatFrequency: 30,
    heatSpeed: 200,
    echoFrames: 4,
    echoDecay: 76,
    pixelSortThreshold: 48,
    scanCollapseStrength: 11,
    blockSize: 14,
    shuffleAmount: 8,
    crtWarp: 6,
    crtScanlines: 18,
    crtGlow: 9,
    temporalNoise: 14,
    frameMix: 26,
    motionSmear: 10,
    feedbackScale: 95,
    feedbackOpacity: 18,
    edgeGlow: 20,
    edgeThreshold: 92,
    noiseDisplace: 4,
    noiseSpeed: 135,
    rgbShiftR: 0,
    rgbShiftG: 0,
    rgbShiftB: 0,
    scanlineIntensity: 24
  },
  tracking: {
    blur: 3,
    minSize: 4,
    maxSize: 7000,
    sensitivity: 360,
    showBoxes: true,
    showCenters: true,
    showTrails: true,
    showCoords: true,
    showMatteBlob: false,
    lineThickness: 1,
    blobColor: '#00ff00',
    lineColor: '#00ff00',
    fxNegative: false,
    fxBlur: false
  }
};
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
  'slit-scan-width-slider',
  'slit-scan-speed-slider',
  'datamosh-intensity-slider',
  'datamosh-persistence-slider',
  'warp-strength-slider',
  'warp-scale-slider',
  'warp-speed-slider',
  'heat-amplitude-slider',
  'heat-frequency-slider',
  'heat-speed-slider',
  'echo-frames-slider',
  'echo-decay-slider',
  'pixel-sort-threshold-slider',
  'scan-collapse-strength-slider',
  'block-size-slider',
  'shuffle-amount-slider',
  'crt-warp-slider',
  'crt-scanlines-slider',
  'crt-glow-slider',
  'temporal-noise-slider',
  'frame-mix-slider',
  'motion-smear-slider',
  'feedback-scale-slider',
  'feedback-opacity-slider',
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
  document.getElementById('export-webm-btn').addEventListener('click', handleExportWebM);
  document.getElementById('reset-all-btn').addEventListener('click', resetAllSettings);
  document.getElementById('night-vision-preset-btn').addEventListener('click', applyNightVisionPreset);
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
  document.getElementById('matte-adaptive').addEventListener('change', updateConfig);
  document.getElementById('matte-video-opacity-slider').addEventListener('input', updateConfig);
  document.getElementById('matte-generation-slider').addEventListener('input', updateConfig);
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
  updateViewportInfo();
  logDebug('Video loaded and export state reset.');
}

async function handleExportWebM() {
  if (!videoSrc || isExporting) return;
  logDebug('Export requested.');
  runExportDiagnostics();
  isExporting = true;
  const exportBtn = document.getElementById('export-webm-btn');
  const progressShell = document.getElementById('export-progress-shell');
  const progressBar = document.getElementById('export-progress-bar');
  const previewTab = window.open('', '_blank');
  if (previewTab) {
    previewTab.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Blob Tracker Export</title><style>body{margin:0;display:grid;place-items:center;min-height:100vh;background:#020617;color:#94a3b8;font:12px monospace}</style></head><body><div>Rendering export...</div></body></html>');
    previewTab.document.close();
  }
  exportBtn.disabled = true;
  exportBtn.textContent = 'Exporting...';
  progressShell.classList.remove('hidden');
  progressBar.style.width = '0%';

  try {
    logDebug('Recorder initialized. Rendering frames...');
    const blob = await blobTracker.exportWebM({
      totalFrames: 48,
      width: 1920,
      height: 1080,
      fps: 60,
      videoBitsPerSecond: 12000000,
      onProgress: ({ renderedFrames, totalFrames }) => {
        const ratio = totalFrames > 0 ? (renderedFrames / totalFrames) : 0;
        progressBar.style.width = `${Math.max(0, Math.min(100, ratio * 100))}%`;
      }
    });
    logDebug(`Export complete (${Math.round(blob.size / 1024)} KB). Preparing preview.`);

    const blobUrl = URL.createObjectURL(blob);
    if (previewTab) {
      previewTab.document.write(`<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Blob Tracker - Export Preview</title><style>body{margin:0;background:#020617;color:#e2e8f0;font-family:monospace;display:grid;place-items:center;min-height:100vh}.shell{width:min(94vw,1200px);display:grid;gap:14px}video{width:100%;max-height:78vh;background:#000;border:1px solid rgba(148,163,184,.35)}.row{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}button,a{border:1px solid rgba(148,163,184,.4);background:#0f172a;color:#e2e8f0;padding:8px 12px;text-decoration:none;cursor:pointer;font-size:12px;text-transform:uppercase;letter-spacing:.1em}</style></head><body><div class="shell"><video id="v" controls playsinline src="${blobUrl}"></video><div class="row"><button id="dl" type="button">Download</button><a href="${location.origin + location.pathname}">Back To Editor</a></div></div><script>const url='${blobUrl}';document.getElementById('dl').addEventListener('click',()=>{const a=document.createElement('a');a.href=url;a.download='blobber-track-render.webm';a.click();});<\/script></body></html>`);
      previewTab.document.close();
      logDebug('Preview tab loaded.');
    } else {
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = 'blobber-track-render.webm';
      link.click();
      logDebug('Preview popup blocked. Fallback download triggered.');
    }

    progressBar.style.width = '100%';
    window.setTimeout(() => {
      progressShell.classList.add('hidden');
      progressBar.style.width = '0%';
    }, 900);
  } catch (err) {
    console.error(err);
    logDebug(`Export failed: ${err?.message || 'unknown error'}`);
    logDebug(`Export stack: ${err?.stack?.split('\n')[0] || 'no stack'}`);
    progressShell.classList.add('hidden');
    progressBar.style.width = '0%';
    if (previewTab && !previewTab.closed) {
      previewTab.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Export Error</title><style>body{margin:0;display:grid;place-items:center;min-height:100vh;background:#020617;color:#fda4af;font:12px monospace;padding:20px;text-align:center}</style></head><body><div>Export failed. Check debug console in editor.</div></body></html>');
      previewTab.document.close();
    }
  } finally {
    exportBtn.disabled = false;
    exportBtn.textContent = 'Export WebM';
    isExporting = false;
  }
}

function runExportDiagnostics() {
  const video = document.getElementById('video');
  const canvas = document.getElementById('canvas');
  const overlay = document.getElementById('overlay');
  const diagnostics = [
    ['videoLoaded', Boolean(video?.src)],
    ['videoReadyState', (video?.readyState || 0) >= 2],
    ['canvasReady', Boolean(canvas?.getContext('2d'))],
    ['overlayReady', Boolean(overlay?.getContext('2d'))],
    ['mediaRecorder', typeof window.MediaRecorder !== 'undefined'],
    ['captureStream', typeof canvas?.captureStream === 'function'],
    ['opencvReady', blobTracker?.isCvLoaded === true]
  ];
  diagnostics.forEach(([name, pass]) => {
    logDebug(`Export test ${pass ? 'PASS' : 'FAIL'}: ${name}`);
  });
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
    slitScanWidth: parseInt(document.getElementById('slit-scan-width-slider').value),
    slitScanSpeed: parseInt(document.getElementById('slit-scan-speed-slider').value),
    moshIntensity: parseInt(document.getElementById('datamosh-intensity-slider').value) / 100,
    moshPersistence: parseInt(document.getElementById('datamosh-persistence-slider').value) / 100,
    warpStrength: parseInt(document.getElementById('warp-strength-slider').value),
    warpScale: parseInt(document.getElementById('warp-scale-slider').value) / 1000,
    warpSpeed: parseInt(document.getElementById('warp-speed-slider').value) / 100,
    heatAmplitude: parseInt(document.getElementById('heat-amplitude-slider').value),
    heatFrequency: parseInt(document.getElementById('heat-frequency-slider').value) / 1000,
    heatSpeed: parseInt(document.getElementById('heat-speed-slider').value) / 100,
    echoFrames: parseInt(document.getElementById('echo-frames-slider').value),
    echoDecay: parseInt(document.getElementById('echo-decay-slider').value) / 100,
    pixelSortThreshold: parseInt(document.getElementById('pixel-sort-threshold-slider').value),
    scanCollapseStrength: parseInt(document.getElementById('scan-collapse-strength-slider').value),
    blockSize: parseInt(document.getElementById('block-size-slider').value),
    shuffleAmount: parseInt(document.getElementById('shuffle-amount-slider').value) / 100,
    crtWarp: parseInt(document.getElementById('crt-warp-slider').value) / 100,
    crtScanlines: parseInt(document.getElementById('crt-scanlines-slider').value) / 100,
    crtGlow: parseInt(document.getElementById('crt-glow-slider').value) / 100,
    temporalNoise: parseInt(document.getElementById('temporal-noise-slider').value) / 100,
    frameMix: parseInt(document.getElementById('frame-mix-slider').value) / 100,
    motionSmear: parseInt(document.getElementById('motion-smear-slider').value),
    feedbackScale: parseInt(document.getElementById('feedback-scale-slider').value) / 100,
    feedbackOpacity: parseInt(document.getElementById('feedback-opacity-slider').value) / 100,
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
  document.getElementById('slit-scan-width-slider').value = 2;
  document.getElementById('slit-scan-speed-slider').value = 0;
  document.getElementById('datamosh-intensity-slider').value = 0;
  document.getElementById('datamosh-persistence-slider').value = 80;
  document.getElementById('warp-strength-slider').value = 0;
  document.getElementById('warp-scale-slider').value = 10;
  document.getElementById('warp-speed-slider').value = 30;
  document.getElementById('heat-amplitude-slider').value = 0;
  document.getElementById('heat-frequency-slider').value = 30;
  document.getElementById('heat-speed-slider').value = 200;
  document.getElementById('echo-frames-slider').value = 1;
  document.getElementById('echo-decay-slider').value = 70;
  document.getElementById('pixel-sort-threshold-slider').value = 0;
  document.getElementById('scan-collapse-strength-slider').value = 0;
  document.getElementById('block-size-slider').value = 20;
  document.getElementById('shuffle-amount-slider').value = 0;
  document.getElementById('crt-warp-slider').value = 0;
  document.getElementById('crt-scanlines-slider').value = 0;
  document.getElementById('crt-glow-slider').value = 0;
  document.getElementById('temporal-noise-slider').value = 0;
  document.getElementById('frame-mix-slider').value = 0;
  document.getElementById('motion-smear-slider').value = 0;
  document.getElementById('feedback-scale-slider').value = 98;
  document.getElementById('feedback-opacity-slider').value = 0;
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
  document.getElementById('show-boxes').checked = false;
  document.getElementById('show-centers').checked = false;
  document.getElementById('show-trails').checked = false;
  document.getElementById('show-coords').checked = false;
  document.getElementById('show-matte-blob').checked = false;
  document.getElementById('matte-adaptive').checked = false;
  document.getElementById('matte-video-opacity-slider').value = 35;
  document.getElementById('matte-generation-slider').value = 3;
  document.getElementById('matte-density-slider').value = 7;
  document.getElementById('matte-radius-slider').value = 92;
  document.getElementById('matte-size-slider').value = 105;
  document.getElementById('matte-vertical-slider').value = 80;
  document.getElementById('matte-persistence-slider').value = 14;
  document.getElementById('matte-coverage-slider').value = 28;
  document.getElementById('trail-hue-slider').value = 0;
  document.getElementById('line-thickness-slider').value = 1;
  document.getElementById('fx-negative').checked = false;
  document.getElementById('fx-blur').checked = false;
  setBlobColor('#ffffff');
  setLineColor('#ffffff');
  setPanelExpanded('video-editor-panel', false, 'video-editor-toggle-icon');
  setPanelExpanded('left-fx-panel', false, 'fx-presets-toggle-icon');
  setSimpleTogglePanel('more-tab-content', false, 'more-tab-toggle-icon');
  setIndicatorPanelState('blob-params-panel', 'blob-params-indicator', false);
  setIndicatorPanelState('color-science-panel', 'color-science-indicator', false);
  setIndicatorPanelState('matte-blob-panel', 'matte-blob-indicator', false);
  document.querySelector('.inspector-panel')?.classList.remove('vhs-focus');
  document.getElementById('app-shell').classList.remove('mobile-hud-open');
  setHUDToggleState(false);
  syncMatteBlobControls();
  updateConfig();
}

function applyNightVisionPreset() {
  const video = NIGHT_VISION_PRESET.video;
  const tracking = NIGHT_VISION_PRESET.tracking;
  setInputValue('sharpen-slider', video.sharpen);
  setInputValue('brightness-slider', video.brightness);
  setInputValue('contrast-slider', video.contrast);
  setInputValue('saturation-slider', video.saturation);
  setInputValue('edge-detect-slider', video.edgeDetect);
  setInputValue('scanline-thickness-slider', video.scanlineThickness);
  setInputValue('gamma-slider', video.gamma);
  setInputValue('slit-scan-width-slider', video.slitScanWidth);
  setInputValue('slit-scan-speed-slider', video.slitScanSpeed);
  setInputValue('datamosh-intensity-slider', video.datamoshIntensity);
  setInputValue('datamosh-persistence-slider', video.datamoshPersistence);
  setInputValue('warp-strength-slider', video.warpStrength);
  setInputValue('warp-scale-slider', video.warpScale);
  setInputValue('warp-speed-slider', video.warpSpeed);
  setInputValue('heat-amplitude-slider', video.heatAmplitude);
  setInputValue('heat-frequency-slider', video.heatFrequency);
  setInputValue('heat-speed-slider', video.heatSpeed);
  setInputValue('echo-frames-slider', video.echoFrames);
  setInputValue('echo-decay-slider', video.echoDecay);
  setInputValue('pixel-sort-threshold-slider', video.pixelSortThreshold);
  setInputValue('scan-collapse-strength-slider', video.scanCollapseStrength);
  setInputValue('block-size-slider', video.blockSize);
  setInputValue('shuffle-amount-slider', video.shuffleAmount);
  setInputValue('crt-warp-slider', video.crtWarp);
  setInputValue('crt-scanlines-slider', video.crtScanlines);
  setInputValue('crt-glow-slider', video.crtGlow);
  setInputValue('temporal-noise-slider', video.temporalNoise);
  setInputValue('frame-mix-slider', video.frameMix);
  setInputValue('motion-smear-slider', video.motionSmear);
  setInputValue('feedback-scale-slider', video.feedbackScale);
  setInputValue('feedback-opacity-slider', video.feedbackOpacity);
  setInputValue('edge-glow-slider', video.edgeGlow);
  setInputValue('edge-threshold-slider', video.edgeThreshold);
  setInputValue('noise-displace-slider', video.noiseDisplace);
  setInputValue('noise-speed-slider', video.noiseSpeed);
  setInputValue('rgb-shift-r-slider', video.rgbShiftR);
  setInputValue('rgb-shift-g-slider', video.rgbShiftG);
  setInputValue('rgb-shift-b-slider', video.rgbShiftB);
  setInputValue('scanline-intensity-slider', video.scanlineIntensity);

  setInputValue('blur-slider', tracking.blur);
  setInputValue('min-size-slider', tracking.minSize);
  setInputValue('max-size-slider', tracking.maxSize);
  setInputValue('sensitivity-slider', tracking.sensitivity);
  document.getElementById('show-boxes').checked = tracking.showBoxes;
  document.getElementById('show-centers').checked = tracking.showCenters;
  document.getElementById('show-trails').checked = tracking.showTrails;
  document.getElementById('show-coords').checked = tracking.showCoords;
  document.getElementById('show-matte-blob').checked = tracking.showMatteBlob;
  setInputValue('line-thickness-slider', tracking.lineThickness);
  document.getElementById('fx-negative').checked = tracking.fxNegative;
  document.getElementById('fx-blur').checked = tracking.fxBlur;
  setBlobColor(tracking.blobColor);
  setLineColor(tracking.lineColor);
  updateVideoFilters();
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
    showMatteBlob: document.getElementById('show-matte-blob').checked,
    matteVideoOpacity: parseInt(document.getElementById('matte-video-opacity-slider').value) / 100,
    matteAdaptive: document.getElementById('matte-adaptive').checked,
    matteGenerationSlowdown: parseInt(document.getElementById('matte-generation-slider').value),
    matteDensity: parseInt(document.getElementById('matte-density-slider').value),
    matteRadius: parseInt(document.getElementById('matte-radius-slider').value),
    matteTileScale: parseInt(document.getElementById('matte-size-slider').value) / 100,
    matteVerticalSpread: parseInt(document.getElementById('matte-vertical-slider').value) / 100,
    mattePersistence: parseInt(document.getElementById('matte-persistence-slider').value),
    matteCoverageMin: parseInt(document.getElementById('matte-coverage-slider').value) / 100,
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

function setInputValue(id, value) {
  const input = document.getElementById(id);
  if (input) input.value = value;
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
  const indicator = document.getElementById('blob-params-indicator');
  panel.classList.toggle('hidden');
  if (panel.classList.contains('hidden')) {
    indicator.classList.add('scale-75');
    indicator.classList.remove('scale-125');
    indicator.classList.replace('bg-pink-500', 'bg-pink-900');
  } else {
    indicator.classList.remove('scale-75');
    indicator.classList.add('scale-125');
    indicator.classList.replace('bg-pink-900', 'bg-pink-500');
  }
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
  document.getElementById('more-tab-toggle-icon').innerHTML = ICONS.chevronRight;
  document.getElementById('record-icon').innerHTML = ICONS.camera;
  setPanelExpanded('left-fx-panel', false, 'fx-presets-toggle-icon');
  setBlobColor('#ffffff');
  setLineColor('#ffffff');
  syncMatteBlobControls();
  updateVideoFilters();
  updateConfig();
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
