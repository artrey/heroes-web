import type { Resource } from "../types";

// Курс обмена: сколько единиц `from` нужно отдать за 1 единицу `to`.
// Простая таблица для прототипа, навеяна логикой HoMM3 (сырьё дешёвое,
// редкое дорогое; за золото платим больше, чем получаем при обратной операции).
const RATE: Record<Resource, Partial<Record<Resource, number>>> = {
  gold: { wood: 500, ore: 500, mercury: 2500, sulfur: 2500, crystal: 2500, gems: 2500 },
  wood: { gold: 0.004, ore: 1, mercury: 4, sulfur: 4, crystal: 4, gems: 4 },
  ore: { gold: 0.004, wood: 1, mercury: 4, sulfur: 4, crystal: 4, gems: 4 },
  mercury: { gold: 0.001, wood: 0.25, ore: 0.25, sulfur: 1, crystal: 1, gems: 1 },
  sulfur: { gold: 0.001, wood: 0.25, ore: 0.25, mercury: 1, crystal: 1, gems: 1 },
  crystal: { gold: 0.001, wood: 0.25, ore: 0.25, mercury: 1, sulfur: 1, gems: 1 },
  gems: { gold: 0.001, wood: 0.25, ore: 0.25, mercury: 1, sulfur: 1, crystal: 1 },
};

// Сколько ресурса from нужно отдать, чтобы получить qty штук to.
// null если обмен не определён или from === to.
export function rateFor(from: Resource, to: Resource, qty: number): number | null {
  if (from === to) return null;
  const r = RATE[from]?.[to];
  if (r === undefined) return null;
  return Math.ceil(r * qty);
}

// Обратный расчёт: сколько to мы получим, отдав exact qty штук from.
// При курсе 0.004 (1 wood → 250 gold) и qty=4 wood → 1000 gold.
export function reverseRate(from: Resource, to: Resource, qtyOfFrom: number): number {
  if (from === to) return 0;
  const r = RATE[from]?.[to];
  if (r === undefined || r === 0) return 0;
  return Math.floor(qtyOfFrom / r);
}
