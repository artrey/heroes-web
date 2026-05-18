import { getTerrainTile } from "../terrainPatterns";
import { TERRAIN_COLOR, TILE_SIZE } from "./constants";
import type { RenderContext } from "./types";

// Слой террейна: фон + тайлы + сетка + туман войны.
//   - Никогда не видели клетку → оставляем чёрный фон (значение «неизвестно»).
//   - Видели когда-то, но сейчас не в обзоре → рисуем тайл и затемняем как «память».
//   - В обзоре → тайл + лёгкая сетка для читаемости.
export function drawTerrainLayer(rc: RenderContext): void {
  const { ctx, map, camera, revealed, visible, cw, ch } = rc;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, cw, ch);

  const startX = Math.max(0, Math.floor(camera.x / TILE_SIZE));
  const endX = Math.min(map.width, Math.ceil((camera.x + cw) / TILE_SIZE));
  const startY = Math.max(0, Math.floor(camera.y / TILE_SIZE));
  const endY = Math.min(map.height, Math.ceil((camera.y + ch) / TILE_SIZE));

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const t = map.tiles[y * map.width + x];
      const sx = x * TILE_SIZE - camera.x;
      const sy = y * TILE_SIZE - camera.y;
      const key = `${x},${y}`;
      const isRevealed = revealed[key] === true;
      if (!isRevealed) continue; // чёрный фон уже залит
      const tile = getTerrainTile(t.terrain);
      if (tile) {
        ctx.drawImage(tile, sx, sy, TILE_SIZE, TILE_SIZE);
      } else {
        ctx.fillStyle = TERRAIN_COLOR[t.terrain] ?? "#444";
        ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
      }
      ctx.strokeStyle = "rgba(0,0,0,0.18)";
      ctx.strokeRect(sx + 0.5, sy + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
      if (!visible.has(key)) {
        // «Память» — затемнение поверх террейна.
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
      }
    }
  }
}
