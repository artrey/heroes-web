import type { Difficulty, ResourceBag } from "../types";

export interface DifficultyPreset {
  label: string;
  description: string;
  // Стартовые ресурсы человека и ИИ. Чем сложнее — тем меньше у игрока и тем больше у ИИ.
  playerResources: ResourceBag;
  aiResources: ResourceBag;
  // Множитель численности стартовой армии ИИ-героев.
  aiArmyMult: number;
  // Множитель недельного прироста юнитов в городах ИИ.
  aiGrowthMult: number;
  // Боевой буф ИИ: +N к атаке/+M к защите всем стэкам в любом бою на стороне ИИ.
  aiCombatBonus: { attack: number; defense: number };
}

export const DIFFICULTY_PRESETS: Record<Difficulty, DifficultyPreset> = {
  easy: {
    label: "Лёгкая",
    description:
      "Игрок начинает богаче. ИИ слабее: меньше армия, обычный прирост, без боевого буфа. Подходит для разминки.",
    playerResources: { gold: 20000, wood: 30, ore: 30, mercury: 10, sulfur: 10, crystal: 10, gems: 10 },
    aiResources: { gold: 5000, wood: 10, ore: 10, mercury: 3, sulfur: 3, crystal: 3, gems: 3 },
    aiArmyMult: 0.6,
    aiGrowthMult: 1.0,
    aiCombatBonus: { attack: 0, defense: 0 },
  },
  normal: {
    label: "Средняя",
    description: "Сбалансированно: стартовые ресурсы и армии равны, без боевых бонусов.",
    playerResources: { gold: 10000, wood: 20, ore: 20, mercury: 5, sulfur: 5, crystal: 5, gems: 5 },
    aiResources: { gold: 10000, wood: 20, ore: 20, mercury: 5, sulfur: 5, crystal: 5, gems: 5 },
    aiArmyMult: 1.0,
    aiGrowthMult: 1.0,
    aiCombatBonus: { attack: 0, defense: 0 },
  },
  hard: {
    label: "Сложная",
    description: "ИИ начинает с большим преимуществом, армии у него в 2× больше, прирост ×1.5, +3 атк / +2 защ в боях.",
    playerResources: { gold: 5000, wood: 10, ore: 10, mercury: 2, sulfur: 2, crystal: 2, gems: 2 },
    aiResources: { gold: 25000, wood: 50, ore: 50, mercury: 15, sulfur: 15, crystal: 15, gems: 15 },
    aiArmyMult: 2.0,
    aiGrowthMult: 1.5,
    aiCombatBonus: { attack: 3, defense: 2 },
  },
};

export function getPreset(d: Difficulty): DifficultyPreset {
  return DIFFICULTY_PRESETS[d];
}
