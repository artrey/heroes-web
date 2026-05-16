import type { Faction } from "../types";
import { FACTION_UNIT_ORDER } from "./units";

interface HeroProto {
  name: string;
  faction: Faction;
  icon: string;
  startingArmy: { unitId: string; min: number; max: number }[];
}

// Имена и иконки героев по фракциям — приближение к известным героям HoMM3.
// Стартовая армия по дефолту = немного юнитов tier 1 + чуть-чуть tier 2.
function genericHeroes(faction: Faction, names: { name: string; icon: string }[]): HeroProto[] {
  const [t1, t2] = FACTION_UNIT_ORDER[faction];
  return names.map(n => ({
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
  // Castle и Rampart — тематические имена с лёгкими отличиями в стартовой армии.
  {
    name: "Орин",
    faction: "castle",
    icon: "🤴",
    startingArmy: [
      { unitId: "pikeman", min: 20, max: 30 },
      { unitId: "archer", min: 2, max: 5 },
    ],
  },
  {
    name: "Валеска",
    faction: "castle",
    icon: "👸",
    startingArmy: [
      { unitId: "pikeman", min: 15, max: 25 },
      { unitId: "archer", min: 5, max: 8 },
    ],
  },
  {
    name: "Айвор",
    faction: "rampart",
    icon: "🧝‍♂️",
    startingArmy: [
      { unitId: "centaur", min: 15, max: 25 },
      { unitId: "dwarf", min: 3, max: 6 },
    ],
  },
  {
    name: "Кларансей",
    faction: "rampart",
    icon: "🧝‍♀️",
    startingArmy: [
      { unitId: "centaur", min: 10, max: 20 },
      { unitId: "woodElf", min: 1, max: 3 },
    ],
  },
  // Остальные фракции — по одному герою. Можно добавить ещё позже.
  ...genericHeroes("tower", [
    { name: "Солмир", icon: "🧙" },
    { name: "Айя", icon: "🧙‍♀️" },
  ]),
  ...genericHeroes("inferno", [
    { name: "Калх", icon: "😈" },
    { name: "Зидар", icon: "👹" },
  ]),
  ...genericHeroes("necropolis", [
    { name: "Сандро", icon: "☠️" },
    { name: "Найми", icon: "🧙‍♂️" },
  ]),
  ...genericHeroes("dungeon", [
    { name: "Мутара", icon: "🐍" },
    { name: "Аджит", icon: "🧙" },
  ]),
  ...genericHeroes("stronghold", [
    { name: "Криг Гневный", icon: "🪓" },
    { name: "Тарнум", icon: "🛡️" },
  ]),
  ...genericHeroes("fortress", [
    { name: "Бидли", icon: "🐊" },
    { name: "Тазар", icon: "🦎" },
  ]),
  ...genericHeroes("conflux", [
    { name: "Лусифер", icon: "🔥" },
    { name: "Гриндан", icon: "💨" },
  ]),
];

export function pickHeroProto(faction: Faction, rng: () => number) {
  const list = HERO_PROTOS.filter(h => h.faction === faction);
  return list[Math.floor(rng() * list.length)];
}
