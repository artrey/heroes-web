import { RESOURCE_ICONS } from "../../game/utils/resources";
import { TILE_SIZE } from "./constants";
import { drawBuildingPlaque, drawBuiltTodayBadge, drawEmoji, drawObjectShadow, drawTownPlaque } from "./tokens";
import type { RenderContext } from "./types";

// Слой объектов карты. Рисует ровно один объект на итерации (3×2-плитка замка —
// тоже один объект, рисуется как большая плашка с центром в его entry-tile).
// Объекты видимы, если их entry-tile был хоть раз revealed.
export function drawObjectsLayer(rc: RenderContext): void {
  const { ctx, map, towns, players, camera, revealed, cw, ch } = rc;
  for (const obj of Object.values(map.objects)) {
    if (revealed[`${obj.pos.x},${obj.pos.y}`] !== true) continue;
    const sx = obj.pos.x * TILE_SIZE - camera.x;
    const sy = obj.pos.y * TILE_SIZE - camera.y;
    if (sx < -TILE_SIZE || sy < -TILE_SIZE || sx > cw || sy > ch) continue;
    const cx = sx + TILE_SIZE / 2;
    const cy = sy + TILE_SIZE / 2;
    switch (obj.kind) {
      case "dwelling": {
        // Замок 3×2: 3 клетки в ширину, 2 в высоту. Entry — центральная нижняя клетка.
        // Большая плашка перекрывает все 6 клеток футпринта.
        const tw = towns[obj.id];
        const ownerColor = tw?.ownerId ? (players[tw.ownerId]?.color ?? "#888") : "#888";
        const topX = (obj.pos.x - 1) * TILE_SIZE - camera.x;
        const topY = (obj.pos.y - 1) * TILE_SIZE - camera.y;
        const w = 3 * TILE_SIZE;
        const h = 2 * TILE_SIZE;
        drawTownPlaque(ctx, topX, topY, w, h, ownerColor);
        drawEmoji(ctx, obj.icon, topX + w / 2, topY + h / 2 - 2, 48);
        if (tw?.builtToday) drawBuiltTodayBadge(ctx, topX + w - TILE_SIZE, topY);
        break;
      }
      case "mine": {
        if (obj.ownerId) {
          drawBuildingPlaque(ctx, sx, sy, players[obj.ownerId]?.color ?? "#888");
        } else {
          drawObjectShadow(ctx, cx, cy);
        }
        drawEmoji(ctx, obj.icon, cx, cy, 22);
        break;
      }
      case "resource": {
        // Берём текущую иконку из общей таблицы — старые сейвы могут хранить устаревший emoji.
        drawObjectShadow(ctx, cx, cy);
        drawEmoji(ctx, RESOURCE_ICONS[obj.resource], cx, cy, 22);
        break;
      }
      case "monster":
      case "chest":
      case "artifact":
      case "tree":
      case "mountain": {
        drawObjectShadow(ctx, cx, cy);
        drawEmoji(ctx, obj.icon, cx, cy, 22);
        break;
      }
    }
  }
}
