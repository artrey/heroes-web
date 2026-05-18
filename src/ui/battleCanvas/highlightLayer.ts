import { activeStack, reachable } from "../../game/battle/engine";
import { cellTopLeft, HEX_H, HEX_W } from "./constants";
import type { BattleRenderContext } from "./types";

// Слой подсветки клеток:
//   - reachable активного стека (полупрозрачная заливка цветом стороны);
//   - reachable hover-стека (если он не активный) — обводкой, чтобы не мешать;
//   - hover-рамка под курсором.
export function drawHighlightLayer(rc: BattleRenderContext): void {
  const { ctx, battle, hover } = rc;
  const act = activeStack(battle);

  // Доступные клетки активного.
  if (act) {
    const reach = reachable(battle, act);
    ctx.fillStyle = act.side === "attacker" ? "rgba(95,168,80,0.18)" : "rgba(196,64,48,0.18)";
    for (const k of reach.keys()) {
      const [x, y] = k.split(",").map(Number);
      const { px, py } = cellTopLeft(x, y);
      ctx.fillRect(px, py, HEX_W, HEX_H);
    }
  }
  // Зона hover-стека.
  const hoverStack = hover ? battle.stacks.find(s => s.count > 0 && s.pos.x === hover.x && s.pos.y === hover.y) : null;
  if (hoverStack && hoverStack.id !== act?.id) {
    const reach = reachable(battle, hoverStack);
    ctx.strokeStyle = hoverStack.side === "attacker" ? "rgba(120,200,110,0.7)" : "rgba(220,110,90,0.7)";
    ctx.lineWidth = 1.5;
    for (const k of reach.keys()) {
      const [x, y] = k.split(",").map(Number);
      const { px, py } = cellTopLeft(x, y);
      ctx.strokeRect(px + 2, py + 2, HEX_W - 4, HEX_H - 4);
    }
    ctx.lineWidth = 1;
  }

  // Hover-рамка.
  if (hover) {
    const { px, py } = cellTopLeft(hover.x, hover.y);
    ctx.strokeStyle = "#ffd966";
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 1, py + 1, HEX_W - 2, HEX_H - 2);
    ctx.lineWidth = 1;
  }
}
