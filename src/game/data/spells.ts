import type { SpellDef } from "../types";

// Каталог заклинаний. По уровням:
//   L1 — 7 заклинаний, гильдия даёт 4 случайных.
//   L2 — 5 заклинаний, гильдия даёт 3 случайных.
//   L3 — 4 заклинаний, гильдия даёт 2 случайных.
//
// Формулы:
// - damage: dmg = basePower + perPower * spellPower.
// - heal:   hp  = basePower + perPower * spellPower (восстанавливает HP верхнего юнита).
// - buff/debuff atk/def/spd: basePower — на сколько меняется параметр, до конца боя.

export const SPELLS: Record<string, SpellDef> = {
  // ===== Уровень 1 =====
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
  iceShard: {
    id: "iceShard",
    name: "Ледяной осколок",
    icon: "❄️",
    level: 1,
    school: "water",
    target: "enemy",
    effect: "damage",
    manaCost: 4,
    basePower: 8,
    perPower: 8,
    description: "Дешёвый ледяной удар. Урон: 8 + 8×Сила.",
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
  shield: {
    id: "shield",
    name: "Щит",
    icon: "🛡️",
    level: 1,
    school: "light",
    target: "ally",
    effect: "buffDefense",
    manaCost: 5,
    basePower: 3,
    perPower: 0,
    description: "Союзный стек: +3 к защите до конца боя.",
  },
  stoneSkin: {
    id: "stoneSkin",
    name: "Каменная кожа",
    icon: "🪨",
    level: 1,
    school: "earth",
    target: "ally",
    effect: "buffDefense",
    manaCost: 7,
    basePower: 5,
    perPower: 0,
    description: "Союзный стек: +5 к защите до конца боя.",
  },
  weakness: {
    id: "weakness",
    name: "Слабость",
    icon: "💀",
    level: 1,
    school: "earth",
    target: "enemy",
    effect: "debuffAttack",
    manaCost: 5,
    basePower: 3,
    perPower: 0,
    description: "Вражеский стек: −3 к атаке до конца боя.",
  },
  cure: {
    id: "cure",
    name: "Исцеление",
    icon: "💚",
    level: 1,
    school: "light",
    target: "ally",
    effect: "heal",
    manaCost: 6,
    basePower: 20,
    perPower: 10,
    description: "Восстанавливает HP верхнего юнита: 20 + 10×Сила.",
  },

  // ===== Уровень 2 =====
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
  fireArrow: {
    id: "fireArrow",
    name: "Огненная стрела",
    icon: "🔥",
    level: 2,
    school: "fire",
    target: "enemy",
    effect: "damage",
    manaCost: 9,
    basePower: 20,
    perPower: 20,
    description: "Раскалённый болт. Урон: 20 + 20×Сила.",
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
  slow: {
    id: "slow",
    name: "Замедление",
    icon: "🐌",
    level: 2,
    school: "earth",
    target: "enemy",
    effect: "debuffSpeed",
    manaCost: 6,
    basePower: 3,
    perPower: 0,
    description: "Вражеский стек: −3 к скорости до конца боя.",
  },
  heal: {
    id: "heal",
    name: "Лечение",
    icon: "✚",
    level: 2,
    school: "light",
    target: "ally",
    effect: "heal",
    manaCost: 10,
    basePower: 40,
    perPower: 20,
    description: "Сильное лечение верхнего юнита: 40 + 20×Сила.",
  },

  // ===== Уровень 3 =====
  inferno: {
    id: "inferno",
    name: "Инферно",
    icon: "🌋",
    level: 3,
    school: "fire",
    target: "enemy",
    effect: "damage",
    manaCost: 15,
    basePower: 40,
    perPower: 30,
    description: "Огненный шар. Урон: 40 + 30×Сила.",
  },
  frostNova: {
    id: "frostNova",
    name: "Ледяная буря",
    icon: "🧊",
    level: 3,
    school: "water",
    target: "enemy",
    effect: "damage",
    manaCost: 14,
    basePower: 35,
    perPower: 25,
    description: "Морозный взрыв. Урон: 35 + 25×Сила.",
  },
  empower: {
    id: "empower",
    name: "Усиление",
    icon: "💪",
    level: 3,
    school: "light",
    target: "ally",
    effect: "buffAttack",
    manaCost: 12,
    basePower: 5,
    perPower: 0,
    description: "Союзный стек: +5 к атаке до конца боя.",
  },
  doom: {
    id: "doom",
    name: "Проклятие",
    icon: "☠️",
    level: 3,
    school: "earth",
    target: "enemy",
    effect: "debuffDefense",
    manaCost: 14,
    basePower: 5,
    perPower: 0,
    description: "Вражеский стек: −5 к защите до конца боя.",
  },
};

export const SPELL_LIST: SpellDef[] = Object.values(SPELLS);

export function getSpell(id: string): SpellDef | undefined {
  return SPELLS[id];
}

// Сколько заклинаний выдаёт гильдия каждого уровня. Берутся случайно из ещё не
// выученных в этом городе заклинаний соответствующего уровня.
const GUILD_PICK_COUNT: Record<1 | 2 | 3, number> = { 1: 4, 2: 3, 3: 2 };

export function rollSpellsForGuildLevel(level: 1 | 2 | 3, alreadyKnown: string[]): string[] {
  const want = GUILD_PICK_COUNT[level];
  const known = new Set(alreadyKnown);
  const pool = SPELL_LIST.filter(s => s.level === level && !known.has(s.id));
  // Fisher–Yates shuffle.
  const arr = pool.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, want).map(s => s.id);
}
