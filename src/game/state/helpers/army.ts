import type { BattleState, Coord, GameState, Hero, Town, UnitStack } from "../../types";
import { getEffectiveMaxMana } from "../../utils/heroBonus";

// Прибавить юнитов к армии: если такой стек уже есть — мерджим, иначе создаём
// новый слот (до 7). Если слотов нет — лишние теряются (заглушка для прототипа).
export function addToArmy(army: UnitStack[], unitId: string, count: number): UnitStack[] {
  const out = army.map(s => ({ ...s }));
  const ex = out.find(s => s.unitId === unitId);
  if (ex) {
    ex.count += count;
    return out;
  }
  if (out.length < 7) {
    out.push({ unitId, count });
    return out;
  }
  return out;
}

// Найти позицию для нового героя: клетка города, если свободна, иначе соседняя
// проходимая и непосещённая. Возвращает null, если совсем нет места.
export function findHeroSpawnPos(s: GameState, townPos: Coord): Coord | null {
  if (!s.map) return null;
  const occupied = new Set(Object.values(s.heroes).map(h => `${h.pos.x},${h.pos.y}`));
  if (!occupied.has(`${townPos.x},${townPos.y}`)) {
    const tile = s.map.tiles[townPos.y * s.map.width + townPos.x];
    if (tile.passable) return { x: townPos.x, y: townPos.y };
  }
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const x = townPos.x + dx;
      const y = townPos.y + dy;
      if (x < 0 || y < 0 || x >= s.map.width || y >= s.map.height) continue;
      const tile = s.map.tiles[y * s.map.width + x];
      if (!tile.passable) continue;
      if (tile.objectId) {
        const obj = s.map.objects[tile.objectId];
        if (!obj.passable) continue;
      }
      if (occupied.has(`${x},${y}`)) continue;
      return { x, y };
    }
  }
  return null;
}

// Применить эффект гильдии магов: герой учит все доступные в городе заклинания
// и восстанавливает ману до эффективного максимума (с учётом артефактов).
export function applyMageGuildVisit(hero: Hero, town: Town): Hero {
  if (town.learnedSpells.length === 0) return hero;
  const before = new Set(hero.spells);
  const next = new Set(hero.spells);
  for (const s of town.learnedSpells) next.add(s);
  const effMax = getEffectiveMaxMana(hero);
  const learnedSomething = next.size !== before.size;
  if (!learnedSomething && hero.mana >= effMax) return hero;
  return { ...hero, spells: [...next], mana: effMax };
}

// Пересборка армии стороны после боя: для каждого изначального слота берём
// фактический count из соответствующего боевого стека.
export function computeArmyAfterBattle(
  b: BattleState,
  side: "attacker" | "defender",
  original: UnitStack[],
): UnitStack[] {
  const sideStacks = b.stacks.filter(s => s.side === side);
  const out: UnitStack[] = [];
  for (let i = 0; i < original.length; i++) {
    const bs = sideStacks[i];
    if (!bs || bs.count <= 0) continue;
    out.push({ unitId: original[i].unitId, count: bs.count });
  }
  return out;
}
