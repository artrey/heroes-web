import type { ArtifactDef, ArtifactSlot, HeroBonus } from "../types";

// Каталог артефактов для прототипа. У каждого — слот экипировки и бонусы,
// которые применяются ко всем стэкам героя в бою и/или к очкам движения на карте.
export const ARTIFACTS: Record<string, ArtifactDef> = {
  centaur_axe: {
    id: "centaur_axe",
    name: "Топор Кентавра",
    rarity: "treasure",
    slot: "weapon",
    bonus: { attack: 2 },
    icon: "🪓",
    description: "+2 к атаке всех существ",
  },
  blackshard: {
    id: "blackshard",
    name: "Чёрный осколок мёртвого рыцаря",
    rarity: "treasure",
    slot: "weapon",
    bonus: { attack: 3 },
    icon: "⚔️",
    description: "+3 к атаке",
  },
  sword_judgement: {
    id: "sword_judgement",
    name: "Меч Гогнара",
    rarity: "relic",
    slot: "weapon",
    bonus: { attack: 12 },
    icon: "🗡️",
    description: "+12 к атаке",
  },
  shield_dwarven_lords: {
    id: "shield_dwarven_lords",
    name: "Щит гномьих лордов",
    rarity: "treasure",
    slot: "shield",
    bonus: { defense: 2 },
    icon: "🛡️",
    description: "+2 к защите",
  },
  ring_vitality: {
    id: "ring_vitality",
    name: "Кольцо жизненной силы",
    rarity: "minor",
    slot: "ring",
    bonus: { hpBonus: 1 },
    icon: "💍",
    description: "+1 HP всем существам",
  },
  necklace_swiftness: {
    id: "necklace_swiftness",
    name: "Ожерелье ловкости",
    rarity: "minor",
    slot: "neck",
    bonus: { speed: 1 },
    icon: "📿",
    description: "+1 скорости всем существам",
  },
  boots_speed: {
    id: "boots_speed",
    name: "Сапоги-скороходы",
    rarity: "major",
    slot: "feet",
    bonus: { movement: 600 },
    icon: "👢",
    description: "+600 очков движения на карте",
  },
  helm_alabaster: {
    id: "helm_alabaster",
    name: "Алебастровый шлем",
    rarity: "major",
    slot: "helm",
    bonus: { defense: 1 },
    icon: "⛑️",
    description: "+1 к защите",
  },
};

export const ARTIFACT_IDS = Object.keys(ARTIFACTS);

export function getArtifact(id: string): ArtifactDef {
  const a = ARTIFACTS[id];
  if (!a) throw new Error(`Unknown artifact: ${id}`);
  return a;
}

export const RARITY_COLOR: Record<ArtifactDef["rarity"], string> = {
  treasure: "#8a8a8a",
  minor: "#5fa850",
  major: "#4080d0",
  relic: "#d4a64a",
};

export const SLOT_ICON: Record<ArtifactSlot, string> = {
  helm: "⛑️",
  neck: "📿",
  weapon: "⚔️",
  shield: "🛡️",
  armor: "🥋",
  ring: "💍",
  feet: "👢",
};

export const SLOT_LABEL: Record<ArtifactSlot, string> = {
  helm: "Шлем",
  neck: "Шея",
  weapon: "Оружие",
  shield: "Щит",
  armor: "Доспех",
  ring: "Кольцо",
  feet: "Обувь",
};

export const EMPTY_BONUS: HeroBonus = { attack: 0, defense: 0, speed: 0, hpBonus: 0, movement: 0 };
