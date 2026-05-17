import type { BuildingDef, Faction } from "../types";
import { FACTION_UNIT_ORDER, UNITS } from "./units";

// Постройки города. Упрощено: одна линия от tier 1 до tier 7, плюс ратуша/замок/рынок.

const baseBuildings: BuildingDef[] = [
  {
    id: "villageHall",
    name: "Деревенская ратуша",
    description: "+500 золота в день",
    cost: {},
    icon: "🏛️",
    givesGoldPerDay: 500,
  },
  {
    id: "townHall",
    name: "Городская ратуша",
    description: "+1000 золота в день",
    cost: { gold: 2500 },
    prereq: ["villageHall"],
    icon: "🏛️",
    givesGoldPerDay: 1000,
  },
  {
    id: "cityHall",
    name: "Магистрат",
    description: "+2000 золота в день",
    cost: { gold: 5000 },
    prereq: ["townHall", "tavern"],
    icon: "🏛️",
    givesGoldPerDay: 2000,
  },
  {
    id: "tavern",
    name: "Таверна",
    description: "Позволяет нанимать героев",
    cost: { gold: 500, wood: 5 },
    icon: "🍺",
  },
  {
    id: "fort",
    name: "Форт",
    description: "Укрепления города. +50% к недельному приросту всех существ.",
    cost: { gold: 5000, wood: 20, ore: 20 },
    prereq: ["villageHall"],
    icon: "🏰",
  },
  {
    id: "marketplace",
    name: "Рынок",
    description: "Обмен ресурсов",
    cost: { gold: 500, wood: 5 },
    icon: "🏪",
  },
  {
    id: "mageGuild1",
    name: "Гильдия магов I",
    description: "Открывает заклинания 1-го уровня. Герой в городе изучает все доступные.",
    cost: { gold: 2000, wood: 5, ore: 5 },
    prereq: ["villageHall"],
    icon: "📖",
  },
  {
    id: "mageGuild2",
    name: "Гильдия магов II",
    description: "Открывает заклинания 2-го уровня.",
    cost: { gold: 1000, mercury: 4, sulfur: 4, crystal: 4, gems: 4 },
    prereq: ["mageGuild1"],
    icon: "📖",
  },
  {
    id: "mageGuild3",
    name: "Гильдия магов III",
    description: "Открывает заклинания 3-го уровня.",
    cost: { gold: 1500, mercury: 6, sulfur: 6, crystal: 6, gems: 6 },
    prereq: ["mageGuild2"],
    icon: "📖",
  },
];

// id → уровень гильдии магов. Используется при постройке для заполнения learnedSpells.
export const MAGE_GUILD_LEVEL: Record<string, number> = {
  mageGuild1: 1,
  mageGuild2: 2,
  mageGuild3: 3,
};

const castleBuildings: BuildingDef[] = [
  {
    id: "dwelling1",
    name: "Казармы копейщиков",
    description: "Копейщики",
    cost: { gold: 200, wood: 5 },
    produces: "pikeman",
    icon: "🛡️",
  },
  {
    id: "dwelling2",
    name: "Башня лучников",
    description: "Лучники",
    cost: { gold: 1000, wood: 5 },
    prereq: ["dwelling1"],
    produces: "archer",
    icon: "🏹",
  },
  {
    id: "dwelling3",
    name: "Башня грифонов",
    description: "Грифоны",
    cost: { gold: 1500, ore: 5 },
    prereq: ["fort"],
    produces: "griffin",
    icon: "🦅",
  },
  {
    id: "dwelling4",
    name: "Зал мечников",
    description: "Мечники",
    cost: { gold: 3000, wood: 5, ore: 5 },
    prereq: ["dwelling2"],
    produces: "swordsman",
    icon: "⚔️",
  },
  {
    id: "dwelling5",
    name: "Монастырь",
    description: "Монахи",
    cost: { gold: 3000, wood: 5, ore: 5, mercury: 2 },
    prereq: ["dwelling3"],
    produces: "monk",
    icon: "🙏",
  },
  {
    id: "dwelling6",
    name: "Тренировочные поля",
    description: "Кавалеры",
    cost: { gold: 5000, ore: 20 },
    prereq: ["dwelling4"],
    produces: "cavalier",
    icon: "🐎",
  },
  {
    id: "dwelling7",
    name: "Портал славы",
    description: "Ангелы",
    cost: { gold: 10000, gems: 3, crystal: 3 },
    prereq: ["dwelling6", "dwelling5"],
    produces: "angel",
    icon: "👼",
  },
];

