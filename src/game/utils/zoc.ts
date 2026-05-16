import type { GameMap, Hero } from "../types";

// Зона контроля (Zone of Control) — клетки, соседние с агрессивными объектами:
// нейтральными монстрами и вражескими героями. По этим клеткам нельзя пройти
// «насквозь» и нельзя на них встать просто чтобы подобрать ресурс. Сами клетки
// опасных объектов в danger-set не входят: до них как раз надо подойти, чтобы
// сразиться.
export interface DangerInfo {
  cells: Set<string>; // соседи опасных объектов — запрещённые тайлы
  sources: Set<string>; // позиции самих монстров/вражеских героев — цели атаки
}

export function computeDanger(map: GameMap, heroes: Record<string, Hero>, ownerId: string): DangerInfo {
  const cells = new Set<string>();
  const sources = new Set<string>();
  const w = map.width;
  const h = map.height;
  const addNeighbors = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        cells.add(`${nx},${ny}`);
      }
    }
  };
  for (const obj of Object.values(map.objects)) {
    if (obj.kind === "monster") {
      sources.add(`${obj.pos.x},${obj.pos.y}`);
      addNeighbors(obj.pos.x, obj.pos.y);
    }
  }
  for (const hero of Object.values(heroes)) {
    if (hero.ownerId !== ownerId) {
      sources.add(`${hero.pos.x},${hero.pos.y}`);
      addNeighbors(hero.pos.x, hero.pos.y);
    }
  }
  return { cells, sources };
}
