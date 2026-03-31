import { BlobTracker } from './blobtracker.js';
import { initVHSUI } from './VHS.js';

// Global variables
let blobTracker;
let videoSrc = null;
const MOBILE_BREAKPOINT_QUERY = '(max-width: 900px)';
const DEFAULT_STAGE_RATIO = 16 / 9;
const SPLIT_VIEW_STAGE_MULTIPLIER = 2;
const ICONS = {
  play: '<svg class="ui-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.5l7 4.5-7 4.5z" fill="currentColor" stroke="none"></path></svg>',
  pause: '<svg class="ui-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.5v9M11 3.5v9"></path></svg>',
  restart: '<svg class="ui-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 7a4.5 4.5 0 1 1 1.2 3.1M3.5 7V3.5M3.5 3.5H7"></path></svg>',
  chevronRight: '<svg class="ui-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5L10.5 8 6 12.5"></path></svg>',
  camera: '<svg class="ui-icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="4" width="8" height="8" rx="1.5"></rect><path d="M10.5 7l3-1.5v5l-3-1.5z"></path></svg>',
  chevronDown: '<svg class="ui-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 6L8 10.5 12.5 6"></path></svg>',
  stop: '<svg class="ui-icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="4.5" y="4.5" width="7" height="7" fill="currentColor" stroke="none"></rect></svg>'
};
const MORE_FILTER_IDS = [
  'edge-detect-slider',
  'scanline-thickness-slider',
  'gamma-slider',
  'heat-speed-slider',
  'echo-decay-slider',
  'crt-scanlines-slider',
  'crt-glow-slider',
  'edge-glow-slider',
  'edge-threshold-slider',
  'rgb-shift-r-slider',
  'rgb-shift-g-slider',
  'rgb-shift-b-slider',
  'scanline-intensity-slider'
];
let selectedAspectRatioLabel = 'Original';
let isSplitViewEnabled = false;

