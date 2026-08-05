// HP-полоска и облегчённые «токены» (тень/обводка), которые используются слоями
// боевого канваса. Сюда же помещаем рисование одного боевого стека — он сложный
// (несколько слоёв одного объекта), поэтому удобно держать функцию отдельно.

import { UNITS } from "../../game/data/units";
import type { BattleStack, BattleState } from "../../game/types";
import { darken, lighten } from "../canvas/colors";
import { drawSprite, unitSprite } from "../gameArt";
import type { BattleVisual } from "./types";

export function drawHpBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  pct: number,
): void {
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = "#2a2018";
  ctx.fillRect(x, y, w, h);
  const color = pct > 0.6 ? "#5fa850" : pct > 0.3 ? "#d4a64a" : "#c44030";
  ctx.fillStyle = color;
  ctx.fillRect(x, y, Math.max(0, w * pct), h);
}

// Полный токен боевого стека: тень → круг с градиентом → обводка → подсветка
// активного → HP-bar → портрет → бейдж с числом → flash урона.
// cx/cy — центр в пикселях канваса (после учёта sub-tile позиции и «выпада»).
export function drawBattleStack(
  ctx: CanvasRenderingContext2D,
  battle: BattleState,
  s: BattleStack,
  cx: number,
  cy: number,
  isActive: boolean,
  visual: BattleVisual,
): void {
  const unit = UNITS[s.unitId];
  const baseColor = s.side === "attacker" ? "#3a7a30" : "#8a3020";
  // Тень под жетоном.
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + 16, 17, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Фоновый круг — радиальный градиент по стороне.
  const tokenGrad = ctx.createRadialGradient(cx - 6, cy - 6, 0, cx, cy, 19);
  tokenGrad.addColorStop(0, lighten(baseColor, 0.35));
  tokenGrad.addColorStop(1, darken(baseColor, 0.3));
  ctx.fillStyle = tokenGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = darken(baseColor, 0.5);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Подсветка активного.
  if (isActive) {
    ctx.strokeStyle = "#ffd966";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, 20, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.lineWidth = 1;
  // HP-полоса — для верхнего юнита стека (а не всего стека), иначе на больших
  // стеках мощный удар почти не двигает полоску.
  const sideBonus = s.side === "attacker" ? battle.attackerBonus : battle.defenderBonus;
  const effUnitHp = Math.max(1, unit.hp + sideBonus.hpBonus);
  const hpPct = Math.max(0, Math.min(1, s.hp / effUnitHp));
  drawHpBar(ctx, cx - 16, cy - 22, 32, 4, hpPct);
  drawSprite(ctx, unitSprite(unit.id), cx, cy - 2, 34);
  // Число существ.
  ctx.font = "bold 11px sans-serif";
  const txt = String(s.count);
  const tw = ctx.measureText(txt).width;
  ctx.fillStyle = "rgba(0,0,0,0.78)";
  ctx.fillRect(cx - tw / 2 - 4, cy + 11, tw + 8, 13);
  ctx.fillStyle = "#fff";
  ctx.fillText(txt, cx, cy + 18);
  // Красный flash при получении урона — поверх жетона. phase=1 в момент удара → 0.
  const flashPhase = visual.flash[s.id];
  if (flashPhase) {
    ctx.save();
    ctx.fillStyle = `rgba(255, 64, 48, ${0.55 * flashPhase})`;
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
