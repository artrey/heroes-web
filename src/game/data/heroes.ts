import type { Faction } from "../types";
import { FACTION_LIST } from "./factions";
import { FACTION_UNIT_ORDER } from "./units";

export interface HeroBaseStats {
  attack: number;
  defense: number;
  spellPower: number;
  knowledge: number;
}

export interface HeroProto {
  id: string;
  name: string;
  faction: Faction;
  icon: string;
  // Стартовые характеристики. Сумма = 8, минимум 1 в каждой.
  baseStats: HeroBaseStats;
  startingArmy: { unitId: string; min: number; max: number }[];
}

function makeId(faction: Faction, name: string): string {
  return `${faction}:${name}`;
}

interface GenericEntry {
  name: string;
  icon: string;
  baseStats: HeroBaseStats;
}

// Имена и иконки героев по фракциям — приближение к известным героям HoMM3.
// Стартовая армия по дефолту = немного юнитов tier 1 + чуть-чуть tier 2.
function genericHeroes(faction: Faction, entries: GenericEntry[]): HeroProto[] {
  const [t1, t2] = FACTION_UNIT_ORDER[faction];
  return entries.map(n => ({
    id: makeId(faction, n.name),
    name: n.name,
    faction,
    icon: n.icon,
    baseStats: n.baseStats,
    startingArmy: [
      { unitId: t1, min: 15, max: 25 },
      { unitId: t2, min: 2, max: 5 },
    ],
  }));
}

// Архетипы для удобства (все суммы = 8, минимум 1).
const WARRIOR: HeroBaseStats = { attack: 4, defense: 2, spellPower: 1, knowledge: 1 };
const BERSERKER: HeroBaseStats = { attack: 5, defense: 1, spellPower: 1, knowledge: 1 };
const DEFENDER: HeroBaseStats = { attack: 1, defense: 5, spellPower: 1, knowledge: 1 };
const KNIGHT: HeroBaseStats = { attack: 3, defense: 3, spellPower: 1, knowledge: 1 };
const RANGER: HeroBaseStats = { attack: 3, defense: 2, spellPower: 1, knowledge: 2 };
const PALADIN: HeroBaseStats = { attack: 3, defense: 2, spellPower: 2, knowledge: 1 };
const BATTLE_MAGE: HeroBaseStats = { attack: 2, defense: 1, spellPower: 3, knowledge: 2 };
const CLERIC: HeroBaseStats = { attack: 1, defense: 2, spellPower: 2, knowledge: 3 };
const DRUID: HeroBaseStats = { attack: 1, defense: 2, spellPower: 3, knowledge: 2 };
const WIZARD: HeroBaseStats = { attack: 1, defense: 1, spellPower: 3, knowledge: 3 };
const WARLOCK: HeroBaseStats = { attack: 1, defense: 1, spellPower: 4, knowledge: 2 };
const ORACLE: HeroBaseStats = { attack: 1, defense: 1, spellPower: 2, knowledge: 4 };
const ARCHMAGE: HeroBaseStats = { attack: 1, defense: 1, spellPower: 4, knowledge: 2 };
const UNIVERSAL: HeroBaseStats = { attack: 2, defense: 2, spellPower: 2, knowledge: 2 };

