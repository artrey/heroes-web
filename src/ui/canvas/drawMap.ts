import type { Coord, GameMap, Hero, Player, Town } from "../../game/types";
import { drawHeroesLayer } from "./heroesLayer";
import { drawHoverLayer } from "./hoverLayer";
import { drawMinimapLayer } from "./minimapLayer";
import { drawObjectsLayer } from "./objectsLayer";
import { drawPathLayer } from "./pathLayer";
import { drawTerrainLayer } from "./terrainLayer";
import type { RenderContext } from "./types";

// Точка входа для отрисовки карты приключений. Композирует слои в фиксированном
// порядке: terrain (фон) → objects (включая большие плашки замков) → heroes →
// path под курсором → hover-рамка + ZoC → minimap (поверх всего в углу).
//
// Анимация передаётся как `heroVisualPos` (sub-tile координаты для конкретных
// героев) — это единственный канал для интерполированного рендера. Сам цикл
// rAF живёт в AdventureScreen, чтобы canvas-слои оставались чистыми функциями.
export interface DrawMapParams {
  map: GameMap;
  heroes: Record<string, Hero>;
  towns: Record<string, Town>;
  players: Record<string, Player>;
  camera: Coord;
  revealed: Record<string, true>;
  visible: Set<string>;
  hoverPath: Coord[] | null;
  hoverTile: Coord | null;
  selectedHeroId: string | null;
  danger: { cells: Set<string>; sources: Set<string> };
  heroVisualPos: Record<string, Coord>;
}

export function drawMap(ctx: CanvasRenderingContext2D, params: DrawMapParams): void {
  const rc: RenderContext = {
    ctx,
    map: params.map,
    heroes: params.heroes,
    towns: params.towns,
    players: params.players,
    camera: params.camera,
    revealed: params.revealed,
    visible: params.visible,
    cw: ctx.canvas.width,
    ch: ctx.canvas.height,
  };
  drawTerrainLayer(rc);
  drawObjectsLayer(rc);
  drawHeroesLayer(rc, params.selectedHeroId, params.heroVisualPos);
  drawPathLayer(rc, params.hoverPath, params.selectedHeroId);
  drawHoverLayer(rc, params.hoverTile, params.danger);
  drawMinimapLayer(rc);
}
