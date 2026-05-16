// 1000 XP за уровень — линейная шкала, простая для прототипа.
const XP_PER_LEVEL = 1000;

export function levelFromXp(xp: number): number {
  return Math.floor(xp / XP_PER_LEVEL) + 1;
}

export function xpToNextLevel(xp: number): number {
  const lvl = levelFromXp(xp);
  return lvl * XP_PER_LEVEL - xp;
}
