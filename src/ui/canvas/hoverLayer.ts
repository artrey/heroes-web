import type { Coord } from "../../game/types";
import { TILE_SIZE } from "./constants";
import type { RenderContext } from "./types";

// Слой hover-индикации: жёлтая рамка под курсором + подсветка зоны контроля
// (ZoC). Логика:
//   - hover над danger-cell (под охраной) → красные обводки соседних source-тайлов;
//   - hover над самим source (монстр/вражеский герой) → подсветка всех его danger cells.
export function drawHoverLayer(
  rc: RenderContext,
  hoverTile: Coord | null,
  danger: { cells: Set<string>; sources: Set<string> },
): void {
  if (!hoverTile) return;
  const { ctx, camera } = rc;
  // Сам hover-rect.
  const sx = hoverTile.x * TILE_SIZE - camera.x;
  const sy = hoverTile.y * TILE_SIZE - camera.y;
  ctx.strokeStyle = "#ffd966";
  ctx.lineWidth = 2;
  ctx.strokeRect(sx + 1, sy + 1, TILE_SIZE - 2, TILE_SIZE - 2);
  ctx.lineWidth = 1;

  // Danger / source подсветка.
  const hKey = `${hoverTile.x},${hoverTile.y}`;
  const guards: Coord[] = [];
  const guardedCells: Coord[] = [];
  if (danger.cells.has(hKey)) {
    for (const srcKey of danger.sources) {
      const [gx, gy] = srcKey.split(",").map(Number);
      if (Math.max(Math.abs(gx - hoverTile.x), Math.abs(gy - hoverTile.y)) === 1) {
        guards.push({ x: gx, y: gy });
      }
    }
  } else if (danger.sources.has(hKey)) {
    for (const cellKey of danger.cells) {
      const [cx, cy] = cellKey.split(",").map(Number);
      if (Math.max(Math.abs(cx - hoverTile.x), Math.abs(cy - hoverTile.y)) === 1) {
        guardedCells.push({ x: cx, y: cy });
      }
    }
    guards.push(hoverTile);
  }
  for (const c of guardedCells) {
    const gx = c.x * TILE_SIZE - camera.x;
    const gy = c.y * TILE_SIZE - camera.y;
    ctx.fillStyle = "rgba(220,60,40,0.18)";
    ctx.fillRect(gx, gy, TILE_SIZE, TILE_SIZE);
  }
  for (const g of guards) {
    const gx = g.x * TILE_SIZE - camera.x;
    const gy = g.y * TILE_SIZE - camera.y;
    ctx.strokeStyle = "#ff5040";
    ctx.lineWidth = 2.5;
    ctx.strokeRect(gx + 1, gy + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    ctx.lineWidth = 1;
  }
}
