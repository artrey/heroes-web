import { BATTLE_H, BATTLE_W } from "../../game/battle/engine";
import { cellTopLeft, HEX_H, HEX_W } from "./constants";
import type { BattleRenderContext } from "./types";

// Слой поля: земляной фон с градиентом + мягкая шахматка + лёгкая сетка.
export function drawFieldLayer(rc: BattleRenderContext): void {
  const { ctx } = rc;
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  // Земляной фон с лёгким градиентом сверху вниз.
  const bgGrad = ctx.createLinearGradient(0, 0, 0, ch);
  bgGrad.addColorStop(0, "#403628");
  bgGrad.addColorStop(1, "#2c241a");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, cw, ch);
  // Мягкая шахматка через полупрозрачные оверлеи — заметно, но не рябит.
  for (let y = 0; y < BATTLE_H; y++) {
    for (let x = 0; x < BATTLE_W; x++) {
      const { px, py } = cellTopLeft(x, y);
      const isEven = (x + y) % 2 === 0;
      ctx.fillStyle = isEven ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.06)";
      ctx.fillRect(px, py, HEX_W, HEX_H);
      ctx.strokeStyle = "rgba(0,0,0,0.22)";
      ctx.strokeRect(px + 0.5, py + 0.5, HEX_W - 1, HEX_H - 1);
    }
  }
}
