import { ANIM_SPEED_SCALE, useSettings } from "../../../ui/settingsStore";
import { getPreset } from "../../data/difficulty";
import { UNITS } from "../../data/units";
import type { Coord, GameMap, GameState, Hero, HeroBonus } from "../../types";
import { chebyshev, findPath } from "../../utils/pathfind";

// Боевой бонус ИИ из текущей сложности — применяем к стороне, чей герой принадлежит
// ИИ (или к защитнику, если нейтральные охраняют объект и они тоже считаются
// «не-человеком»).
export function aiBattleBonus(state: GameState, hero: Hero | null): Partial<HeroBonus> | undefined {
  if (!state.options) return undefined;
  const preset = getPreset(state.options.difficulty);
  if (!preset.aiCombatBonus.attack && !preset.aiCombatBonus.defense) return undefined;
  // Защитник без героя — нейтральный монстр/гарнизон, бонусы для них не применяем.
  if (!hero) return undefined;
  const owner = state.players[hero.ownerId];
  if (!owner || owner.isHuman) return undefined;
  return preset.aiCombatBonus;
}

// Длительность паузы между шагами ИИ ≈ длительности анимации движения на карте
// (см. AdventureScreen). Если игрок выбрал «мгновенно» — без пауз.
export function waitForAiMoveAnim(from: Coord, to: Coord, map: GameMap): Promise<void> {
  const scale = ANIM_SPEED_SCALE[useSettings.getState().animSpeed];
  if (scale === 0) return Promise.resolve();
  const path = findPath(map, from, to);
  const steps = path && path.length > 0 ? path.length : Math.max(1, chebyshev(from, to));
  const ms = Math.min(900, 120 * steps) * scale + 40;
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

// Эвристика «куда пойти этому ИИ-герою»: ближайший ресурс/сундук, иначе чужие
// шахта/город, иначе слабый монстр или вражеский герой, которого вынесем (1.5×).
// Если рядом нет ни одной из этих целей — фолбэк на разведку:
// идём к ближайшей открытой клетке-фронтиру (с неоткрытыми соседями).
export function pickAiTarget(state: GameState, hero: Hero): Coord | null {
  if (!state.map) return null;
  let best: { d: number; pos: Coord } | null = null;
  const heroPower = hero.army.reduce((acc, st) => acc + UNITS[st.unitId].hp * st.count, 0);
  for (const obj of Object.values(state.map.objects)) {
    if (obj.kind === "resource" || obj.kind === "chest") {
      const d = chebyshev(hero.pos, obj.pos);
      if (!best || d < best.d) best = { d, pos: obj.pos };
    } else if (obj.kind === "mine" && obj.ownerId !== hero.ownerId) {
      const d = chebyshev(hero.pos, obj.pos) + 2;
      if (!best || d < best.d) best = { d, pos: obj.pos };
    } else if (obj.kind === "dwelling" && obj.ownerId !== hero.ownerId) {
      const d = chebyshev(hero.pos, obj.pos) + 5;
      if (!best || d < best.d) best = { d, pos: obj.pos };
    } else if (obj.kind === "monster") {
      const monsterUnit = UNITS[obj.unitId];
      const monsterPower = monsterUnit.hp * obj.unitCount;
      if (heroPower > monsterPower * 1.5) {
        const d = chebyshev(hero.pos, obj.pos) + 1;
        if (!best || d < best.d) best = { d, pos: obj.pos };
      }
    }
  }
  // Вражеские герои — добавляем как цель только если уверенно сильнее.
  for (const other of Object.values(state.heroes)) {
    if (other.id === hero.id) continue;
    if (other.ownerId === hero.ownerId) continue;
    const otherPower = other.army.reduce((acc, st) => acc + UNITS[st.unitId].hp * st.count, 0);
    if (heroPower > otherPower * 1.3) {
      const d = chebyshev(hero.pos, other.pos) + 2;
      if (!best || d < best.d) best = { d, pos: other.pos };
    }
  }
  if (best) return best.pos;
  return pickExploreTarget(state, hero);
}

// Фронтир для разведки: открытая проходимая клетка, у которой хотя бы один
// сосед ещё в тумане. ИИ цельтся в неё, чтобы расширить обзор. Если поверх
// клетки есть объект (кроме ресурса/сундука) — пропускаем, иначе герой может
// застрять, упёршись в чужой город. Берём ближайшую по chebyshev.
function pickExploreTarget(state: GameState, hero: Hero): Coord | null {
  const map = state.map;
  if (!map) return null;
  const owner = state.players[hero.ownerId];
  if (!owner) return null;
  const revealed = owner.revealed;
  let best: { d: number; pos: Coord } | null = null;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (!revealed[`${x},${y}`]) continue;
      const tile = map.tiles[y * map.width + x];
      if (!tile.passable) continue;
      if (tile.objectId) {
        const obj = map.objects[tile.objectId];
        if (obj && obj.kind !== "resource" && obj.kind !== "chest") continue;
      }
      let hasUnrevealedNeighbor = false;
      outer: for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
          if (!revealed[`${nx},${ny}`]) {
            hasUnrevealedNeighbor = true;
            break outer;
          }
        }
      }
      if (!hasUnrevealedNeighbor) continue;
      const d = chebyshev(hero.pos, { x, y });
      if (!best || d < best.d) best = { d, pos: { x, y } };
    }
  }
  return best?.pos ?? null;
}