const rampartBuildings: BuildingDef[] = [
  {
    id: "dwelling1",
    name: "Стоянка кентавров",
    description: "Кентавры",
    cost: { gold: 200, wood: 5 },
    produces: "centaur",
    icon: "🏹",
  },
  {
    id: "dwelling2",
    name: "Жильё гномов",
    description: "Гномы",
    cost: { gold: 1000, ore: 5 },
    prereq: ["dwelling1"],
    produces: "dwarf",
    icon: "⛏️",
  },
  {
    id: "dwelling3",
    name: "Гнездо лесных эльфов",
    description: "Лесные эльфы",
    cost: { gold: 1500, wood: 10 },
    prereq: ["fort"],
    produces: "woodElf",
    icon: "🧝",
  },
  {
    id: "dwelling4",
    name: "Облака пегасов",
    description: "Пегасы",
    cost: { gold: 3000, mercury: 2 },
    prereq: ["dwelling2"],
    produces: "pegasus",
    icon: "🦄",
  },
  {
    id: "dwelling5",
    name: "Древо дендроидов",
    description: "Дендроиды",
    cost: { gold: 3000, wood: 10 },
    prereq: ["dwelling3"],
    produces: "dendroid",
    icon: "🌳",
  },
  {
    id: "dwelling6",
    name: "Сад единорогов",
    description: "Единороги",
    cost: { gold: 5000, gems: 5 },
    prereq: ["dwelling4"],
    produces: "unicorn",
    icon: "🦄",
  },
  {
    id: "dwelling7",
    name: "Утёс драконов",
    description: "Зелёные драконы",
    cost: { gold: 10000, crystal: 5, sulfur: 5 },
    prereq: ["dwelling6", "dwelling5"],
    produces: "dragon",
    icon: "🐉",
  },
];

// Шаблон стоимости/пререков для жилищ — одинаков для всех фракций, отличаются только
// названия. Castle и Rampart прописаны вручную ради тематических имён, остальные
// фракции — программно по тому же шаблону.
const DWELLING_COST: Array<BuildingDef["cost"]> = [
  { gold: 200, wood: 5 },
  { gold: 1000, wood: 5 },
  { gold: 1500, ore: 5 },
  { gold: 3000, wood: 5, ore: 5 },
  { gold: 3000, wood: 5, ore: 5, mercury: 2 },
  { gold: 5000, ore: 20 },
  { gold: 10000, gems: 3, crystal: 3 },
];
const DWELLING_PREREQ: Array<string[] | undefined> = [
  undefined,
  ["dwelling1"],
  ["fort"],
  ["dwelling2"],
  ["dwelling3"],
  ["dwelling4"],
  ["dwelling6", "dwelling5"],
];

function genericDwellings(faction: Faction): BuildingDef[] {
  return FACTION_UNIT_ORDER[faction].map((unitId, idx) => {
    const u = UNITS[unitId];
    return {
      id: `dwelling${idx + 1}`,
      name: `Жилище: ${u.name}`,
      description: `Производит существ "${u.name}" (+${u.growth}/нед).`,
      cost: DWELLING_COST[idx],
      prereq: DWELLING_PREREQ[idx],
      produces: unitId,
      icon: u.icon,
    };
  });
}

export const FACTION_BUILDINGS: Record<Faction, BuildingDef[]> = {
  castle: [...baseBuildings, ...castleBuildings],
  rampart: [...baseBuildings, ...rampartBuildings],
  tower: [...baseBuildings, ...genericDwellings("tower")],
  inferno: [...baseBuildings, ...genericDwellings("inferno")],
  necropolis: [...baseBuildings, ...genericDwellings("necropolis")],
  dungeon: [...baseBuildings, ...genericDwellings("dungeon")],
  stronghold: [...baseBuildings, ...genericDwellings("stronghold")],
  fortress: [...baseBuildings, ...genericDwellings("fortress")],
  conflux: [...baseBuildings, ...genericDwellings("conflux")],
};

export function getBuilding(faction: Faction, id: string): BuildingDef | undefined {
  return FACTION_BUILDINGS[faction].find(b => b.id === id);
}
