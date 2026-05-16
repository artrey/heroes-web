import type { Coord, GameState, Player } from "../types";
import { VISION_RADIUS_HERO, VISION_RADIUS_TOWN } from "../types";

// Возвращает новый объект revealed с добавленными тайлами в радиусе вокруг pos.
export function revealAround(
  revealed: Record<string, true>,
  pos: Coord,
  radius: number,
  width: number,
  height: number,
): Record<string, true> {
  const out = { ...revealed };
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = pos.x + dx;
      const y = pos.y + dy;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      if (Math.max(Math.abs(dx), Math.abs(dy)) > radius) continue;
      out[`${x},${y}`] = true;
    }
  }
  return out;
}

// Текущая видимая зона игрока — вычисляется из позиций его героев и городов на лету.
// Не сохраняется в state, нужна только для рендера и проверок «можно ли видеть прямо сейчас».
export function computeVisibleTiles(state: GameState, playerId: string): Set<string> {
  const out = new Set<string>();
  if (!state.map) return out;
  const player = state.players[playerId];
  if (!player) return out;
  for (const hid of player.heroIds) {
    const h = state.heroes[hid];
    if (h) addCircle(out, h.pos, VISION_RADIUS_HERO, state.map.width, state.map.height);
  }
  for (const tid of player.townIds) {
    const t = state.towns[tid];
    if (t) addCircle(out, t.pos, VISION_RADIUS_TOWN, state.map.width, state.map.height);
  }
  return out;
}

function addCircle(set: Set<string>, pos: Coord, radius: number, w: number, h: number) {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = pos.x + dx;
      const y = pos.y + dy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      if (Math.max(Math.abs(dx), Math.abs(dy)) > radius) continue;
      set.add(`${x},${y}`);
    }
  }
}

// Помечает все тайлы карты как уже виденные (нужно при миграции существующих сохранений).
export function fullyRevealed(width: number, height: number): Record<string, true> {
  const out: Record<string, true> = {};
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) out[`${x},${y}`] = true;
  }
  return out;
}

// Расширяет revealed для игрока новой круговой зоной. Возвращает обновлённого player.
export function revealForPlayer(player: Player, pos: Coord, radius: number, width: number, height: number): Player {
  const newRevealed = revealAround(player.revealed ?? {}, pos, radius, width, height);
  return { ...player, revealed: newRevealed };
}