// Debounce utility for performance optimization
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Debounced version of updateVideoFilters to prevent excessive VHS processing
const debouncedUpdateVideoFilters = debounce(updateVideoFilters, 150);

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  blobTracker = new BlobTracker();
  blobTracker.init('video', 'canvas', 'overlay', 'goo-canvas', 'reference-canvas');
  mountVHSPanel();

  initializeIcons();
  setupEventListeners();
  syncResponsiveLayout();
  syncAspectRatioButton();
  syncSplitViewState();
  syncVideoStageSize();
  syncOutputSelectReadouts();
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
  document.querySelectorAll('.aspect-ratio-option').forEach(option => {
    option.addEventListener('click', handleAspectRatioSelection);
  });
  document.getElementById('split-view-toggle').addEventListener('click', toggleSplitView);
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

  document.getElementById('output-settings-toggle').addEventListener('click', (e) => {
    e.stopPropagation();
    const panel = document.getElementById('output-panel');
    const isHidden = panel.classList.toggle('hidden');
    document.getElementById('output-settings-toggle').setAttribute('aria-expanded', isHidden ? 'false' : 'true');
  });
  document.addEventListener('click', (e) => {
    const panel = document.getElementById('output-panel');
    const toggle = document.getElementById('output-settings-toggle');
    if (!panel.contains(e.target) && !toggle.contains(e.target)) {
      panel.classList.add('hidden');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });

  // Play/pause controls
  document.getElementById('start-btn').addEventListener('click', startTracking);
  document.getElementById('nav-play-btn').addEventListener('click', togglePlay);
  document.getElementById('nav-stop-btn').addEventListener('click', stopPlayback);
  document.getElementById('nav-restart-btn').addEventListener('click', restartPlayback);

  // Module controls
  document.getElementById('video-editor-toggle').addEventListener('click', toggleVideoEditor);
  document.getElementById('more-hud-toggle').addEventListener('click', toggleMoreHUD);
  document.getElementById('fx-presets-toggle').addEventListener('click', toggleFxPresetsPanel);
  document.getElementById('matte-blob-toggle').addEventListener('click', toggleMatteBlobPanel);
  document.getElementById('blob-params-toggle').addEventListener('click', toggleBlobParamsPanel);

  // Video editor - use debounced updates for performance
  document.getElementById('sharpen-slider').addEventListener('input', debouncedUpdateVideoFilters);
  document.getElementById('brightness-slider').addEventListener('input', debouncedUpdateVideoFilters);
  document.getElementById('contrast-slider').addEventListener('input', debouncedUpdateVideoFilters);
  document.getElementById('saturation-slider').addEventListener('input', debouncedUpdateVideoFilters);
  MORE_FILTER_IDS.forEach(id => document.getElementById(id).addEventListener('input', debouncedUpdateVideoFilters));
  document.getElementById('reset-video-filters').addEventListener('click', resetVideoFilters);
  document.getElementById('fps-cap-select').addEventListener('change', updateOptimizationSettings);
  document.getElementById('quality-select').addEventListener('change', updateOptimizationSettings);

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
  document.getElementById('mosher-toggle').addEventListener('click', toggleMosherPanel);

  // Video output tab
  document.getElementById('video-output-toggle').addEventListener('click', toggleVideoOutputTab);

  // Box types tab
  document.getElementById('box-types-toggle').addEventListener('click', toggleBoxTypesPanel);

  // Color science
  document.getElementById('color-science-toggle').addEventListener('click', toggleColorScience);
  document.getElementById('trail-hue-slider').addEventListener('input', updateConfig);
  document.getElementById('line-thickness-slider').addEventListener('input', updateConfig);
  document.getElementById('fx-negative').addEventListener('change', updateConfig);
  document.getElementById('fx-blur').addEventListener('change', updateConfig);
  document.getElementById('fx-magnifier-link').addEventListener('change', updateConfig);

  // Box type checkboxes
  document.getElementById('box-type-circle').addEventListener('change', updateConfig);
  document.getElementById('box-type-win98').addEventListener('change', updateConfig);
  document.getElementById('box-type-rainbow-x').addEventListener('change', updateConfig);
  document.getElementById('box-type-white-question').addEventListener('change', updateConfig);

  // Randomizer button
  document.getElementById('randomize-button').addEventListener('click', handleRandomize);

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
    switchInfoModalTab('controls');
    document.getElementById('info-modal').classList.remove('hidden');
  });
  document.getElementById('close-modal').addEventListener('click', () => {
    document.getElementById('info-modal').classList.add('hidden');
  });
  document.getElementById('modal-backdrop').addEventListener('click', () => {
    document.getElementById('info-modal').classList.add('hidden');
  });
  document.querySelectorAll('.info-tab-button').forEach(button => {
    button.addEventListener('click', () => {
      switchInfoModalTab(button.dataset.infoTab);
    });
  });

  // Test mode button
  document.getElementById('test-mode-btn').addEventListener('click', () => {
    window.location.href = 'testplace.html';
  });

  // Mobile panel toggles
  document.getElementById('mobile-hud-toggle').addEventListener('click', toggleHUDMobile);
  document.getElementById('mobile-hud-drawer-toggle').addEventListener('click', toggleHUDMobile);
  window.addEventListener('resize', handleWindowResize);

  // Global keyboard controls
  document.addEventListener('click', handleDocumentClick);
  document.addEventListener('keydown', handleGlobalKeydown);

  updateOptimizationSettings();
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
  video.addEventListener('loadedmetadata', handleVideoMetadataLoaded, { once: true });
  document.getElementById('upload-zone').classList.add('hidden');
  document.getElementById('video-preview-shell').classList.remove('hidden');
  document.getElementById('start-overlay').classList.remove('hidden');
  updateStartCode();
  blobTracker.processingRef.nextId = 1;
  blobTracker.processingRef.activeBlobs = [];
  blobTracker.processingRef.frameCount = 0;
  blobTracker.clearHiddenBlobs();
  setRecordButtonState(false);
  updateViewportInfo();
  syncVideoStageSize();
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
  const toggle = document.getElementById('fx-presets-toggle');
  const icon = document.getElementById('fx-presets-toggle-icon');
  if (!panel || !toggle) return;
  const isCollapsed = panel.classList.toggle('hidden');
  toggle.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
  if (icon) {
    icon.innerHTML = isCollapsed ? ICONS.chevronRight : ICONS.chevronDown;
  }
}

