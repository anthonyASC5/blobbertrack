// VHS.js applies the heavy post-processing passes and decorates the slider UI.
class VHSEngine {
  constructor(processingRef) {
    // The blob tracker owns shared frame history, and the VHS engine reuses it.
    this.processingRef = processingRef;
    this.fxCanvas = null;
    this.lastOutputCanvas = null;
    this.slitScanCanvas = null;
  }

  apply(ctx, width, height, fx, blobs, hiddenBlobIds) {
    // Skip the effect pipeline entirely when every VHS control is neutral.
    const hasEffect = (
      fx.edgeDetect > 0 ||
      fx.scanlineThickness > 0 ||
      fx.gamma !== 1 ||
      fx.slitScanSpeed > 0 ||
      fx.heatAmplitude > 0 ||
      fx.echoFrames > 1 ||
      fx.shuffleAmount > 0 ||
      fx.crtScanlines > 0 ||
      fx.crtGlow > 0 ||
      fx.edgeGlow > 0 ||
      fx.rgbShift.r !== 0 ||
      fx.rgbShift.g !== 0 ||
      fx.rgbShift.b !== 0
    );
    if (!hasEffect) return;

    const totalPixels = width * height;
    const shouldReuseLastFrame = totalPixels > 1280 * 720 && this.lastOutputCanvas && (this.processingRef.frameCount % 2 === 1);
    if (shouldReuseLastFrame) {
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(this.lastOutputCanvas, 0, 0);
      return;
    }

    if (!this.fxCanvas) this.fxCanvas = document.createElement('canvas');
    if (this.fxCanvas.width !== width || this.fxCanvas.height !== height) {
      this.fxCanvas.width = width;
      this.fxCanvas.height = height;
    }

    const offCtx = this.fxCanvas.getContext('2d');
    if (!offCtx) return;

    // Start from the already-rendered tracker frame before applying VHS distortions.
    offCtx.clearRect(0, 0, width, height);
    offCtx.drawImage(ctx.canvas, 0, 0);

    if (fx.slitScanSpeed > 0) {
      if (!this.slitScanCanvas) {
        this.slitScanCanvas = document.createElement('canvas');
      }
      const slitCanvas = this.slitScanCanvas;
      if (slitCanvas.width !== width || slitCanvas.height !== height) {
        slitCanvas.width = width;
        slitCanvas.height = height;
      }
      const slitCtx = slitCanvas.getContext('2d');
      if (slitCtx) {
        const speed = Math.max(1, fx.slitScanSpeed | 0);
        const scanW = 2;
        const sx = Math.max(0, Math.floor((width - scanW) * 0.5));
        slitCtx.drawImage(slitCanvas, -speed, 0);
        slitCtx.drawImage(offCtx.canvas, sx, 0, scanW, height, width - speed, 0, scanW, height);
        offCtx.clearRect(0, 0, width, height);
        offCtx.drawImage(slitCanvas, 0, 0);
      }
    }

    // Pull the pixels into JS once so the per-pixel pass can remap color channels.
    const imageData = offCtx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const srcCopy = new Uint8ClampedArray(data);
    const gamma = Math.max(0.01, fx.gamma);
    const edgeMix = fx.edgeDetect;
    const shiftR = fx.rgbShift.r | 0;
    const shiftG = fx.rgbShift.g | 0;
    const shiftB = fx.rgbShift.b | 0;
    const scanlineThickness = Math.max(0, fx.scanlineThickness | 0);
    const scanlineIntensity = fx.scanlineIntensity ?? 0.3;
    const time = performance.now() * 0.001;

    // Sampling clamps to the canvas edges so displacement effects never read invalid pixels.
    const sampleChannel = (sx, sy, channel) => {
      const x = Math.max(0, Math.min(width - 1, sx | 0));
      const y = Math.max(0, Math.min(height - 1, sy | 0));
      return srcCopy[(y * width + x) * 4 + channel];
    };

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        let dispX = x;
        const dispY = y;

        // Keep the pixel pass lightweight so the HUD stays responsive.
        if (fx.heatAmplitude > 0) {
          dispX += Math.sin(y * 0.03 + time * fx.heatSpeed) * fx.heatAmplitude;
        }

        let r = sampleChannel(dispX + shiftR, dispY, 0);
        let g = sampleChannel(dispX + shiftG, dispY, 1);
        let b = sampleChannel(dispX + shiftB, dispY, 2);

        // Gamma and scanlines shape the overall tone before edge highlights are mixed in.
        r = 255 * Math.pow(r / 255, 1 / gamma);
        g = 255 * Math.pow(g / 255, 1 / gamma);
        b = 255 * Math.pow(b / 255, 1 / gamma);

        if (scanlineThickness > 0 && (y % (scanlineThickness * 2)) < scanlineThickness) {
          const dim = 1 - scanlineIntensity;
          r *= dim;
          g *= dim;
          b *= dim;
        }

        if (edgeMix > 0 && x > 0 && y > 0 && x < width - 1 && y < height - 1) {
          const iL = (y * width + (x - 1)) * 4;
          const iR = (y * width + (x + 1)) * 4;
          const iU = ((y - 1) * width + x) * 4;
          const iD = ((y + 1) * width + x) * 4;
          const gx = Math.abs(srcCopy[iR] - srcCopy[iL]);
          const gy = Math.abs(srcCopy[iD] - srcCopy[iU]);
          const edge = Math.min(255, gx + gy);
          r = (r * (1 - edgeMix)) + (edge * edgeMix);
          g = (g * (1 - edgeMix)) + (edge * edgeMix);
          b = (b * (1 - edgeMix)) + (edge * edgeMix);
        }

        // Edge glow adds a colored halo to strong horizontal contrast changes.
        if (fx.edgeGlow > 0 && x > 0 && y > 0 && x < width - 1 && y < height - 1) {
          const iL = (y * width + (x - 1)) * 4;
          const iR = (y * width + (x + 1)) * 4;
          const edge = Math.abs(srcCopy[iR] - srcCopy[iL]);
          if (edge > fx.edgeThreshold) {
            const boost = fx.edgeGlow * 110;
            r = Math.min(255, r + boost);
            g = Math.min(255, g + boost * 0.7);
            b = Math.min(255, b + boost * 1.2);
          }
        }

        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
      }
    }

    // Echo history blends older frames back into the newest frame with exponential decay.
    this.processingRef.echoHistory.unshift(new Uint8ClampedArray(data));
    this.processingRef.echoHistory = this.processingRef.echoHistory.slice(0, Math.max(1, fx.echoFrames | 0));
    if (fx.echoFrames > 1 && this.processingRef.echoHistory.length > 1) {
      for (let i = 0; i < data.length; i += 4) {
        let r = data[i];
        let g = data[i + 1];
        let b = data[i + 2];
        for (let h = 1; h < this.processingRef.echoHistory.length; h++) {
          const decay = Math.pow(fx.echoDecay, h);
          const hist = this.processingRef.echoHistory[h];
          r += hist[i] * decay;
          g += hist[i + 1] * decay;
          b += hist[i + 2] * decay;
        }
        const norm = 1 + this.processingRef.echoHistory.length * 0.45;
        data[i] = Math.min(255, r / norm);
        data[i + 1] = Math.min(255, g / norm);
        data[i + 2] = Math.min(255, b / norm);
      }
    }

    offCtx.putImageData(imageData, 0, 0);

    // CRT overlays happen after the main pixel pass so they sit on top of every effect.
    if (fx.crtScanlines > 0) {
      offCtx.save();
      offCtx.globalAlpha = fx.crtScanlines * 0.5;
      offCtx.fillStyle = '#000';
      for (let y = 0; y < height; y += 2) {
        offCtx.fillRect(0, y, width, 1);
      }
      offCtx.restore();
    }

    if (fx.crtGlow > 0) {
      offCtx.save();
      offCtx.globalCompositeOperation = 'screen';
      offCtx.filter = `blur(${Math.max(0, fx.crtGlow * 5)}px)`;
      offCtx.globalAlpha = 0.3;
      offCtx.drawImage(offCtx.canvas, 0, 0);
      offCtx.restore();
    }

    // Cache the finished frame so heavy modes can reuse it on the next animation tick.
    if (!this.lastOutputCanvas) {
      this.lastOutputCanvas = document.createElement('canvas');
    }
    this.lastOutputCanvas.width = width;
    this.lastOutputCanvas.height = height;
    this.lastOutputCanvas.getContext('2d')?.drawImage(offCtx.canvas, 0, 0);

    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(this.fxCanvas, 0, 0);
  }
}

// The slider helper only marks active controls and should not override HTML defaults.
function applyVhsSliderVisualState(slider) {
  const numericValue = Number(slider.value);
  slider.classList.toggle('vhs-slider-active', Math.abs(numericValue) > 0.0001);
}

function initVHSUI() {
  // This pass decorates the controls while preserving the ranges and defaults from the markup.
  const sliders = document.querySelectorAll('#more-tab-content input[type="range"]');
  sliders.forEach((slider) => {
    slider.classList.add('vhs-slider');
    applyVhsSliderVisualState(slider);
    slider.addEventListener('input', () => applyVhsSliderVisualState(slider));
  });
}

export { VHSEngine, initVHSUI };
