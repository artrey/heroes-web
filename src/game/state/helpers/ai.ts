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
// шахта/город, иначе монстр, которого мы заведомо вынесем (1.5×).
export function pickAiTarget(state: GameState, hero: Hero): Coord | null {
  if (!state.map) return null;
  let best: { d: number; pos: Coord } | null = null;
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
      const monsterUnit = UNITS[obj.unitId!];
      const monsterPower = monsterUnit.hp * (obj.unitCount ?? 0);
      const heroPower = hero.army.reduce((acc, st) => acc + UNITS[st.unitId].hp * st.count, 0);
      if (heroPower > monsterPower * 1.5) {
        const d = chebyshev(hero.pos, obj.pos) + 1;
        if (!best || d < best.d) best = { d, pos: obj.pos };
      }
    }
  }
  return best?.pos ?? null;
}
