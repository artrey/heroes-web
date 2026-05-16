import type { Faction } from "../types";

export interface FactionMeta {
  id: Faction;
  name: string;
  shortName: string;
  description: string;
  icon: string;
  accent: string;
}

export const FACTION_LIST: Faction[] = [
  "castle",
  "rampart",
  "tower",
  "inferno",
  "necropolis",
  "dungeon",
  "stronghold",
  "fortress",
  "conflux",
];

export const FACTION_META: Record<Faction, FactionMeta> = {
  castle: {
    id: "castle",
    name: "Замок",
    shortName: "Castle",
    description: "Рыцари, монахи и ангелы. Сбалансированный порядок.",
    icon: "🏰",
    accent: "#d4c97a",
  },
  rampart: {
    id: "rampart",
    name: "Оплот",
    shortName: "Rampart",
    description: "Эльфы, единороги и драконы. Природа и магия леса.",
    icon: "🏯",
    accent: "#7ad48a",
  },
  tower: {
    id: "tower",
    name: "Башня",
    shortName: "Tower",
    description: "Гремлины, маги и титаны. Сильная магия и стрелки.",
    icon: "🗼",
    accent: "#7ab8d4",
  },
  inferno: {
    id: "inferno",
    name: "Инферно",
    shortName: "Inferno",
    description: "Бесы, демоны и дьяволы. Огонь и тьма.",
    icon: "🌋",
    accent: "#d47a3a",
  },
  necropolis: {
    id: "necropolis",
    name: "Некрополис",
    shortName: "Necropolis",
    description: "Скелеты, личи и драконы-нежить. Армия мертвых.",
    icon: "🪦",
    accent: "#a07ad4",
  },
  dungeon: {
    id: "dungeon",
    name: "Темница",
    shortName: "Dungeon",
    description: "Минотавры, медузы и красные драконы. Подземный мир.",
    icon: "🕳️",
    accent: "#a04060",
  },
  stronghold: {
    id: "stronghold",
    name: "Цитадель",
    shortName: "Stronghold",
    description: "Гоблины, циклопы и бегемоты. Варварская сила.",
    icon: "🛖",
    accent: "#c4763a",
  },
  fortress: {
    id: "fortress",
    name: "Крепость",
    shortName: "Fortress",
    description: "Ящеры, василиски и гидры. Болотные твари с высокой защитой.",
    icon: "🐊",
    accent: "#7aa44e",
  },
  conflux: {
    id: "conflux",
    name: "Сопряжение",
    shortName: "Conflux",
    description: "Феи, элементали и фениксы. Все стихии в одной фракции.",
    icon: "🌀",
    accent: "#d4d47a",
  },
};
