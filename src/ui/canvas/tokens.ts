// Низкоуровневые «токены» — кирпичики для слоёв-рендереров. Здесь только
// рисование одного элемента в координатах канваса; знаний о GameState нет.

import { darken, lighten } from "./colors";
import { TILE_SIZE } from "./constants";

// Эмодзи / любой текст по центру (cx, cy) заданного размера.
export function drawEmoji(ctx: CanvasRenderingContext2D, txt: string, cx: number, cy: number, size: number): void {
  ctx.font = `${size}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";
  ctx.fillText(txt, cx, cy);
}

// Лёгкая овальная тень под объектом без подложки (ресурсы, артефакты, сундуки).
export function drawObjectShadow(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + TILE_SIZE / 3, TILE_SIZE / 3, TILE_SIZE / 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Подложка под шахту/жилище-1×1: чуть приподнятый квадрат с градиентом-крышей
// и тенью под собой.
export function drawBuildingPlaque(ctx: CanvasRenderingContext2D, sx: number, sy: number, color: string): void {
  const pad = 2;
  const grad = ctx.createLinearGradient(sx, sy, sx, sy + TILE_SIZE);
  grad.addColorStop(0, lighten(color, 0.25));
  grad.addColorStop(1, darken(color, 0.3));
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(sx + pad + 1, sy + TILE_SIZE - 4, TILE_SIZE - 2 * pad - 2, 3);
  ctx.restore();
  ctx.fillStyle = grad;
  ctx.fillRect(sx + pad, sy + pad, TILE_SIZE - 2 * pad, TILE_SIZE - 2 * pad);
  ctx.strokeStyle = darken(color, 0.55);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(sx + pad + 0.5, sy + pad + 0.5, TILE_SIZE - 2 * pad - 1, TILE_SIZE - 2 * pad - 1);
  ctx.lineWidth = 1;
}

// Большая плашка замка (по умолчанию 3×2 клетки). Полностью покрывает футпринт,
// чтобы сетка тайлов не выпирала из-под краёв. Сверху — зубцы стены (внутри плитки),
// снизу — тень, под entry-tile золотая полоска как маркер точки входа.
export function drawTownPlaque(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  w: number,
  h: number,
  color: string,
): void {
  // Сначала тёмный фон под плиткой, чтобы перекрыть линии сетки `0,0,0,0.18`,
  // нанесённые слоем террейна по каждому тайлу.
  ctx.fillStyle = "#0a0806";
  ctx.fillRect(sx, sy, w, h);
  // Корпус — крепостная стена.
  const grad = ctx.createLinearGradient(sx, sy, sx, sy + h);
  grad.addColorStop(0, lighten(color, 0.3));
  grad.addColorStop(0.55, color);
  grad.addColorStop(1, darken(color, 0.4));
  ctx.fillStyle = grad;
  ctx.fillRect(sx, sy, w, h);
  // Зубцы стены — ВНУТРИ плитки, чтобы не торчали вверх в чужой тайл.
  ctx.fillStyle = darken(color, 0.45);
  const merlonCount = 4;
  const merlonW = Math.floor(w / 10);
  const gap = Math.floor(w / 18);
  const startX = sx + (w - (merlonCount * merlonW + (merlonCount - 1) * gap)) / 2;
  for (let i = 0; i < merlonCount; i++) {
    ctx.fillRect(startX + i * (merlonW + gap), sy + 3, merlonW, 6);
  }
  // Тень у основания (внутри плитки).
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(sx + 4, sy + h - 5, w - 8, 3);
  // Внешняя обводка по всему контуру плитки.
  ctx.strokeStyle = darken(color, 0.6);
  ctx.lineWidth = 2;
  ctx.strokeRect(sx + 1, sy + 1, w - 2, h - 2);
  // Подчёркиваем нижний (entry) тайл лёгкой золотой полоской — точка входа.
  ctx.strokeStyle = "rgba(212, 166, 74, 0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx + w / 2 - TILE_SIZE / 2 + 4, sy + h - 3);
  ctx.lineTo(sx + w / 2 + TILE_SIZE / 2 - 4, sy + h - 3);
  ctx.stroke();
  ctx.lineWidth = 1;
}

// Маркер «здание сегодня уже построено» — небольшой кружок в правом верхнем углу
// тайла города с «✓». На карте сразу видно, что сегодня тут больше нельзя строить.
export function drawBuiltTodayBadge(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
  const x = sx + TILE_SIZE - 6;
  const y = sy + 6;
  ctx.fillStyle = "rgba(0,0,0,0.85)";
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#5fa850";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.fillStyle = "#5fa850";
  ctx.font = "bold 9px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("✓", x, y + 1);
}

// Жетон героя: тёмный круг под цветным фоном владельца с радиальным градиентом,
// тонкой обводкой, тенью под собой и пульсирующей подсветкой для выбранного.
export function drawHeroToken(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  color: string,
  isSelected: boolean,
): void {
  const r = TILE_SIZE / 2 - 3;
  // Тень.
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + r - 2, r - 2, r / 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Основной круг — радиальный градиент.
  const grad = ctx.createRadialGradient(cx - r / 3, cy - r / 3, 0, cx, cy, r);
  grad.addColorStop(0, lighten(color, 0.35));
  grad.addColorStop(1, darken(color, 0.25));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  // Обводка.
  ctx.strokeStyle = darken(color, 0.5);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  if (isSelected) {
    ctx.strokeStyle = "#ffd966";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 1, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.lineWidth = 1;
}
