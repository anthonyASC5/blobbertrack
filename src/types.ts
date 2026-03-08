/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface BlobData {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  area: number;
  velocityX: number;
  velocityY: number;
  lastPositions: { x: number, y: number }[];
  color: string;
  isActive: boolean;
}

export interface TrackingConfig {
  threshold: number;
  minSize: number;
  maxSize: number;
  blur: number;
  sensitivity: number;
  showBoxes: boolean;
  showCenters: boolean;
  showTrails: boolean;
  showMesh: boolean;
  showCoords: boolean;
  mode: 'threshold' | 'differencing';
  blobColor?: string;
  trailHue?: number;
  lineThickness?: number;
  glassMode?: boolean;
}

export interface VideoFilters {
  brightness: number;
  contrast: number;
  saturation: number;
  sharpness: number;
}

export interface TrackingStats {
  fps: number;
  blobCount: number;
}

declare global {
  interface Window {
    cv: any;
  }
}
