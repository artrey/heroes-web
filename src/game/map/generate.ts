import { ARTIFACT_IDS, ARTIFACTS } from "../data/artifacts";
import { getTemplate } from "../data/templates";
import { UNITS } from "../data/units";
import type { Coord, Faction, GameMap, MapObject, Resource, Terrain, Tile } from "../types";
import { makeId } from "../utils/id";
import { mulberry32, randChoice, randInt, shuffle } from "../utils/rng";

interface GenInput {
  templateId: string;
  width: number;
  height: number;
  seed: number;
  playerCount: number; // включая человека
  factions: Faction[]; // длиной playerCount
}

export interface GenOutput {
  map: GameMap;
  playerStarts: Array<{ townPos: Coord; heroPos: Coord; faction: Faction }>;
}

const TERRAIN_COSTS: Partial<Record<Terrain, number>> = {
  grass: 100,
  dirt: 100,
  sand: 150,
  rough: 125,
  snow: 150,
};

export function generateMap(input: GenInput): GenOutput {
  const tmpl = getTemplate(input.templateId);
  const rng = mulberry32(input.seed);
  const W = input.width;
  const H = input.height;

  // 1) Базовый ландшафт.
  const tiles: Tile[] = new Array(W * H).fill(null).map(() => ({
    terrain: "grass" as Terrain,
    passable: true,
    objectId: null,
  }));

  // Добавим биомы: пятна песка, грязи, грубой земли, снега.
  const biomes: { terrain: Terrain; blobs: number; radius: [number, number] }[] = [
    { terrain: "dirt", blobs: 4, radius: [3, 5] },
    { terrain: "sand", blobs: 2, radius: [2, 4] },
    { terrain: "rough", blobs: 3, radius: [2, 3] },
  ];
  for (const b of biomes) {
    for (let i = 0; i < b.blobs; i++) {
      const cx = randInt(rng, 2, W - 3);
      const cy = randInt(rng, 2, H - 3);
      const r = randInt(rng, b.radius[0], b.radius[1]);
      for (let y = -r; y <= r; y++) {
        for (let x = -r; x <= r; x++) {
          const dist = Math.sqrt(x * x + y * y);
          if (dist > r) continue;
          if (rng() < 1 - dist / r) {
            const tx = cx + x;
            const ty = cy + y;
            if (tx >= 0 && ty >= 0 && tx < W && ty < H) {
              tiles[ty * W + tx].terrain = b.terrain;
            }
          }
        }
      }
    }
  }

  // 2) Точки старта игроков. Равномерно разнесены по карте.
  const playerStarts: GenOutput["playerStarts"] = [];
  const placedTowns: Coord[] = [];
  const minTownDist = Math.floor(Math.min(W, H) / 2.2);
  for (let i = 0; i < input.playerCount; i++) {
    // Углы карты для асимметричного размещения.
    const angle = (i / input.playerCount) * Math.PI * 2 + 0.4;
    const rx = Math.cos(angle) * Math.min(W, H) * 0.35;
    const ry = Math.sin(angle) * Math.min(W, H) * 0.35;
    const tx = Math.max(3, Math.min(W - 4, Math.floor(W / 2 + rx)));
    const ty = Math.max(3, Math.min(H - 4, Math.floor(H / 2 + ry)));
    const pos: Coord = { x: tx, y: ty };
    placedTowns.push(pos);
    // Герой рядом с городом — на свободной клетке.
    const heroPos = findOpenAround(tiles, W, H, pos, 2) ?? pos;
    playerStarts.push({ townPos: pos, heroPos, faction: input.factions[i] });
    void minTownDist;
  }

  const objects: Record<string, MapObject> = {};

  // 3) Препятствия: горы и леса. Создают рельеф и узкие проходы.
  const obstaclesPerTile = 0.18;
  for (let i = 0; i < W * H * obstaclesPerTile; i++) {
    const x = randInt(rng, 0, W - 1);
    const y = randInt(rng, 0, H - 1);
    // Не блокируем стартовые зоны игроков.
    if (isNearAny(placedTowns, x, y, 3)) continue;
    const t = tiles[y * W + x];
    if (t.objectId) continue;
    const kind = rng() < 0.5 ? "mountain" : "tree";
    const obj: MapObject = {
      id: makeId("obs"),
      kind: kind as "mountain" | "tree",
      pos: { x, y },
      blocking: true,
      passable: false,
      icon: kind === "mountain" ? "⛰️" : "🌲",
    };
    // Не блокируем все 8 соседей.
    if (countBlockedNeighbors(tiles, W, H, x, y) >= 4) continue;
    t.terrain = kind === "mountain" ? "rough" : "grass";
    t.passable = false;
    t.objectId = obj.id;
    objects[obj.id] = obj;
  }

  // 4) Ресурсные кучки.
  const resourceTypes: Resource[] = ["gold", "wood", "ore", "mercury", "sulfur", "crystal", "gems"];
  const resourceCount = Math.floor(W * H * tmpl.resourceDensity * 0.04);
  for (let i = 0; i < resourceCount; i++) {
    const pos = findEmptyTile(rng, tiles, W, H, placedTowns, 2);
    if (!pos) continue;
    const res = randChoice(rng, resourceTypes);
    const amount = res === "gold" ? randInt(rng, 500, 1500) : randInt(rng, 3, 8);
    const obj: MapObject = {
      id: makeId("res"),
      kind: "resource",
      pos,
      resource: res,
      amount,
      blocking: false,
      passable: true,
      icon: RESOURCE_ICONS_LOCAL[res],
    };
    tiles[pos.y * W + pos.x].objectId = obj.id;
    objects[obj.id] = obj;
  }

  // 5) Шахты. Дают доход каждый день.
  const mineResources: Resource[] = ["gold", "wood", "ore", "mercury", "sulfur", "crystal", "gems"];
  const shuffledMines = shuffle(rng, mineResources);
  for (let i = 0; i < tmpl.mineCount; i++) {
    const pos = findEmptyTile(rng, tiles, W, H, placedTowns, 4);
    if (!pos) continue;
    const res = shuffledMines[i % shuffledMines.length];
    const yieldAmount = res === "gold" ? 1000 : res === "wood" || res === "ore" ? 2 : 1;
    const obj: MapObject = {
      id: makeId("mine"),
      kind: "mine",
      pos,
      ownerId: null,
      mineResource: res,
      mineYield: yieldAmount,
      blocking: false,
      passable: true,
      icon: MINE_ICONS[res],
    };
    tiles[pos.y * W + pos.x].objectId = obj.id;
    objects[obj.id] = obj;
  }

  // 6) Нейтральные монстры. Охраняют ресурсные точки и просто разбросаны.
  const monsterCount = Math.floor(W * H * tmpl.monsterDensity * 0.03);
  const allUnitIds = Object.keys(UNITS);
  for (let i = 0; i < monsterCount; i++) {
    const pos = findEmptyTile(rng, tiles, W, H, placedTowns, 4);
    if (!pos) continue;
    const unitId = randChoice(rng, allUnitIds);
    const unit = UNITS[unitId];
    const count = Math.max(1, randInt(rng, 1, Math.max(2, Math.floor(20 / unit.tier))));
    const obj: MapObject = {
      id: makeId("mon"),
      kind: "monster",
      pos,
      unitId,
      unitCount: count,
      blocking: true,
      passable: false, // нельзя наступить; герой телепортируется на клетку после победы
      icon: unit.icon,
    };
    tiles[pos.y * W + pos.x].objectId = obj.id;
    objects[obj.id] = obj;
  }

  // 7) Сундуки.
  const chestCount = Math.floor(W * H * 0.012);
  for (let i = 0; i < chestCount; i++) {
    const pos = findEmptyTile(rng, tiles, W, H, placedTowns, 2);
    if (!pos) continue;
    const obj: MapObject = {
      id: makeId("chest"),
      kind: "chest",
      pos,
      goldAmount: randInt(rng, 500, 2000),
      blocking: false,
      passable: true,
      icon: "🎁",
    };
    tiles[pos.y * W + pos.x].objectId = obj.id;
    objects[obj.id] = obj;
  }

  // 8) Артефакты — рандомные из пула, заметно реже сундуков.
  const artifactCount = Math.floor(W * H * 0.005);
  for (let i = 0; i < artifactCount; i++) {
    const pos = findEmptyTile(rng, tiles, W, H, placedTowns, 3);
    if (!pos) continue;
    const artifactId = randChoice(rng, ARTIFACT_IDS);
    const obj: MapObject = {
      id: makeId("art"),
      kind: "artifact",
      pos,
      artifactId,
      blocking: false,
      passable: true,
      icon: ARTIFACTS[artifactId].icon,
    };
    tiles[pos.y * W + pos.x].objectId = obj.id;
    objects[obj.id] = obj;
  }

  return {
    map: { width: W, height: H, tiles, objects },
    playerStarts,
  };
}

