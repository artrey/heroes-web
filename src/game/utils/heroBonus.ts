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
  out.spellPower += hero.statBonus?.spellPower ?? 0;
  out.knowledge += hero.statBonus?.knowledge ?? 0;
  return out;
}

export function getEffectiveMaxMP(hero: Hero): number {
  return hero.maxMovePoints + getHeroBonus(hero).movement;
}

// Эффективные магические параметры с учётом бонусов от артефактов.
// statBonus от уровней магию не трогает (уровни дают только +атк/+защ).
export function getEffectiveSpellPower(hero: Hero): number {
  return hero.spellPower + getHeroBonus(hero).spellPower;
}
export function getEffectiveKnowledge(hero: Hero): number {
  return hero.knowledge + getHeroBonus(hero).knowledge;
}
// maxMana = (база + 10 за каждое очко знаний из артефактов) × (1 + сумма множителей%).
export function getEffectiveMaxMana(hero: Hero): number {
  const b = getHeroBonus(hero);
  const fromKnowledge = hero.maxMana + b.knowledge * 10;
  return Math.round(fromKnowledge * (1 + b.manaMult / 100));
}
