import { getTerrainBaseColor } from "../terrainPatterns";
import { TILE_SIZE } from "./constants";
import type { RenderContext } from "./types";

// Геометрия минимапа — используется и при отрисовке, и при ловле кликов в
// AdventureScreen (resolving клика к координате карты).
export function getMinimapBounds(mapWidth: number, mapHeight: number, cw: number, ch: number) {
  const mmSize = 160;
  const px = Math.max(1, Math.floor(mmSize / Math.max(mapWidth, mapHeight)));
  const mmW = px * mapWidth;
  const mmH = px * mapHeight;
  const ox = cw - mmW - 12;
  const oy = ch - mmH - 12;
  return { px, mmW, mmH, ox, oy };
}

// Слой минимапы в правом нижнем углу. Зависит от FoG: невиданные клетки чёрные,
// «память» затемняется, объекты-владения (города/шахты) показываются цветом владельца.
export function drawMinimapLayer(rc: RenderContext): void {
  const { ctx, map, heroes, towns, players, camera, revealed, visible, cw, ch } = rc;
  const { px, mmW, mmH, ox, oy } = getMinimapBounds(map.width, map.height, cw, ch);
  // Контейнер минимапа: подложка + золотая обводка, чтобы не сливалась с тёмным буфером карты.
  ctx.fillStyle = "rgba(0,0,0,0.78)";
  ctx.fillRect(ox - 6, oy - 6, mmW + 12, mmH + 12);
  ctx.strokeStyle = "#d4a64a";
  ctx.lineWidth = 2;
  ctx.strokeRect(ox - 6 + 0.5, oy - 6 + 0.5, mmW + 12 - 1, mmH + 12 - 1);
  ctx.lineWidth = 1;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const key = `${x},${y}`;
      if (revealed[key] !== true) {
        ctx.fillStyle = "#000";
        ctx.fillRect(ox + x * px, oy + y * px, px, px);
        continue;
      }
      const t = map.tiles[y * map.width + x];
      ctx.fillStyle = t.passable ? getTerrainBaseColor(t.terrain) : "#222";
      ctx.fillRect(ox + x * px, oy + y * px, px, px);
      if (!visible.has(key)) {
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(ox + x * px, oy + y * px, px, px);
      }
    }
  }
  // Города, шахты и герои на минимапе — с учётом тумана.
  for (const tw of Object.values(towns)) {
    if (revealed[`${tw.pos.x},${tw.pos.y}`] !== true) continue;
    const owner = tw.ownerId ? (players[tw.ownerId]?.color ?? "#fff") : "#999";
    ctx.fillStyle = owner;
    ctx.fillRect(ox + tw.pos.x * px - 1, oy + tw.pos.y * px - 1, px + 2, px + 2);
  }
  for (const obj of Object.values(map.objects)) {
    if (obj.kind !== "mine" || !obj.ownerId) continue;
    if (revealed[`${obj.pos.x},${obj.pos.y}`] !== true) continue;
    ctx.fillStyle = players[obj.ownerId]?.color ?? "#fff";
    ctx.fillRect(ox + obj.pos.x * px, oy + obj.pos.y * px, px, px);
  }
  for (const h of Object.values(heroes)) {
    if (!visible.has(`${h.pos.x},${h.pos.y}`)) continue;
    ctx.fillStyle = players[h.ownerId]?.color ?? "#fff";
    ctx.fillRect(ox + h.pos.x * px, oy + h.pos.y * px, px, px);
  }
  // Рамка вьюпорта — клипуем к границам карты, иначе из-за паддинга
  // рамка может выходить за пределы минимапа.
  const wx0 = Math.max(0, camera.x / TILE_SIZE);
  const wy0 = Math.max(0, camera.y / TILE_SIZE);
  const wx1 = Math.min(map.width, (camera.x + cw) / TILE_SIZE);
  const wy1 = Math.min(map.height, (camera.y + ch) / TILE_SIZE);
  if (wx1 > wx0 && wy1 > wy0) {
    ctx.strokeStyle = "#ffd966";
    ctx.strokeRect(ox + wx0 * px, oy + wy0 * px, (wx1 - wx0) * px, (wy1 - wy0) * px);
  }
}
