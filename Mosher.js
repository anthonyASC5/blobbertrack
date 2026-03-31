const DEFAULT_MOSHER_STATE = {
  enabled: false
};

function cloneImageData(imageData) {
  return new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
}

class MosherEngine {
  constructor(initialState = {}) {
    this.state = { ...DEFAULT_MOSHER_STATE, ...initialState };
    this.width = 0;
    this.height = 0;
    this.encoder = null;
    this.decoder = null;
    this.isWebCodecsReady = false;
    this.useKeyFrame = false;
    this.speed = 2;
    this.sourceCanvas = null;
    this.sourceCtx = null;
    this.outputCanvas = null;
    this.outputCtx = null;
    this.latestDecodedFrame = null;
    this.supported = typeof window !== 'undefined'
      && 'VideoEncoder' in window
      && 'VideoDecoder' in window
      && 'VideoFrame' in window;
  }

  initMosher(width, height) {
    if (!width || !height) return;
    const sizeChanged = this.width !== width || this.height !== height;
    this.width = width;
    this.height = height;

    if (!this.sourceCanvas || sizeChanged) {
      this.sourceCanvas = document.createElement('canvas');
      this.sourceCanvas.width = width;
      this.sourceCanvas.height = height;
      this.sourceCtx = this.sourceCanvas.getContext('2d', { willReadFrequently: true });

      this.outputCanvas = document.createElement('canvas');
      this.outputCanvas.width = width;
      this.outputCanvas.height = height;
      this.outputCtx = this.outputCanvas.getContext('2d', { willReadFrequently: true });

      this.setupWebCodecs();
    }
  }

  setupWebCodecs() {
    this.isWebCodecsReady = false;
    if (!this.supported || !this.width || !this.height) return;

    try {
      this.encoder?.close();
      this.decoder?.close();
    } catch (_error) {
      // Ignore close failures from partially configured codecs.
    }

    try {
      this.encoder = new window.VideoEncoder({
        output: (chunk) => this.handleEncodedChunk(chunk),
        error: (err) => console.error('Encoder error:', err)
      });

      this.encoder.configure({
        codec: 'vp8',
        width: this.width,
        height: this.height
      });

      this.decoder = new window.VideoDecoder({
        output: (frame) => this.handleDecodedFrame(frame),
        error: (err) => console.error('Decoder error:', err)
      });

      this.decoder.configure({
        codec: 'vp8'
      });

      this.isWebCodecsReady = true;
    } catch (error) {
      console.error('Mosher WebCodecs unavailable:', error);
      this.supported = false;
      this.isWebCodecsReady = false;
    }
  }

  handleEncodedChunk(chunk) {
    if (!this.decoder || this.decoder.state === 'closed') return;
    if (chunk.type === 'key') {
      this.decoder.decode(chunk);
      return;
    }
    for (let i = 0; i < this.speed; i++) {
      this.decoder.decode(chunk);
    }
  }

  handleDecodedFrame(frame) {
    if (!this.outputCtx || !this.width || !this.height) {
      frame.close();
      return;
    }
    this.outputCtx.clearRect(0, 0, this.width, this.height);
    this.outputCtx.save();
    this.outputCtx.translate(this.width, 0);
    this.outputCtx.scale(-1, 1);
    this.outputCtx.drawImage(frame, 0, 0, this.width, this.height);
    this.outputCtx.restore();
    this.latestDecodedFrame = this.outputCtx.getImageData(0, 0, this.width, this.height);
    frame.close();
  }

  resetMosherBuffers() {
    this.useKeyFrame = true;
    this.latestDecodedFrame = null;
    if (this.outputCtx && this.width && this.height) {
      this.outputCtx.clearRect(0, 0, this.width, this.height);
    }
  }

  updateMosherState(partialState = {}) {
    const wasEnabled = this.state.enabled;
    this.state = {
      ...this.state,
      enabled: Boolean(partialState.enabled ?? this.state.enabled)
    };
    if (!wasEnabled && this.state.enabled) {
      this.useKeyFrame = true;
    }
  }

  setTargetFrameInterval(_intervalMs) {}

  noteFrameTime(_elapsedMs) {}

  applyMosher(currentFrameImageData, width, height, time) {
    this.initMosher(width, height);
    if (!this.isWebCodecsReady || !this.sourceCtx || !this.encoder) {
      return currentFrameImageData;
    }

    this.sourceCtx.putImageData(currentFrameImageData, 0, 0);

    try {
      const frame = new window.VideoFrame(this.sourceCanvas, {
        timestamp: Math.round((time || performance.now()) * 1000)
      });
      this.encoder.encode(frame, { keyFrame: this.useKeyFrame });
      this.useKeyFrame = false;
      frame.close();
    } catch (_error) {
      return currentFrameImageData;
    }

    return this.latestDecodedFrame ? cloneImageData(this.latestDecodedFrame) : currentFrameImageData;
  }
}

export { DEFAULT_MOSHER_STATE, MosherEngine };
