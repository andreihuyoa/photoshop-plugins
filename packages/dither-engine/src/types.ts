export type RGB = [number, number, number];

/** Chunky 8-bit pixels, 3 (RGB) or 4 (RGBA) components per pixel. */
export interface Pixels {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  components: 3 | 4;
}

export type Family = "diffusion" | "ordered" | "halftone" | "mosaic" | "noise" | "modulation";
export type ColorMode = "mono" | "tone" | "indexed" | "rgb";
export type EdgeStyle = "crisp" | "soft" | "rounded";

export interface Algorithm {
  id: string;
  name: string;
  family: Family;
}

/** Input levels, gamma and output levels, like Photoshop's Levels. Values 0–255, gamma 0.1–9.99. */
export interface Levels {
  inBlack: number;
  inWhite: number;
  gamma: number;
  outBlack: number;
  outWhite: number;
}

export interface RenderOptions {
  algorithm: string;
  /** 0–1: error amount for diffusion, threshold contrast for everything else. */
  strength: number;
  serpentine: boolean;
  /** Cell or period size for halftone, mosaic and modulation patterns, in working pixels. */
  cell: number;
  /** Screen angle in degrees for halftone patterns. */
  angle: number;

  mode: ColorMode;
  /** Steps between dark and light in tone mode (mono is always 2). */
  steps: number;
  dark: RGB;
  light: RGB;
  /** Colors for indexed mode. */
  palette: RGB[] | null;
  /** Levels per channel in RGB mode. */
  rgbLevels: number;

  /** Size of one output pixel. */
  pixelSize: number;
  blur: number;
  sharpen: number;
  /** 0–1: blend of a 3×3 median filter. */
  denoise: number;
  levels: Levels;
  invert: boolean;

  /** How blocks are upscaled when pixelSize > 1. */
  edge: EdgeStyle;
  /** -1–1: grows light (positive) or dark (negative) shapes for rounded edges. */
  bleed: number;
  /** 0 keeps soft transparency; 1–255 cuts alpha at that value. */
  alphaThreshold: number;

  /** Pattern phase in working pixels, so previews and the final render line up. */
  originX: number;
  originY: number;
  seed: number;
}