function toggleMoreHUD() {
  const panel = document.getElementById('more-hud-panel');
  const icon = document.getElementById('more-hud-toggle-icon');
  if (!panel) return;
  const isCollapsed = panel.classList.toggle('collapsed');
  if (icon) {
    icon.innerHTML = isCollapsed ? ICONS.chevronRight : ICONS.chevronDown;
  }
}

function toggleHUDMobile() {
  if (!window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches) return;
  const shell = document.getElementById('app-shell');
  const isOpen = shell.classList.toggle('mobile-hud-open');
  setHUDToggleState(isOpen);
}

function handleWindowResize() {
  syncResponsiveLayout();
  syncVideoStageSize();
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
    slitScanSpeed: 0,
    heatAmplitude: 0,
    heatSpeed: parseInt(document.getElementById('heat-speed-slider').value) / 100,
    echoFrames: 1,
    echoDecay: parseInt(document.getElementById('echo-decay-slider').value) / 100,
    pixelSortThreshold: 0,
    scanCollapseStrength: 0,
    shuffleAmount: 0,
    crtScanlines: parseInt(document.getElementById('crt-scanlines-slider').value) / 100,
    crtGlow: parseInt(document.getElementById('crt-glow-slider').value) / 100,
    edgeGlow: parseInt(document.getElementById('edge-glow-slider').value) / 100,
    edgeThreshold: parseInt(document.getElementById('edge-threshold-slider').value),
    noiseDisplace: 0,
    noiseSpeed: 1,
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
  document.getElementById('heat-speed-slider').value = 200;
  document.getElementById('echo-decay-slider').value = 70;
  document.getElementById('crt-scanlines-slider').value = 0;
  document.getElementById('crt-glow-slider').value = 0;
  document.getElementById('edge-glow-slider').value = 0;
  document.getElementById('edge-threshold-slider').value = 50;
  document.getElementById('rgb-shift-r-slider').value = 0;
  document.getElementById('rgb-shift-g-slider').value = 0;
  document.getElementById('rgb-shift-b-slider').value = 0;
  document.getElementById('scanline-intensity-slider').value = 30;
  updateVideoFilters();
}

function updateOptimizationSettings() {
  const fpsCap = parseInt(document.getElementById('fps-cap-select').value, 10);
  const qualityScale = parseFloat(document.getElementById('quality-select').value);
  syncOutputSelectReadouts();
  blobTracker.updateOptimization({
    fpsCap,
    qualityScale
  });
}

function syncOutputSelectReadouts() {
  const qualitySelect = document.getElementById('quality-select');
  const fpsSelect = document.getElementById('fps-cap-select');
  const qualityCurrent = document.getElementById('quality-current');
  const fpsCurrent = document.getElementById('fps-current');

  if (qualitySelect && qualityCurrent) {
    qualityCurrent.textContent = qualitySelect.options[qualitySelect.selectedIndex]?.textContent || qualitySelect.value;
  }

  if (fpsSelect && fpsCurrent) {
    fpsCurrent.textContent = fpsSelect.options[fpsSelect.selectedIndex]?.textContent || fpsSelect.value;
  }
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
    lineColor: blobTracker.config.lineColor || '#ffffff',
    boxTypeCircle: document.getElementById('box-type-circle').checked,
    boxTypeWin98: document.getElementById('box-type-win98').checked,
    boxTypeRainbowX: document.getElementById('box-type-rainbow-x').checked,
    boxTypeWhiteQuestion: document.getElementById('box-type-white-question').checked
  };
  blobTracker.updateConfig(config);
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomFloat(min, max) {
  return Math.random() * (max - min) + min;
}

