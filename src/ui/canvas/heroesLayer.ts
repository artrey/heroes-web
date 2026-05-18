import type { Coord } from "../../game/types";
import { TILE_SIZE } from "./constants";
import { drawEmoji, drawHeroToken } from "./tokens";
import type { RenderContext } from "./types";

// Слой героев. Анимированному герою рисуем по интерполированной (sub-tile)
// позиции, но visible/clipping считаем от его «логической» клетки в state.
export function drawHeroesLayer(
  rc: RenderContext,
  selectedHeroId: string | null,
  heroVisualPos: Record<string, Coord>,
): void {
  const { ctx, heroes, players, camera, visible, cw, ch } = rc;
  for (const h of Object.values(heroes)) {
    if (!visible.has(`${h.pos.x},${h.pos.y}`)) continue;
    const draw = heroVisualPos[h.id] ?? h.pos;
    const sx = draw.x * TILE_SIZE - camera.x;
    const sy = draw.y * TILE_SIZE - camera.y;
    if (sx < -TILE_SIZE || sy < -TILE_SIZE || sx > cw || sy > ch) continue;
    const owner = players[h.ownerId];
    const color = owner?.color ?? "#888";
    const cx = sx + TILE_SIZE / 2;
    const cy = sy + TILE_SIZE / 2;
    drawHeroToken(ctx, cx, cy, color, h.id === selectedHeroId);
    drawEmoji(ctx, h.icon, cx, cy, 22);
  }
}
