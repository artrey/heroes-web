import { BATTLE_H, BATTLE_W } from "../../game/battle/engine";

// Геометрия боевого поля в пикселях. Канвас фиксированной ширины/высоты,
// 20px отступ по краям, дальше сетка 56×48 на клетку.
export const HEX_W = 56;
export const HEX_H = 48;
export const FIELD_PAD = 20;
export const FIELD_W = HEX_W * BATTLE_W + FIELD_PAD * 2;
export const FIELD_H = HEX_H * BATTLE_H + FIELD_PAD * 2;

// Перевод координаты клетки → центр в пикселях канваса. Используется и для
// рисования, и для расчёта вектора «выпада» атакующего.
export function cellCenter(x: number, y: number): { cx: number; cy: number } {
  return {
    cx: FIELD_PAD + x * HEX_W + HEX_W / 2,
    cy: FIELD_PAD + y * HEX_H + HEX_H / 2,
  };
}

// Top-left угол клетки в пикселях канваса.
export function cellTopLeft(x: number, y: number): { px: number; py: number } {
  return { px: FIELD_PAD + x * HEX_W, py: FIELD_PAD + y * HEX_H };
}
