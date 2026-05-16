import type { BuildingDef, Faction } from "../types";

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
    description: "Укрепления города",
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
];

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

export const FACTION_BUILDINGS: Record<Faction, BuildingDef[]> = {
  castle: [...baseBuildings, ...castleBuildings],
  rampart: [...baseBuildings, ...rampartBuildings],
};

export function getBuilding(faction: Faction, id: string): BuildingDef | undefined {
  return FACTION_BUILDINGS[faction].find(b => b.id === id);
}