export const HERO_PROTOS: HeroProto[] = [
  // Castle — рыцари и клирики. Преимущественно воины, изредка миксы.
  {
    id: "castle:Орин",
    name: "Орин",
    faction: "castle",
    icon: "🤴",
    baseStats: KNIGHT,
    startingArmy: [
      { unitId: "pikeman", min: 20, max: 30 },
      { unitId: "archer", min: 2, max: 5 },
    ],
  },
  {
    id: "castle:Валеска",
    name: "Валеска",
    faction: "castle",
    icon: "👸",
    baseStats: { attack: 3, defense: 2, spellPower: 2, knowledge: 1 },
    startingArmy: [
      { unitId: "pikeman", min: 15, max: 25 },
      { unitId: "archer", min: 5, max: 8 },
    ],
  },
  ...genericHeroes("castle", [
    { name: "Сорша", icon: "🤺", baseStats: WARRIOR },
    { name: "Эдрик", icon: "⚔️", baseStats: BERSERKER },
    { name: "Сильвия", icon: "🛡️", baseStats: DEFENDER },
    { name: "Кэтрин", icon: "🐎", baseStats: PALADIN },
  ]),

  // Rampart — эльфы и друиды.
  {
    id: "rampart:Айвор",
    name: "Айвор",
    faction: "rampart",
    icon: "🧝‍♂️",
    baseStats: UNIVERSAL,
    startingArmy: [
      { unitId: "centaur", min: 15, max: 25 },
      { unitId: "dwarf", min: 3, max: 6 },
    ],
  },
  {
    id: "rampart:Кларансей",
    name: "Кларансей",
    faction: "rampart",
    icon: "🧝‍♀️",
    baseStats: RANGER,
    startingArmy: [
      { unitId: "centaur", min: 10, max: 20 },
      { unitId: "woodElf", min: 1, max: 3 },
    ],
  },
  ...genericHeroes("rampart", [
    { name: "Меф", icon: "🦌", baseStats: RANGER },
    { name: "Уджолек", icon: "🌿", baseStats: DRUID },
    { name: "Айрис", icon: "🦋", baseStats: { attack: 1, defense: 1, spellPower: 3, knowledge: 3 } },
    { name: "Дриад", icon: "🍃", baseStats: { attack: 1, defense: 2, spellPower: 2, knowledge: 3 } },
  ]),

  // Tower — маги.
  ...genericHeroes("tower", [
    { name: "Солмир", icon: "🧙", baseStats: WIZARD },
    { name: "Айя", icon: "🧙‍♀️", baseStats: ARCHMAGE },
    { name: "Терек", icon: "🔮", baseStats: ORACLE },
    { name: "Сирус", icon: "⚗️", baseStats: { attack: 2, defense: 1, spellPower: 2, knowledge: 3 } },
    { name: "Айнар", icon: "🧞", baseStats: { attack: 1, defense: 2, spellPower: 3, knowledge: 2 } },
    { name: "Дарэн", icon: "🤖", baseStats: UNIVERSAL },
  ]),

  // Inferno — демоны: агрессивные, иногда тёмные маги.
  ...genericHeroes("inferno", [
    { name: "Калх", icon: "😈", baseStats: { attack: 3, defense: 2, spellPower: 2, knowledge: 1 } },
    { name: "Зидар", icon: "👹", baseStats: BATTLE_MAGE },
    { name: "Маркаль", icon: "🔥", baseStats: ARCHMAGE },
    { name: "Октавия", icon: "👿", baseStats: { attack: 2, defense: 1, spellPower: 3, knowledge: 2 } },
    { name: "Олема", icon: "🌋", baseStats: WARRIOR },
    { name: "Ксанфор", icon: "💀", baseStats: WIZARD },
  ]),

  // Necropolis — нежить, магия-доминанта.
  ...genericHeroes("necropolis", [
    { name: "Сандро", icon: "☠️", baseStats: WIZARD },
    { name: "Найми", icon: "🧙‍♂️", baseStats: ARCHMAGE },
    { name: "Танар", icon: "🦴", baseStats: UNIVERSAL },
    { name: "Рейл", icon: "🧛", baseStats: { attack: 3, defense: 1, spellPower: 2, knowledge: 2 } },
    { name: "Стрейкер", icon: "👻", baseStats: { attack: 1, defense: 2, spellPower: 2, knowledge: 3 } },
    { name: "Тамика", icon: "🦇", baseStats: ORACLE },
  ]),

  // Dungeon — подземный мир: воркокки и убийцы.
  ...genericHeroes("dungeon", [
    { name: "Мутара", icon: "🐍", baseStats: WIZARD },
    { name: "Аджит", icon: "🧙", baseStats: WARLOCK },
    { name: "Шакти", icon: "🦂", baseStats: BERSERKER },
    { name: "Дэйс", icon: "🦇", baseStats: UNIVERSAL },
    { name: "Лорелей", icon: "🐲", baseStats: { attack: 3, defense: 2, spellPower: 2, knowledge: 1 } },
    { name: "Шэккия", icon: "👁️", baseStats: ORACLE },
  ]),

  // Stronghold — варвары, чистые воины.
  ...genericHeroes("stronghold", [
    { name: "Криг Гневный", icon: "🪓", baseStats: BERSERKER },
    { name: "Тарнум", icon: "🛡️", baseStats: KNIGHT },
    { name: "Гундула", icon: "🐺", baseStats: WARRIOR },
    { name: "Гирд", icon: "👺", baseStats: { attack: 3, defense: 2, spellPower: 2, knowledge: 1 } },
    { name: "Ёг", icon: "🧌", baseStats: WARRIOR },
    { name: "Сола", icon: "🪶", baseStats: { attack: 1, defense: 2, spellPower: 3, knowledge: 2 } },
  ]),

  // Fortress — болото: оборонительный уклон, есть ведьмы.
  ...genericHeroes("fortress", [
    { name: "Бидли", icon: "🐊", baseStats: { attack: 2, defense: 4, spellPower: 1, knowledge: 1 } },
    { name: "Тазар", icon: "🦎", baseStats: KNIGHT },
    { name: "Андра", icon: "🐍", baseStats: { attack: 1, defense: 2, spellPower: 3, knowledge: 2 } },
    { name: "Альколд", icon: "🦂", baseStats: { attack: 3, defense: 2, spellPower: 2, knowledge: 1 } },
    { name: "Маерин", icon: "🐢", baseStats: DEFENDER },
    { name: "Бронвик", icon: "🪰", baseStats: { attack: 2, defense: 3, spellPower: 2, knowledge: 1 } },
  ]),

  // Conflux — стихийные маги.
  ...genericHeroes("conflux", [
    { name: "Лусифер", icon: "🔥", baseStats: BATTLE_MAGE },
    { name: "Гриндан", icon: "💨", baseStats: WIZARD },
    { name: "Эриден", icon: "💧", baseStats: CLERIC },
    { name: "Файр", icon: "🌀", baseStats: ORACLE },
    { name: "Ига", icon: "🪨", baseStats: { attack: 1, defense: 3, spellPower: 2, knowledge: 2 } },
    { name: "Кип", icon: "⚡", baseStats: BATTLE_MAGE },
  ]),
];

export function pickHeroProto(faction: Faction, rng: () => number): HeroProto {
  const list = HERO_PROTOS.filter(h => h.faction === faction);
  return list[Math.floor(rng() * list.length)];
}

export function pickHeroFromAnyOtherFaction(exclude: Faction, rng: () => number): HeroProto {
  const factions = FACTION_LIST.filter(f => f !== exclude);
  const faction = factions[Math.floor(rng() * factions.length)];
  return pickHeroProto(faction, rng);
}

export function getHeroProto(id: string): HeroProto | undefined {
  return HERO_PROTOS.find(p => p.id === id);
}
