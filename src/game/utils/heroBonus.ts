import { ARTIFACTS, EMPTY_BONUS } from "../data/artifacts";
import type { Hero, HeroBonus } from "../types";

// Суммирует характеристики героя: базу + прирост от уровней + бонусы со всех
// экипированных артефактов. Backpack не учитывается. Поля spellPower/knowledge/
// manaMult оживают только при наличии артефактов — база магии вынесена в hero.*.
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
  // База героя.
  out.attack += hero.attack ?? 0;
  out.defense += hero.defense ?? 0;
  out.spellPower += hero.spellPower ?? 0;
  out.knowledge += hero.knowledge ?? 0;
  // Прирост от уровней.
  out.attack += hero.statBonus?.attack ?? 0;
  out.defense += hero.statBonus?.defense ?? 0;
  out.spellPower += hero.statBonus?.spellPower ?? 0;
  out.knowledge += hero.statBonus?.knowledge ?? 0;
  return out;
}

export function getEffectiveMaxMP(hero: Hero): number {
  return hero.maxMovePoints + getHeroBonus(hero).movement;
}

// Эффективные характеристики = суммы из getHeroBonus (база + уровни + артефакты).
export function getEffectiveAttack(hero: Hero): number {
  return getHeroBonus(hero).attack;
}
export function getEffectiveDefense(hero: Hero): number {
  return getHeroBonus(hero).defense;
}
export function getEffectiveSpellPower(hero: Hero): number {
  return getHeroBonus(hero).spellPower;
}
export function getEffectiveKnowledge(hero: Hero): number {
  return getHeroBonus(hero).knowledge;
}
// maxMana = знания × 10 × (1 + множители% от артефактов).
export function getEffectiveMaxMana(hero: Hero): number {
  const b = getHeroBonus(hero);
  return Math.round(b.knowledge * 10 * (1 + b.manaMult / 100));
}