function randomizeVideoFilters() {
  // Basic filters - safe to randomize fully
  document.getElementById('sharpen-slider').value = getRandomInt(0, 100);
  document.getElementById('brightness-slider').value = getRandomInt(-50, 50);
  document.getElementById('contrast-slider').value = getRandomInt(80, 150);
  document.getElementById('saturation-slider').value = getRandomInt(50, 150);

  // VHS effects - be more conservative with expensive operations
  const safeVhsIds = [
    'edge-detect-slider',
    'scanline-thickness-slider',
    'gamma-slider',
    'heat-speed-slider',
    'echo-decay-slider',
    'crt-scanlines-slider',
    'crt-glow-slider',
    'edge-glow-slider',
    'edge-threshold-slider',
    'scanline-intensity-slider'
  ];

  // Safe VHS effects
  safeVhsIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const min = parseInt(el.min || '0', 10);
    const max = parseInt(el.max || '100', 10);
    el.value = getRandomInt(min, max);
  });

  ['rgb-shift-r-slider', 'rgb-shift-g-slider', 'rgb-shift-b-slider'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = Math.random() < 0.7 ? 0 : getRandomInt(-10, 10);
  });

  updateVideoFilters();
}

function randomizeTrackingAndBlobParams() {
  const minSize = getRandomInt(1, 400);
  const maxSize = getRandomInt(Math.max(minSize + 10, 110), 10000);

  document.getElementById('min-size-slider').value = minSize;
  document.getElementById('max-size-slider').value = maxSize;
  document.getElementById('sensitivity-slider').value = getRandomInt(1, 500);

  document.getElementById('blur-slider').value = getRandomInt(0, 10);

  ['show-boxes', 'show-centers', 'show-trails', 'show-coords', 'fx-negative', 'fx-blur', 'fx-magnifier-link', 'box-type-circle', 'box-type-win98', 'box-type-rainbow-x', 'box-type-white-question'].forEach(id => {
    const checkbox = document.getElementById(id);
    if (checkbox) checkbox.checked = Math.random() >= 0.5;
  });

  updateConfig();
}

function handleRandomize() {
  const randomHue = Math.floor(Math.random() * 360);
  const randomColor = `hsl(${randomHue}, 70%, 60%)`;
  const actionButton = document.getElementById('randomize-button');
  if (actionButton) {
    actionButton.style.backgroundColor = randomColor;
    actionButton.style.color = '#fff';
    actionButton.style.borderColor = randomColor;
  }

  randomizeVideoFilters();
  randomizeTrackingAndBlobParams();

  // Ensure updates propagate through tracker
  updateVideoFilters();
  updateConfig();
}

function toggleAspectRatioMenu() {
  const toggle = document.getElementById('aspect-ratio-toggle');
  const menu = document.getElementById('aspect-ratio-menu');
  if (!toggle || !menu) return;
  const isHidden = menu.classList.toggle('hidden');
  toggle.setAttribute('aria-expanded', isHidden ? 'false' : 'true');
}

function closeAspectRatioMenu() {
  const toggle = document.getElementById('aspect-ratio-toggle');
  const menu = document.getElementById('aspect-ratio-menu');
  if (!toggle || !menu) return;
  menu.classList.add('hidden');
  toggle.setAttribute('aria-expanded', 'false');
}

function handleDocumentClick(e) {
  const picker = document.getElementById('aspect-ratio-picker');
  if (picker && !picker.contains(e.target)) {
    closeAspectRatioMenu();
  }
}

function handleAspectRatioSelection(e) {
  const option = e.currentTarget;
  const ratioValue = option.dataset.aspectValue === 'original' ? null : Number(option.dataset.aspectValue);
  selectedAspectRatioLabel = option.dataset.aspectLabel || 'Original';
  blobTracker.setOutputAspectRatio(Number.isFinite(ratioValue) ? ratioValue : null);
  closeAspectRatioMenu();
  syncAspectRatioButton();
  syncVideoStageSize();
  updateViewportInfo();
  blobTracker.renderStillFrame();
}

