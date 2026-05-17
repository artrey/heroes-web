import type { SpellDef } from "../types";

// Минимальный сбалансированный набор. Уровни 1..3 — по два заклинания каждой:
// одно атакующее, одно поддерживающее/контролирующее.
//
// Формулы:
// - Урон: base + perPower * spellPower.
// - Бафф/дебафф: basePower — на сколько меняется параметр (perPower обычно 0).
// Эффекты длятся до конца боя (минимум, без подсчёта длительности).

export const SPELLS: Record<string, SpellDef> = {
  magicArrow: {
    id: "magicArrow",
    name: "Магическая стрела",
    icon: "🏹",
    level: 1,
    school: "air",
    target: "enemy",
    effect: "damage",
    manaCost: 5,
    basePower: 10,
    perPower: 10,
    description: "Бьёт во вражеский стек. Урон: 10 + 10×Сила.",
  },
  bless: {
    id: "bless",
    name: "Благословение",
    icon: "✨",
    level: 1,
    school: "light",
    target: "ally",
    effect: "buffAttack",
    manaCost: 5,
    basePower: 3,
    perPower: 0,
    description: "Союзный стек: +3 к атаке до конца боя.",
  },

  lightningBolt: {
    id: "lightningBolt",
    name: "Молния",
    icon: "⚡",
    level: 2,
    school: "air",
    target: "enemy",
    effect: "damage",
    manaCost: 10,
    basePower: 25,
    perPower: 25,
    description: "Удар молнией. Урон: 25 + 25×Сила.",
  },
  haste: {
    id: "haste",
    name: "Ускорение",
    icon: "🌪️",
    level: 2,
    school: "air",
    target: "ally",
    effect: "buffSpeed",
    manaCost: 6,
    basePower: 3,
    perPower: 0,
    description: "Союзный стек: +3 к скорости до конца боя.",
  },

  inferno: {
    id: "inferno",
    name: "Инферно",
    icon: "🔥",
    level: 3,
    school: "fire",
    target: "enemy",
    effect: "damage",
    manaCost: 15,
    basePower: 40,
    perPower: 30,
    description: "Огненный шар. Урон: 40 + 30×Сила.",
  },
  slow: {
    id: "slow",
    name: "Замедление",
    icon: "🐌",
    level: 3,
    school: "earth",
    target: "enemy",
    effect: "debuffSpeed",
    manaCost: 8,
    basePower: 3,
    perPower: 0,
    description: "Вражеский стек: −3 к скорости до конца боя.",
  },
};

export const SPELL_LIST: SpellDef[] = Object.values(SPELLS);

export function getSpell(id: string): SpellDef | undefined {
  return SPELLS[id];
}

// Все id заклинаний уровней <= level.
export function spellsUpToLevel(level: number): string[] {
  return SPELL_LIST.filter(s => s.level <= level).map(s => s.id);
}
