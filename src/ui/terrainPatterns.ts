// Кэш off-screen-канвасов с текстурой террейна. drawImage(canvas, …) рисуется
// независимо от глобальных координат — pattern бы съезжал при скролле, а так
// каждый тайл отрисуется одинаково.

import type { Terrain } from "../game/types";

const PATTERN_SIZE = 32;
const cache = new Map<Terrain, HTMLCanvasElement>();

interface PaletteEntry {
  base: string;
  // Точки/пятна разной интенсивности — лёгкая псевдослучайная текстура.
  speckles: Array<{ color: string; count: number; size: [number, number] }>;
}

const PALETTE: Record<Terrain, PaletteEntry> = {
  grass: {
    base: "#3a5a2a",
    speckles: [
      { color: "#4a6e34", count: 14, size: [1, 2] },
      { color: "#2e4a22", count: 10, size: [1, 1] },
      { color: "#5c8a40", count: 4, size: [1, 1] },
    ],
  },
  dirt: {
    base: "#6b4a2a",
    speckles: [
      { color: "#7d5a36", count: 12, size: [1, 2] },
      { color: "#553a22", count: 10, size: [1, 1] },
    ],
  },
  sand: {
    base: "#c8a86a",
    speckles: [
      { color: "#d8b878", count: 14, size: [1, 2] },
      { color: "#a88850", count: 8, size: [1, 1] },
    ],
  },
  snow: {
    base: "#d8d8e0",
    speckles: [
      { color: "#ffffff", count: 18, size: [1, 2] },
      { color: "#b8c0d0", count: 6, size: [1, 1] },
    ],
  },
  forest: {
    base: "#1a3a1a",
    speckles: [
      { color: "#234a23", count: 12, size: [1, 2] },
      { color: "#0e2210", count: 8, size: [1, 1] },
    ],
  },
  mountain: {
    base: "#5a4a3a",
    speckles: [
      { color: "#6e5c46", count: 10, size: [1, 2] },
      { color: "#3e3024", count: 12, size: [1, 1] },
    ],
  },
  water: {
    base: "#2a4a8a",
    speckles: [
      { color: "#3a5ea0", count: 10, size: [1, 2] },
      { color: "#1a3870", count: 8, size: [1, 1] },
    ],
  },
  lava: {
    base: "#a02a10",
    speckles: [
      { color: "#d04020", count: 12, size: [1, 2] },
      { color: "#601a0a", count: 8, size: [1, 1] },
    ],
  },
  rough: {
    base: "#7a6a4a",
    speckles: [
      { color: "#5a4a32", count: 12, size: [1, 2] },
      { color: "#8a7a5c", count: 6, size: [1, 1] },
    ],
  },
};

// Простой детерминированный RNG, чтобы паттерн оставался одинаковым между запусками.
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildTile(terrain: Terrain): HTMLCanvasElement {
  const off = document.createElement("canvas");
  off.width = PATTERN_SIZE;
  off.height = PATTERN_SIZE;
  const oc = off.getContext("2d")!;
  const palette = PALETTE[terrain];
  oc.fillStyle = palette.base;
  oc.fillRect(0, 0, PATTERN_SIZE, PATTERN_SIZE);
  const rng = makeRng(hashString(terrain));
  for (const layer of palette.speckles) {
    oc.fillStyle = layer.color;
    for (let i = 0; i < layer.count; i++) {
      const x = Math.floor(rng() * PATTERN_SIZE);
      const y = Math.floor(rng() * PATTERN_SIZE);
      const s = layer.size[0] + Math.floor(rng() * (layer.size[1] - layer.size[0] + 1));
      oc.fillRect(x, y, s, s);
    }
  }
  return off;
}

function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function getTerrainTile(terrain: Terrain): HTMLCanvasElement | null {
  if (!PALETTE[terrain]) return null;
  let c = cache.get(terrain);
  if (!c) {
    c = buildTile(terrain);
    cache.set(terrain, c);
  }
  return c;
}

// Базовый цвет (для минимапа и других мест без паттернов).
export function getTerrainBaseColor(terrain: Terrain): string {
  return PALETTE[terrain]?.base ?? "#444";
}