function toggleSplitView(e) {
  e.preventDefault();
  isSplitViewEnabled = !isSplitViewEnabled;
  syncSplitViewState();
  syncVideoStageSize();
  updateViewportInfo();
  blobTracker.renderStillFrame();
}

function syncAspectRatioButton() {
  const label = document.getElementById('aspect-ratio-label');
  if (label) {
    label.textContent = selectedAspectRatioLabel;
  }

  document.querySelectorAll('.aspect-ratio-option').forEach(option => {
    const isActive = option.dataset.aspectLabel === selectedAspectRatioLabel;
    option.classList.toggle('is-active', isActive);
  });
}

function syncSplitViewState() {
  const stage = document.getElementById('video-stage');
  const referenceContainer = document.getElementById('reference-video-container');
  const splitLabel = document.getElementById('split-view-label');
  const splitToggle = document.getElementById('split-view-toggle');
  if (!stage || !referenceContainer || !splitLabel || !splitToggle) return;

  stage.classList.toggle('split-view-active', isSplitViewEnabled);
  referenceContainer.classList.toggle('hidden', !isSplitViewEnabled);
  splitLabel.textContent = isSplitViewEnabled ? 'On' : 'Off';
  splitToggle.classList.toggle('is-active', isSplitViewEnabled);
}

function getDisplayAspectRatio() {
  const baseRatio = blobTracker?.getStageAspectRatio?.() || DEFAULT_STAGE_RATIO;
  return isSplitViewEnabled ? baseRatio * SPLIT_VIEW_STAGE_MULTIPLIER : baseRatio;
}

function syncVideoStageSize() {
  const section = document.getElementById('video-section');
  const stage = document.getElementById('video-stage');
  if (!section || !stage) return;

  const ratio = getDisplayAspectRatio();
  const availableWidth = Math.max(1, section.clientWidth - 32);
  const availableHeight = Math.max(1, section.clientHeight - 32);
  let width = availableWidth;
  let height = width / ratio;

  if (height > availableHeight) {
    height = availableHeight;
    width = height * ratio;
  }

  stage.style.width = `${Math.max(1, Math.floor(width))}px`;
  stage.style.height = `${Math.max(1, Math.floor(height))}px`;
}

