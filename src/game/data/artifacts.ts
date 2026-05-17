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

  // ===== МАГИЧЕСКИЕ =====
  scroll_arcane: {
    id: "scroll_arcane",
    name: "Свиток тайных знаний",
    rarity: "treasure",
    slot: "neck",
    bonus: { spellPower: 1 },
    icon: "📜",
    description: "+1 к силе магии",
  },
  pendant_mana: {
    id: "pendant_mana",
    name: "Подвеска мудрости",
    rarity: "minor",
    slot: "neck",
    bonus: { knowledge: 1 },
    icon: "💎",
    description: "+1 к знаниям",
  },
  charm_mana: {
    id: "charm_mana",
    name: "Оберег маны",
    rarity: "major",
    slot: "ring",
    bonus: { manaMult: 50 },
    icon: "🧿",
    description: "+50% к максимальному запасу маны",
  },
  spellbook_arcane: {
    id: "spellbook_arcane",
    name: "Книга чародея",
    rarity: "major",
    slot: "weapon",
    bonus: { spellPower: 2 },
    icon: "📖",
    description: "+2 к силе магии",
  },
  crown_thought: {
    id: "crown_thought",
    name: "Корона мысли",
    rarity: "major",
    slot: "helm",
    bonus: { knowledge: 2 },
    icon: "👑",
    description: "+2 к знаниям (+20 к макс. мане)",
  },
  ring_wizardry: {
    id: "ring_wizardry",
    name: "Кольцо колдовства",
    rarity: "major",
    slot: "ring",
    bonus: { spellPower: 2 },
    icon: "💠",
    description: "+2 к силе магии",
  },
  orb_silver: {
    id: "orb_silver",
    name: "Сфера серебряного пламени",
    rarity: "relic",
    slot: "weapon",
    bonus: { spellPower: 5 },
    icon: "🔮",
    description: "+5 к силе магии",
  },
  staff_archmage: {
    id: "staff_archmage",
    name: "Посох архимага",
    rarity: "relic",
    slot: "weapon",
    bonus: { spellPower: 3, knowledge: 3 },
    icon: "🪄",
    description: "+3 к силе магии и +3 к знаниям",
  },

  // ===== БРОНЯ (раньше слот пустовал) =====
  breastplate_petrified: {
    id: "breastplate_petrified",
    name: "Окаменевший нагрудник",
    rarity: "minor",
    slot: "armor",
    bonus: { defense: 3 },
    icon: "🦺",
    description: "+3 к защите",
  },
  cuirass_battle: {
    id: "cuirass_battle",
    name: "Боевая кираса",
    rarity: "major",
    slot: "armor",
    bonus: { attack: 2, defense: 2 },
    icon: "🥋",
    description: "+2 к атаке и +2 к защите",
  },
  titan_cuirass: {
    id: "titan_cuirass",
    name: "Кираса титана",
    rarity: "relic",
    slot: "armor",
    bonus: { defense: 8, hpBonus: 2 },
    icon: "🛡️",
    description: "+8 к защите и +2 HP всем существам",
  },

  // ===== КОМБИНИРОВАННЫЕ =====
  amulet_battlefield: {
    id: "amulet_battlefield",
    name: "Амулет поля битвы",
    rarity: "major",
    slot: "neck",
    bonus: { attack: 1, defense: 1, hpBonus: 1 },
    icon: "🎖️",
    description: "+1 к атаке, защите и HP",
  },
  greaves_swift: {
    id: "greaves_swift",
    name: "Поножи стремительности",
    rarity: "treasure",
    slot: "feet",
    bonus: { speed: 1, movement: 300 },
    icon: "🥾",
    description: "+1 скорости, +300 очков движения",
  },
  cape_courage: {
    id: "cape_courage",
    name: "Плащ отваги",
    rarity: "treasure",
    slot: "shield",
    bonus: { attack: 1, defense: 1 },
    icon: "🦸",
    description: "+1 к атаке и защите",
  },
  ring_perfection: {
    id: "ring_perfection",
    name: "Кольцо совершенства",
    rarity: "relic",
    slot: "ring",
    bonus: { attack: 2, defense: 2, spellPower: 1, knowledge: 1 },
    icon: "💍",
    description: "+2 атк/защ, +1 сила/знания",
  },
  helm_warlord: {
    id: "helm_warlord",
    name: "Шлем полководца",
    rarity: "treasure",
    slot: "helm",
    bonus: { attack: 1, defense: 1 },
    icon: "🪖",
    description: "+1 к атаке и защите",
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

export const EMPTY_BONUS: HeroBonus = {
  attack: 0,
  defense: 0,
  speed: 0,
  hpBonus: 0,
  movement: 0,
  spellPower: 0,
  knowledge: 0,
  manaMult: 0,
};