const RESOURCE_ICONS_LOCAL: Record<Resource, string> = {
  gold: "🪙",
  wood: "🪵",
  ore: "⛏️",
  mercury: "🧪",
  sulfur: "🟡",
  crystal: "💎",
  gems: "💍",
};

const MINE_ICONS: Record<Resource, string> = {
  gold: "🏦",
  wood: "🪚",
  ore: "⛏️",
  mercury: "⚗️",
  sulfur: "🌋",
  crystal: "🔮",
  gems: "💠",
};

function findOpenAround(tiles: Tile[], W: number, H: number, c: Coord, radius: number): Coord | null {
  for (let r = 1; r <= radius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = c.x + dx;
        const y = c.y + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const t = tiles[y * W + x];
        if (t.passable && !t.objectId) return { x, y };
      }
    }
  }
  return null;
}

function isNearAny(points: Coord[], x: number, y: number, dist: number): boolean {
  return points.some(p => Math.abs(p.x - x) <= dist && Math.abs(p.y - y) <= dist);
}

function countBlockedNeighbors(tiles: Tile[], W: number, H: number, x: number, y: number): number {
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) {
        n++;
        continue;
      }
      if (!tiles[ny * W + nx].passable) n++;
    }
  }
  return n;
}

function findEmptyTile(
  rng: () => number,
  tiles: Tile[],
  W: number,
  H: number,
  avoid: Coord[],
  avoidRadius: number,
  maxTries = 50,
): Coord | null {
  for (let i = 0; i < maxTries; i++) {
    const x = randInt(rng, 1, W - 2);
    const y = randInt(rng, 1, H - 2);
    if (isNearAny(avoid, x, y, avoidRadius)) continue;
    const t = tiles[y * W + x];
    if (t.passable && !t.objectId) return { x, y };
  }
  return null;
}

export function getMoveCost(terrain: Terrain): number {
  return TERRAIN_COSTS[terrain] ?? 100;
}
