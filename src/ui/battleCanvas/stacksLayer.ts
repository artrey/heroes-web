import { activeStack } from "../../game/battle/engine";
import { FIELD_PAD, HEX_H, HEX_W } from "./constants";
import { drawBattleStack } from "./tokens";
import type { BattleRenderContext, BattleVisual } from "./types";

// Слой стеков. Поверх каждого:
//   - тень/токен/обводка/HP-bar (см. drawBattleStack);
//   - визуальный override pos (анимация перемещения, sub-tile);
//   - сдвиг «выпада» к цели (lunge, активный стек при ударе/выстреле);
//   - красный flash при получении урона.
export function drawStacksLayer(rc: BattleRenderContext, visual: BattleVisual): void {
  const { ctx, battle } = rc;
  const act = activeStack(battle);
  for (const s of battle.stacks) {
    if (s.count <= 0) continue;
    // Визуальная позиция: интерполированная (sub-tile) или дискретная.
    const visualCell = visual.pos[s.id] ?? s.pos;
    let cx = FIELD_PAD + visualCell.x * HEX_W + HEX_W / 2;
    let cy = FIELD_PAD + visualCell.y * HEX_H + HEX_H / 2;
    // «Выпад» к цели — добавляется поверх позиции, только активному.
    if (visual.lunge && visual.lunge.stackId === s.id) {
      cx += visual.lunge.offX;
      cy += visual.lunge.offY;
    }
    drawBattleStack(ctx, battle, s, cx, cy, act?.id === s.id, visual);
  }
}
