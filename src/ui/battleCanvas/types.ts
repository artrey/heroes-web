import type { BattleState, Coord } from "../../game/types";

// Контекст рендера боя. Слои получают эту «доску» + специфичные параметры
// (hover, visual override анимации).
export interface BattleRenderContext {
  ctx: CanvasRenderingContext2D;
  battle: BattleState;
  hover: Coord | null;
}

// Визуальные override'ы для стеков на текущем кадре анимации. Заполняется в
// BattleScreen из его rAF-цикла; слои-рендереры лишь применяют их.
export interface BattleVisual {
  // stackId → интерполированная (sub-tile) позиция; иначе используется stack.pos.
  pos: Record<string, Coord>;
  // stackId → коэффициент красного flash'а (0..1). 1 = только что получил урон.
  flash: Record<string, number>;
  // Активный стек, который «делает выпад» к цели. Сдвиг в пикселях канваса.
  lunge: { stackId: string; offX: number; offY: number } | null;
}

export const EMPTY_BATTLE_VISUAL: BattleVisual = { pos: {}, flash: {}, lunge: null };
