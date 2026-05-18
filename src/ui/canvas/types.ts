import type { Coord, GameMap, Hero, Player, Town } from "../../game/types";

// Контекст рендера карты — общая «доска», на которой работают все слои.
// Каждый слой получает RenderContext + дополнительные специфичные параметры
// (выбранный герой, hover, путь, анимация и т.д.).
export interface RenderContext {
  ctx: CanvasRenderingContext2D;
  map: GameMap;
  heroes: Record<string, Hero>;
  towns: Record<string, Town>;
  players: Record<string, Player>;
  camera: Coord;
  revealed: Record<string, true>;
  visible: Set<string>;
  // Размер канваса в пикселях, чтобы слой не дёргал ctx.canvas.width лишний раз.
  cw: number;
  ch: number;
}
