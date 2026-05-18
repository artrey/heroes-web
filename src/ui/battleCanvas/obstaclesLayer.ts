import { cellCenter } from "./constants";
import type { BattleRenderContext } from "./types";

// Слой препятствий — отдельный, чтобы фигурки стэков всегда рисовались поверх.
export function drawObstaclesLayer(rc: BattleRenderContext): void {
  const { ctx, battle } = rc;
  for (const obs of battle.obstacles) {
    const { cx, cy } = cellCenter(obs.pos.x, obs.pos.y);
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 12, 18, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.font = "28px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.fillText(obs.icon, cx, cy);
  }
}
