import { ARTIFACTS, EMPTY_BONUS } from "../data/artifacts";
import type { Hero, HeroBonus } from "../types";

// Суммирует бонусы со всех экипированных артефактов героя + прирост за уровни.
// Backpack не учитывается.
export function getHeroBonus(hero: Hero): HeroBonus {
  const out: HeroBonus = { ...EMPTY_BONUS };
  for (const id of Object.values(hero.artifacts.equipped)) {
    if (!id) continue;
    const def = ARTIFACTS[id];
    if (!def) continue;
    for (const k of Object.keys(def.bonus) as Array<keyof HeroBonus>) {
      out[k] += def.bonus[k] ?? 0;
    }
  }
  out.attack += hero.statBonus?.attack ?? 0;
  out.defense += hero.statBonus?.defense ?? 0;
  return out;
}

export function getEffectiveMaxMP(hero: Hero): number {
  return hero.maxMovePoints + getHeroBonus(hero).movement;
}
