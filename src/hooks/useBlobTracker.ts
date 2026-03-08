import React, { useState, useRef, useEffect, useCallback } from 'react';
import { BlobData, TrackingConfig, VideoFilters, TrackingStats } from '../types';

const MAX_TRAIL_LENGTH = 20;

export function useBlobTracker(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  overlayRef: React.RefObject<HTMLCanvasElement | null>,
  config: TrackingConfig,
  filters: VideoFilters,
  isPlaying: boolean,
  isCvLoaded: boolean,
  renderOverlay?: (ctx: CanvasRenderingContext2D, blobs: BlobData[], config: TrackingConfig, sourceCanvas: HTMLCanvasElement) => void
) {
  const [blobs, setBlobs] = useState<BlobData[]>([]);
  const [stats, setStats] = useState<TrackingStats>({ fps: 0, blobCount: 0 });
  
  const processingRef = useRef<{
    prevFrame: any;
    nextId: number;
    activeBlobs: BlobData[];
    recordedChunks: Blob[];
    mediaRecorder: MediaRecorder | null;
    frameCount: number;
    exportData: any[];
  }>({
    prevFrame: null,
    nextId: 1,
    activeBlobs: [],
    recordedChunks: [],
    mediaRecorder: null,
    frameCount: 0,
    exportData: []
  });

  const requestRef = useRef<number>(null);

  const processFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !overlayRef.current || !isCvLoaded) return;
    const cv = window.cv;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
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
    src.convertTo(src, -1, filters.contrast, filters.brightness);

    if (filters.saturation !== 1) {
      const hsv = new cv.Mat();
      cv.cvtColor(src, hsv, cv.COLOR_RGB2HSV);
      const channels = new cv.MatVector();
      cv.split(hsv, channels);
      const s = channels.get(1);
      s.convertTo(s, -1, filters.saturation, 0);
      cv.merge(channels, hsv);
      cv.cvtColor(hsv, src, cv.COLOR_HSV2RGB);
      hsv.delete();
      channels.delete();
      s.delete();
    }

    if (filters.sharpness > 0) {
      const blurred = new cv.Mat();
      const ksize = new cv.Size(0, 0);
      cv.GaussianBlur(src, blurred, ksize, 3);
      cv.addWeighted(src, 1 + filters.sharpness, blurred, -filters.sharpness, 0, src);
      blurred.delete();
    }

    cv.imshow(canvas, src);

    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    const binary = new cv.Mat();
    if (config.mode === 'threshold') {
      cv.threshold(gray, binary, config.threshold, 255, cv.THRESH_BINARY);
    } else {
      if (processingRef.current.prevFrame) {
        cv.absdiff(gray, processingRef.current.prevFrame, binary);
        cv.threshold(binary, binary, config.threshold, 255, cv.THRESH_BINARY);
      } else {
        gray.copyTo(binary);
      }
      if (processingRef.current.prevFrame) processingRef.current.prevFrame.delete();
      processingRef.current.prevFrame = gray.clone();
    }

    const ksize = new cv.Size(config.blur * 2 + 1, config.blur * 2 + 1);
    cv.GaussianBlur(binary, binary, ksize, 0, 0, cv.BORDER_DEFAULT);
    
    const M = cv.Mat.ones(5, 5, cv.CV_8U);
    cv.dilate(binary, binary, M);
    cv.erode(binary, binary, M);

    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const detectedBlobs: Partial<BlobData>[] = [];
    for (let i = 0; i < contours.size(); ++i) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      if (area > config.minSize && area < config.maxSize) {
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

    const prevBlobs = processingRef.current.activeBlobs;
    const nextBlobs: BlobData[] = [];
    const usedIndices = new Set<number>();

    detectedBlobs.forEach(detected => {
      let bestMatch: BlobData | null = null;
      let minDistance = Infinity;
      let bestIdx = -1;

      prevBlobs.forEach((prev, idx) => {
        if (usedIndices.has(idx)) return;
        const dist = Math.hypot(detected.x! - prev.x, detected.y! - prev.y);
        if (dist < minDistance && dist < config.sensitivity * 2) {
          minDistance = dist;
          bestMatch = prev;
          bestIdx = idx;
        }
      });

      if (bestMatch && bestIdx !== -1) {
        usedIndices.add(bestIdx);
        const lastPositions = [...(bestMatch as BlobData).lastPositions, { x: bestMatch.x, y: bestMatch.y }].slice(-MAX_TRAIL_LENGTH);
        nextBlobs.push({
          ...bestMatch,
          x: detected.x!,
          y: detected.y!,
          width: detected.width!,
          height: detected.height!,
          area: detected.area!,
          velocityX: detected.x! - bestMatch.x,
          velocityY: detected.y! - bestMatch.y,
          lastPositions,
          isActive: true
        });
      } else {
        nextBlobs.push({
          id: processingRef.current.nextId++,
          x: detected.x!,
          y: detected.y!,
          width: detected.width!,
          height: detected.height!,
          area: detected.area!,
          velocityX: 0,
          velocityY: 0,
          lastPositions: [],
          color: `hsl(${Math.random() * 360}, 70%, 60%)`,
          isActive: true
        });
      }
    });

    processingRef.current.activeBlobs = nextBlobs;
    setBlobs(nextBlobs);
    setStats({ fps: Math.round(1000 / 33), blobCount: nextBlobs.length });

    processingRef.current.exportData.push({
      frame: processingRef.current.frameCount++,
      blobs: nextBlobs.map(b => ({ id: b.id, x: b.x, y: b.y, w: b.width, h: b.height }))
    });

    // --- Rendering Overlays ---
    if (renderOverlay) {
      renderOverlay(oCtx, nextBlobs, config, canvas);
    }

    src.delete();
    gray.delete();
    binary.delete();
    contours.delete();
    hierarchy.delete();
    M.delete();

    if (isPlaying) {
      requestRef.current = requestAnimationFrame(processFrame);
    }
  }, [config, isCvLoaded, isPlaying, filters, videoRef, canvasRef, overlayRef, renderOverlay]);

  useEffect(() => {
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(processFrame);
    } else if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying, processFrame]);

  return { blobs, stats, processingRef, setBlobs };
}
