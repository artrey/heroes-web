import type { Faction } from "../types";
import { FACTION_LIST } from "./factions";
import { FACTION_UNIT_ORDER } from "./units";

export interface HeroProto {
  id: string;
  name: string;
  faction: Faction;
  icon: string;
  startingArmy: { unitId: string; min: number; max: number }[];
}

function makeId(faction: Faction, name: string): string {
  return `${faction}:${name}`;
}

// Имена и иконки героев по фракциям — приближение к известным героям HoMM3.
// Стартовая армия по дефолту = немного юнитов tier 1 + чуть-чуть tier 2.
function genericHeroes(faction: Faction, names: { name: string; icon: string }[]): HeroProto[] {
  const [t1, t2] = FACTION_UNIT_ORDER[faction];
  return names.map(n => ({
    id: makeId(faction, n.name),
    name: n.name,
    faction,
    icon: n.icon,
    startingArmy: [
      { unitId: t1, min: 15, max: 25 },
      { unitId: t2, min: 2, max: 5 },
    ],
  }));
}

export const HERO_PROTOS: HeroProto[] = [
  // Castle — рыцари и клирики. Имена в духе HoMM3.
  {
    id: "castle:Орин",
    name: "Орин",
    faction: "castle",
    icon: "🤴",
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
    startingArmy: [
      { unitId: "pikeman", min: 15, max: 25 },
      { unitId: "archer", min: 5, max: 8 },
    ],
  },
  ...genericHeroes("castle", [
    { name: "Сорша", icon: "🤺" },
    { name: "Эдрик", icon: "⚔️" },
    { name: "Сильвия", icon: "🛡️" },
    { name: "Кэтрин", icon: "🐎" },
  ]),

  // Rampart — эльфы и друиды.
  {
    id: "rampart:Айвор",
    name: "Айвор",
    faction: "rampart",
    icon: "🧝‍♂️",
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
    startingArmy: [
      { unitId: "centaur", min: 10, max: 20 },
      { unitId: "woodElf", min: 1, max: 3 },
    ],
  },
  ...genericHeroes("rampart", [
    { name: "Меф", icon: "🦌" },
    { name: "Уджолек", icon: "🌿" },
    { name: "Айрис", icon: "🦋" },
    { name: "Дриад", icon: "🍃" },
  ]),

  // Tower — маги.
  ...genericHeroes("tower", [
    { name: "Солмир", icon: "🧙" },
    { name: "Айя", icon: "🧙‍♀️" },
    { name: "Терек", icon: "🔮" },
    { name: "Сирус", icon: "⚗️" },
    { name: "Айнар", icon: "🧞" },
    { name: "Дарэн", icon: "🤖" },
  ]),

  // Inferno — демоны.
  ...genericHeroes("inferno", [
    { name: "Калх", icon: "😈" },
    { name: "Зидар", icon: "👹" },
    { name: "Маркаль", icon: "🔥" },
    { name: "Октавия", icon: "👿" },
    { name: "Олема", icon: "🌋" },
    { name: "Ксанфор", icon: "💀" },
  ]),

  // Necropolis — нежить.
  ...genericHeroes("necropolis", [
    { name: "Сандро", icon: "☠️" },
    { name: "Найми", icon: "🧙‍♂️" },
    { name: "Танар", icon: "🦴" },
    { name: "Рейл", icon: "🧛" },
    { name: "Стрейкер", icon: "👻" },
    { name: "Тамика", icon: "🦇" },
  ]),

  // Dungeon — подземный мир.
  ...genericHeroes("dungeon", [
    { name: "Мутара", icon: "🐍" },
    { name: "Аджит", icon: "🧙" },
    { name: "Шакти", icon: "🦂" },
    { name: "Дэйс", icon: "🦇" },
    { name: "Лорелей", icon: "🐲" },
    { name: "Шэккия", icon: "👁️" },
  ]),

  // Stronghold — варвары.
  ...genericHeroes("stronghold", [
    { name: "Криг Гневный", icon: "🪓" },
    { name: "Тарнум", icon: "🛡️" },
    { name: "Гундула", icon: "🐺" },
    { name: "Гирд", icon: "👺" },
    { name: "Ёг", icon: "🧌" },
    { name: "Сола", icon: "🪶" },
  ]),

  // Fortress — болото.
  ...genericHeroes("fortress", [
    { name: "Бидли", icon: "🐊" },
    { name: "Тазар", icon: "🦎" },
    { name: "Андра", icon: "🐍" },
    { name: "Альколд", icon: "🦂" },
    { name: "Маерин", icon: "🐢" },
    { name: "Бронвик", icon: "🪰" },
  ]),

  // Conflux — стихии.
  ...genericHeroes("conflux", [
    { name: "Лусифер", icon: "🔥" },
    { name: "Гриндан", icon: "💨" },
    { name: "Эриден", icon: "💧" },
    { name: "Файр", icon: "🌀" },
    { name: "Ига", icon: "🪨" },
    { name: "Кип", icon: "⚡" },
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