function handleVideoMetadataLoaded() {
  updateViewportInfo();
  syncVideoStageSize();
  blobTracker.renderStillFrame();
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

function toggleMosherPanel() {
  const indicator = document.getElementById('mosher-indicator');
  const toggle = document.getElementById('mosher-toggle');
  const text = document.getElementById('mosher-toggle-text');
  const nextEnabled = !blobTracker.mosherState.enabled;
  blobTracker.updateMosherState({ enabled: nextEnabled });
  if (!nextEnabled) {
    blobTracker.resetMosherBuffers();
  }
  toggle.setAttribute('aria-pressed', nextEnabled ? 'true' : 'false');
  if (indicator) {
    indicator.classList.toggle('scale-75', !nextEnabled);
    indicator.classList.toggle('scale-125', nextEnabled);
    indicator.classList.toggle('bg-pink-900', !nextEnabled);
    indicator.classList.toggle('bg-pink-500', nextEnabled);
  }
  if (text) {
    text.textContent = nextEnabled ? 'On' : 'Off';
  }
}

function switchInfoModalTab(tabName) {
  const isHistory = tabName === 'history';
  document.getElementById('info-tab-panel-controls')?.classList.toggle('hidden', isHistory);
  document.getElementById('info-tab-panel-history')?.classList.toggle('hidden', !isHistory);

  document.querySelectorAll('.info-tab-button').forEach(button => {
    const isActive = button.dataset.infoTab === tabName;
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    button.classList.toggle('border-pink-500/40', isActive);
    button.classList.toggle('bg-pink-500/15', isActive);
    button.classList.toggle('text-pink-100', isActive);
    button.classList.toggle('border-white/10', !isActive);
    button.classList.toggle('bg-white/5', !isActive);
    button.classList.toggle('text-white/55', !isActive);
  });
}

function toggleMoreTab() {
  const moreHUD = document.getElementById('more-hud-panel');
  const panel = document.getElementById('more-tab-content');
  const icon = document.getElementById('more-tab-toggle-icon');
  panel.classList.toggle('hidden');
  const isOpen = !panel.classList.contains('hidden');
  moreHUD?.classList.toggle('vhs-focus', isOpen);
  icon.innerHTML = isOpen ? ICONS.chevronDown : ICONS.chevronRight;
}

function toggleVideoOutputTab() {
  const panel = document.getElementById('video-output-content');
  const icon = document.getElementById('video-output-toggle-icon');
  panel.classList.toggle('hidden');
  const isOpen = !panel.classList.contains('hidden');
  icon.innerHTML = isOpen ? ICONS.chevronDown : ICONS.chevronRight;
}

function toggleBoxTypesPanel() {
  const panel = document.getElementById('box-types-content');
  const icon = document.getElementById('box-types-toggle-icon');
  panel.classList.toggle('hidden');
  const isOpen = !panel.classList.contains('hidden');
  icon.innerHTML = isOpen ? ICONS.chevronDown : ICONS.chevronRight;
}

function toggleBlobParamsPanel() {
  const panel = document.getElementById('blob-params-panel');
  const toggle = document.getElementById('blob-params-toggle');
  const icon = document.getElementById('blob-params-toggle-icon');
  if (!panel || !toggle) return;
  const isCollapsed = panel.classList.toggle('hidden');
  toggle.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
  if (icon) {
    icon.innerHTML = isCollapsed ? ICONS.chevronRight : ICONS.chevronDown;
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
  const primaryPlay = document.getElementById('play-icon');
  if (primaryPlay) {
    primaryPlay.innerHTML = isPlaying ? ICONS.pause : ICONS.play;
  }

  const navPlay = document.getElementById('nav-play-icon');
  if (navPlay) {
    navPlay.innerHTML = isPlaying ? ICONS.pause : ICONS.play;
  }
}

function initializeIcons() {
  setPlayButtonState(false);
  document.getElementById('nav-stop-icon').innerHTML = ICONS.stop;
  document.getElementById('nav-play-icon').innerHTML = ICONS.play;
  document.getElementById('nav-restart-icon').innerHTML = ICONS.restart;
  document.getElementById('video-editor-toggle-icon').innerHTML = ICONS.chevronRight;
  document.getElementById('blob-params-toggle-icon').innerHTML = ICONS.chevronRight;
  document.getElementById('fx-presets-toggle-icon').innerHTML = ICONS.chevronRight;
  document.getElementById('more-tab-toggle-icon').innerHTML = ICONS.chevronRight;
  document.getElementById('video-output-toggle-icon').innerHTML = ICONS.chevronRight;
  document.getElementById('box-types-toggle-icon').innerHTML = ICONS.chevronRight;
  setRecordButtonState(false);
  setPanelExpanded('more-hud-panel', false, 'more-hud-toggle-icon');
  setSimpleTogglePanel('left-fx-panel', false, 'fx-presets-toggle-icon');
  setIndicatorPanelState('color-science-panel', 'color-science-indicator', false);
  setIndicatorPanelState('matte-blob-panel', 'matte-blob-indicator', false);
  blobTracker.updateMosherState({ enabled: false });
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

function handleGlobalKeydown(e) {
  if (e.code === 'Escape') {
    closeAspectRatioMenu();
    return;
  }
  if (e.code !== 'Space') return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  e.preventDefault();
  togglePlay();
}

function updateViewportInfo() {
  const video = document.getElementById('video');
  const aspectSuffix = selectedAspectRatioLabel === 'Original' ? '' : ` // ${selectedAspectRatioLabel}`;
  const splitSuffix = isSplitViewEnabled ? ' // Split' : '';
  document.getElementById('viewport-info').textContent =
    `Viewport_01 // ${video.videoWidth || 0}x${video.videoHeight || 0}${aspectSuffix}${splitSuffix}`;
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
