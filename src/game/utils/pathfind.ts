import type { Coord, GameMap } from "../types";

// Стандартный A* для 8-связной сетки. Возвращает массив координат от старта (не включая) до цели.
// Если путь не найден — возвращает null.

// Стоимость шагов в очках движения героя. Прямая клетка — 100,
// диагональ — round(100 * √2) = 141.
export const STEP_STRAIGHT = 100;
export const STEP_DIAG = Math.round(STEP_STRAIGHT * Math.SQRT2);

export function stepCost(dx: number, dy: number): number {
  return dx !== 0 && dy !== 0 ? STEP_DIAG : STEP_STRAIGHT;
}

interface Node {
  x: number;
  y: number;
  g: number;
  f: number;
  parent: Node | null;
}

const DIRS: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

function key(x: number, y: number) {
  return `${x},${y}`;
}

function heuristic(ax: number, ay: number, bx: number, by: number) {
  // Octile distance в тех же единицах, что и stepCost (MP).
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return STEP_STRAIGHT * Math.max(dx, dy) + (STEP_DIAG - STEP_STRAIGHT) * Math.min(dx, dy);
}

export function isPassable(map: GameMap, x: number, y: number, allowGoalObject = false, goal?: Coord): boolean {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false;
  const t = map.tiles[y * map.width + x];
  if (!t.passable) return false;
  if (t.objectId) {
    const obj = map.objects[t.objectId];
    // Если объект не позволяет стоять на нём, и это не цель — непроходим.
    const isGoal = goal && goal.x === x && goal.y === y;
    if (!obj.passable && !(allowGoalObject && isGoal)) return false;
  }
  return true;
}

export interface PathOptions {
  // Если задан — путь проходит только по тайлам, для которых revealed[key] === true.
  // Цель тоже должна быть видна; иначе путь не строится.
  revealed?: Record<string, true>;
  // Клетки «зоны контроля» (соседи монстров/враждебных героев). Их можно использовать
  // только как цель пути, но не как промежуточный шаг.
  dangerCells?: Set<string>;
}

export function findPath(map: GameMap, start: Coord, goal: Coord, options: PathOptions = {}): Coord[] | null {
  if (start.x === goal.x && start.y === goal.y) return [];
  const { revealed, dangerCells } = options;
  const goalKey = `${goal.x},${goal.y}`;
  if (revealed && revealed[goalKey] !== true) return null;
  const startNode: Node = {
    x: start.x,
    y: start.y,
    g: 0,
    f: heuristic(start.x, start.y, goal.x, goal.y),
    parent: null,
  };
  const open: Node[] = [startNode];
  const openMap = new Map<string, Node>();
  const closed = new Set<string>();
  openMap.set(key(start.x, start.y), startNode);

  while (open.length) {
    // Выбор узла с минимальным f. Для прототипа простая линейная выборка — карта небольшая.
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[bestIdx].f) bestIdx = i;
    }
    const cur = open.splice(bestIdx, 1)[0];
    const k = key(cur.x, cur.y);
    openMap.delete(k);
    closed.add(k);

    if (cur.x === goal.x && cur.y === goal.y) {
      const path: Coord[] = [];
      let node: Node | null = cur;
      while (node && node.parent) {
        path.unshift({ x: node.x, y: node.y });
        node = node.parent;
      }
      return path;
    }

    for (const [dx, dy] of DIRS) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      const nk = key(nx, ny);
      if (closed.has(nk)) continue;
      if (!isPassable(map, nx, ny, true, goal)) continue;
      if (revealed && revealed[nk] !== true) continue;
      // Danger-cell можно использовать только как конечную точку.
      if (dangerCells && dangerCells.has(nk) && nk !== goalKey) continue;
      const g = cur.g + stepCost(dx, dy);
      const existing = openMap.get(nk);
      if (existing && existing.g <= g) continue;
      const f = g + heuristic(nx, ny, goal.x, goal.y);
      const node: Node = { x: nx, y: ny, g, f, parent: cur };
      if (existing) {
        existing.g = g;
        existing.f = f;
        existing.parent = cur;
      } else {
        open.push(node);
        openMap.set(nk, node);
      }
    }
  }
  return null;
}

export function pathCost(path: Coord[], start: Coord): number {
  let cost = 0;
  let prev = start;
  for (const p of path) {
    const dx = Math.abs(p.x - prev.x);
    const dy = Math.abs(p.y - prev.y);
    cost += stepCost(dx, dy);
    prev = p;
  }
  return cost;
}

export function chebyshev(a: Coord, b: Coord) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}
