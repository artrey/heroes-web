import type { BattleState, Coord } from "../../game/types";
import { drawFieldLayer } from "./fieldLayer";
import { drawHighlightLayer } from "./highlightLayer";
import { drawObstaclesLayer } from "./obstaclesLayer";
import { drawStacksLayer } from "./stacksLayer";
import { EMPTY_BATTLE_VISUAL } from "./types";
import type { BattleRenderContext, BattleVisual } from "./types";

// Точка входа для отрисовки боевого экрана. Композирует слои в фиксированном
// порядке: field (фон + шахматка) → highlights (доступные клетки + hover) →
// obstacles → stacks (поверх всего).
export function drawBattle(
  ctx: CanvasRenderingContext2D,
  battle: BattleState | null,
  hover: Coord | null,
  visual: BattleVisual = EMPTY_BATTLE_VISUAL,
): void {
  if (!battle) return;
  const rc: BattleRenderContext = { ctx, battle, hover };
  drawFieldLayer(rc);
  drawHighlightLayer(rc);
  drawObstaclesLayer(rc);
  drawStacksLayer(rc, visual);
}
