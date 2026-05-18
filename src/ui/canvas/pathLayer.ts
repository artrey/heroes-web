import type { Coord } from "../../game/types";
import { stepCost } from "../../game/utils/pathfind";
import { TILE_SIZE } from "./constants";
import type { RenderContext } from "./types";

// Слой подсветки пути под курсором: жёлтые точки на достижимых клетках,
// красные — там, где у героя уже не хватит MP. Считаем стоимость инкрементально
// от позиции героя.
export function drawPathLayer(rc: RenderContext, hoverPath: Coord[] | null, selectedHeroId: string | null): void {
  if (!hoverPath || hoverPath.length === 0 || !selectedHeroId) return;
  const { ctx, heroes, camera } = rc;
  const hero = heroes[selectedHeroId];
  if (!hero) return;
  let prev = hero.pos;
  let mp = hero.movePoints;
  for (const p of hoverPath) {
    const dx = Math.abs(p.x - prev.x);
    const dy = Math.abs(p.y - prev.y);
    const cost = stepCost(dx, dy);
    const reachable = mp >= cost;
    mp -= cost;
    const sx = p.x * TILE_SIZE - camera.x + TILE_SIZE / 2;
    const sy = p.y * TILE_SIZE - camera.y + TILE_SIZE / 2;
    ctx.fillStyle = reachable ? "rgba(255, 220, 80, 0.7)" : "rgba(255, 80, 80, 0.6)";
    ctx.beginPath();
    ctx.arc(sx, sy, 5, 0, Math.PI * 2);
    ctx.fill();
    prev = p;
  }
}
