// Доступные «прокачиваемые» характеристики при повышении уровня героя.
// Распределение равномерное — игроку важна универсальность, специализация
// решается артефактами.
export const LEVEL_UP_STATS = ["attack", "defense", "spellPower", "knowledge"] as const;
export type LevelUpStat = (typeof LEVEL_UP_STATS)[number];

export const LEVEL_UP_LABEL: Record<LevelUpStat, string> = {
  attack: "к атаке",
  defense: "к защите",
  spellPower: "к силе магии",
  knowledge: "к знаниям",
};

export function rollLevelUpStat(): LevelUpStat {
  return LEVEL_UP_STATS[Math.floor(Math.random() * LEVEL_UP_STATS.length)];
}
