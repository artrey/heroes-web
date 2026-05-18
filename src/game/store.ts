import { create } from "zustand";
import { persist } from "zustand/middleware";

import { useNet } from "../net/netStore";
import { ANIM_SPEED_SCALE, useSettings } from "../ui/settingsStore";
import {
  doAttack,
  doCastSpell,
  doDefend,
  doMove,
  doShoot,
  doWait,
  isBattleOver,
  startBattle,
  stepBattleAI,
} from "./battle/engine";
import { ARTIFACTS, getArtifact } from "./data/artifacts";
import { FACTION_BUILDINGS, getBuilding, MAGE_GUILD_LEVEL } from "./data/buildings";
import { getPreset } from "./data/difficulty";
import { FACTION_LIST, FACTION_META } from "./data/factions";
import { getHeroProto, pickHeroProto } from "./data/heroes";
import { reverseRate } from "./data/marketRates";
import { rollSpellsForGuildLevel } from "./data/spells";
import { FACTION_UNIT_ORDER, getUnit, UNITS } from "./data/units";
import { generateMap } from "./map/generate";
import type {
  ArtifactSlot,
  BattleState,
  Coord,
  Faction,
  GameState,
  Hero,
  HeroArtifacts,
  HeroBonus,
  LogEntry,
  NewGameOptions,
  Player,
  Resource,
  ResourceBag,
  Town,
  UnitStack,
} from "./types";
import { ARTIFACT_SLOT_ORDER, VISION_RADIUS_HERO, VISION_RADIUS_TOWN } from "./types";
import { getEffectiveKnowledge, getEffectiveMaxMana, getEffectiveMaxMP } from "./utils/heroBonus";
import { makeId, resetIdCounter } from "./utils/id";
import { levelFromXp } from "./utils/leveling";
import { chebyshev, findPath, STEP_STRAIGHT, stepCost } from "./utils/pathfind";
import { add, canAfford, pay, RESOURCE_NAMES } from "./utils/resources";
import { mulberry32, randInt } from "./utils/rng";
import { revealForPlayer } from "./utils/visibility";
import { computeDanger } from "./utils/zoc";

const PLAYER_COLORS = ["#d04040", "#4080d0", "#40b040", "#d0a040", "#a040b0", "#40b0b0", "#d04080", "#808080"];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function clockTag(): string {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

// Префикс игрового дня + локальное время для записей лога приключений.
// playerId — кому видна запись (UI фильтрует). undefined → глобальное событие.
function logLine(day: number, text: string, playerId?: string): LogEntry {
  return { text: `[${clockTag()}] [Д${day}] ${text}`, playerId };
}

// Удобный шорткат: одна и та же запись для нескольких игроков (например, обе
// стороны боя должны видеть исход). Пустые/повторяющиеся id отбрасываются.
function logForPlayers(day: number, text: string, ...playerIds: Array<string | null | undefined>): LogEntry[] {
  const unique = Array.from(new Set(playerIds.filter((id): id is string => !!id)));
  if (unique.length === 0) return [logLine(day, text)];
  return unique.map(pid => logLine(day, text, pid));
}

const HERO_HIRE_COST: Partial<ResourceBag> = { gold: 2500 };

function findHeroSpawnPos(s: GameState, townPos: Coord): Coord | null {
  if (!s.map) return null;
  const occupied = new Set(Object.values(s.heroes).map(h => `${h.pos.x},${h.pos.y}`));
  // Сначала клетка самого города (она passable=true).
  if (!occupied.has(`${townPos.x},${townPos.y}`)) {
    return { x: townPos.x, y: townPos.y };
  }
  // Соседние клетки.
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

// Сетевой гейт для action'ов. В sp/host выполняем функцию обычным путём; в client
// просто шлём команду хосту и возвращаем undefined (UI пока не дождётся ответа).
// Это даёт минимальную инвазию в существующий код — оборачиваем каждое сетевое
// действие при определении.
function gate<A extends unknown[], R>(name: string, fn: (...args: A) => R): (...args: A) => R | undefined {
  return (...args: A) => {
    const net = useNet.getState();
    if (net.role === "client") {
      net.client?.send({ type: "action", name, args });
      return undefined;
    }
    return fn(...args);
  };
}

const initialState: GameState = {
  phase: "menu",
  day: 1,
  week: 1,
  month: 1,
  activePlayerId: "",
  players: {},
  playerOrder: [],
  heroes: {},
  towns: {},
  map: null,
  battle: null,
  selectedHeroId: null,
  selectedTownId: null,
  meetingHeroIds: null,
  pendingObjectVisit: null,
  pendingMoveAfterCombat: null,
  pendingInteraction: null,
  options: null,
  log: [],
  winnerId: null,
};

// Возврат с | undefined у gate-обёрнутых action'ов нужен из-за сетевого режима:
// на клиенте действие лишь отправляется хосту и сразу возвращает undefined.
interface Actions {
  goToMenu: () => void;
  goToNewGame: () => void;
  goToMultiplayer: () => void;
  startGame: (opts: NewGameOptions) => void;
  selectHero: (id: string | null) => void;
  selectTown: (id: string | null) => void;
  // heroId опционален: SP читает s.selectedHeroId, MP — клиент явно шлёт свой
  // выбор, иначе host попытается двигать своего героя.
  moveHeroTo: (target: Coord, heroId?: string) => "ok" | "blocked" | "noPoints" | "noPath" | "interaction" | undefined;
  endTurn: () => void;
  openTown: (id: string) => void;
  closeTown: () => void;
  openHero: (id: string) => void;
  closeHero: () => void;
  buildBuilding: (townId: string, buildingId: string) => boolean | undefined;
  hireUnits: (townId: string, unitId: string, count: number) => boolean | undefined;
  hireHero: (townId: string, protoId?: string) => boolean | undefined;
  tradeResource: (townId: string, from: Resource, to: Resource, fromQty: number) => boolean | undefined;
  garrisonToHero: (townId: string, slotIdx: number) => void;
  heroToGarrison: (heroId: string, slotIdx: number) => void;
  openHeroMeeting: (otherHeroId: string) => boolean | undefined;
  closeHeroMeeting: () => void;
  swapArmySlots: (heroIdA: string, slotA: number, heroIdB: string, slotB: number) => void;
  equipFromBackpack: (heroId: string, backpackIdx: number) => void;
  unequipToBackpack: (heroId: string, slot: ArtifactSlot) => void;
  transferArtifact: (
    fromHeroId: string,
    source: { kind: "equipped"; slot: ArtifactSlot } | { kind: "backpack"; idx: number },
    toHeroId: string,
  ) => void;
  transferAllArmy: (fromHeroId: string, toHeroId: string) => void;
  transferAllArtifacts: (fromHeroId: string, toHeroId: string) => void;
  battleAct: (action: BattleAction) => void;
  // Прямые действия в бою — заведены отдельными actions, чтобы по сети было
  // что прокидывать (раньше UI напрямую звал do* из engine и менял setState).
  battleAttack: (attackerId: string, defenderId: string, approachTo?: Coord) => void;
  battleShoot: (attackerId: string, defenderId: string) => void;
  battleMove: (stackId: string, to: Coord) => void;
  battleWait: (stackId: string) => void;
  battleDefend: (stackId: string) => void;
  battleCastSpell: (side: "attacker" | "defender", spellId: string, targetStackId: string) => void;
  battleStepAi: () => void;
  battleRunAuto: () => void;
  endBattleVictory: () => void;
  endBattleDefeat: () => void;
  // Завершить отложенную интеракцию: вызвать interactWithObject. Дергается UI после
  // окончания анимации перемещения; для ИИ — после await паузы анимации.
  commitInteraction: () => void;
  reset: () => void;
}

export type BattleAction =
  | { type: "move"; targetIdx: number; to: Coord }
  | { type: "attack"; targetIdx: number; defenderIdx: number; approachFrom?: Coord }
  | { type: "shoot"; targetIdx: number; defenderIdx: number }
  | { type: "wait"; targetIdx: number }
  | { type: "defend"; targetIdx: number };

export const useGame = create<GameState & Actions>()(
  persist(
    (set, get) => ({
      ...initialState,

      goToMenu: () => set({ phase: "menu" }),
      goToNewGame: () => set({ phase: "newGame" }),
      goToMultiplayer: () => set({ phase: "multiplayer" }),

      startGame: opts => {
        resetIdCounter();
        const factionRng = mulberry32(opts.seed ^ 0xfeedf00d);
        const numHumans = Math.max(1, opts.numHumans ?? 1);
        // Слоты людей берут фракции из humanFactions (если задано), иначе host —
        // playerFaction, остальные люди (если есть) — случайные.
        const factions: Faction[] = [];
        for (let i = 0; i < numHumans; i++) {
          factions.push(opts.humanFactions?.[i] ?? (i === 0 ? opts.playerFaction : opts.playerFaction));
        }
        for (let i = numHumans; i < 1 + opts.opponentCount; i++) {
          factions.push(FACTION_LIST[Math.floor(factionRng() * FACTION_LIST.length)]);
        }
        const playerCount = 1 + opts.opponentCount;

        const { map, playerStarts } = generateMap({
          templateId: opts.templateId,
          width: opts.mapWidth,
          height: opts.mapHeight,
          seed: opts.seed,
          playerCount,
          factions,
        });

        const rng = mulberry32(opts.seed ^ 0xdeadbeef);
        const preset = getPreset(opts.difficulty);
        const players: Record<string, Player> = {};
        const heroes: Record<string, Hero> = {};
        const towns: Record<string, Town> = {};
        const playerOrder: string[] = [];

        for (let i = 0; i < playerCount; i++) {
          const start = playerStarts[i];
          const pid = makeId("p");
          playerOrder.push(pid);

          // Первые `numHumans` слотов — игроки-люди. В одиночке это 1, в MP — сколько хост задал.
          const numHumans = Math.max(1, opts.numHumans ?? 1);
          const isAi = i >= numHumans;

          // Город.
          const tid = makeId("t");
          const town: Town = {
            id: tid,
            ownerId: pid,
            name: i === 0 ? `${opts.playerName} — столица` : isAi ? `Бастион ${i}` : `Союзник ${i} — столица`,
            faction: start.faction,
            pos: start.townPos,
            built: ["villageHall"],
            builtToday: false,
            garrison: [],
            availableUnits: { [`${FACTION_UNIT_ORDER[start.faction][0]}`]: 0 },
            hasFort: false,
            mageGuildLevel: 0,
            learnedSpells: [],
          };
          towns[tid] = town;
          // Положим объект-города на карту.
          map.tiles[town.pos.y * map.width + town.pos.x].objectId = tid;
          map.objects[tid] = {
            id: tid,
            kind: "dwelling",
            pos: town.pos,
            ownerId: pid,
            blocking: true,
            passable: true,
            icon: FACTION_META[start.faction].icon,
          };

          // Герой.
          const proto = pickHeroProto(start.faction, rng);
          const hid = makeId("h");
          const armyMult = isAi ? preset.aiArmyMult : 1;
          const army: UnitStack[] = proto.startingArmy.map(s => ({
            unitId: s.unitId,
            count: Math.max(1, Math.round(randInt(rng, s.min, s.max) * armyMult)),
          }));
          const baseMana = proto.baseStats.knowledge * 10;
          const hero: Hero = {
            id: hid,
            ownerId: pid,
            name: proto.name,
            faction: start.faction,
            pos: start.heroPos,
            movePoints: 1500,
            maxMovePoints: 1500,
            army,
            artifacts: { equipped: {}, backpack: [] },
            level: 1,
            xp: 0,
            statBonus: { attack: 0, defense: 0, spellPower: 0, knowledge: 0 },
            attack: proto.baseStats.attack,
            defense: proto.baseStats.defense,
            spellPower: proto.baseStats.spellPower,
            knowledge: proto.baseStats.knowledge,
            mana: baseMana,
            maxMana: baseMana,
            spells: [],
            icon: proto.icon,
          };
          heroes[hid] = hero;

          // Игрок.
          const res: ResourceBag = isAi ? { ...preset.aiResources } : { ...preset.playerResources };
          let player: Player = {
            id: pid,
            name: i === 0 ? opts.playerName : isAi ? `Противник ${i}` : `Игрок ${i + 1}`,
            color: PLAYER_COLORS[i],
            faction: start.faction,
            isHuman: !isAi,
            defeated: false,
            resources: res,
            heroIds: [hid],
            townIds: [tid],
            revealed: {},
          };
          // Изначально игрок видит зону вокруг своего города и стартового героя.
          player = revealForPlayer(player, town.pos, VISION_RADIUS_TOWN, map.width, map.height);
          player = revealForPlayer(player, hero.pos, VISION_RADIUS_HERO, map.width, map.height);
          players[pid] = player;
        }

        set({
          phase: "adventure",
          day: 1,
          week: 1,
          month: 1,
          activePlayerId: playerOrder[0],
          players,
          playerOrder,
          heroes,
          towns,
          map,
          selectedHeroId: heroes[Object.keys(heroes)[0]].id,
          selectedTownId: null,
          options: opts,
          log: [logLine(1, "Игра началась.")],
          battle: null,
          pendingObjectVisit: null,
          pendingInteraction: null,
          winnerId: null,
        });
      },

      reset: () => {
        resetIdCounter();
        set({ ...initialState });
      },

      // Локальные UI-действия — не нужны в сети: у каждого клиента свой выбор/фаза.
      selectHero: (id: string | null) => set({ selectedHeroId: id }),
      selectTown: (id: string | null) => set({ selectedTownId: id }),

      moveHeroTo: gate("moveHeroTo", (target: Coord, explicitHeroId?: string) => {
        const s = get();
        const heroId = explicitHeroId ?? s.selectedHeroId;
        if (!heroId || !s.map) return "blocked";
        const hero = s.heroes[heroId];
        if (!hero) return "blocked";
        const activePlayer = s.players[s.activePlayerId];
        if (!activePlayer || !activePlayer.isHuman) return "blocked";
        if (hero.ownerId !== s.activePlayerId) return "blocked";

        const danger = computeDanger(s.map, s.heroes, hero.ownerId);
        // Если игрок целится в интерактивный объект под охраной, путь сначала ведём
        // к ближайшему стражу — после победы движение к исходной цели возобновится.
        let actualTarget = target;
        let pending: { heroId: string; target: Coord } | null = null;
        const targetKey = `${target.x},${target.y}`;
        const targetTile = s.map.tiles[target.y * s.map.width + target.x];
        const targetObj = targetTile.objectId ? s.map.objects[targetTile.objectId] : null;
        const isInteractive =
          !!targetObj &&
          (targetObj.kind === "resource" ||
            targetObj.kind === "chest" ||
            targetObj.kind === "artifact" ||
            targetObj.kind === "mine" ||
            targetObj.kind === "dwelling");
        if (isInteractive && danger.cells.has(targetKey)) {
          let guard: Coord | null = null;
          let bestDist = Infinity;
          for (const srcKey of danger.sources) {
            const [gx, gy] = srcKey.split(",").map(Number);
            if (Math.max(Math.abs(gx - target.x), Math.abs(gy - target.y)) !== 1) continue;
            const d = Math.max(Math.abs(gx - hero.pos.x), Math.abs(gy - hero.pos.y));
            if (d < bestDist) {
              bestDist = d;
              guard = { x: gx, y: gy };
            }
          }
          if (guard) {
            actualTarget = guard;
            pending = { heroId: hero.id, target };
          }
        }
        const path = findPath(s.map, hero.pos, actualTarget, {
          revealed: activePlayer.revealed,
          dangerCells: danger.cells,
          dangerSources: danger.sources,
        });
        if (!path || path.length === 0) return "noPath";
        if (pending !== s.pendingMoveAfterCombat) set({ pendingMoveAfterCombat: pending });

        // Идём по пути, пока хватает MP. На каждом шаге проверяем, не наступили ли на объект.
        let mp = hero.movePoints;
        let curPos = { ...hero.pos };
        const newHero: Hero = { ...hero, pos: curPos, army: hero.army.map(s => ({ ...s })) };
        let triggered: string | null = null;

        for (const step of path) {
          const dx = Math.abs(step.x - curPos.x);
          const dy = Math.abs(step.y - curPos.y);
          const cost = stepCost(dx, dy);
          if (mp < cost) break;
          const tile = s.map.tiles[step.y * s.map.width + step.x];
          // Чужой герой на этой клетке — не наступаем, инициируем бой.
          const otherHero = Object.values(s.heroes).find(
            h => h.id !== hero.id && h.pos.x === step.x && h.pos.y === step.y,
          );
          if (otherHero) {
            if (otherHero.ownerId === hero.ownerId) break; // свой — стоп
            // Запустить бой "герой против героя". Героя оставляем на предыдущей клетке.
            const battle = startBattle({
              attackerHero: newHero,
              defenderHero: otherHero,
              defenderObjectId: null,
              attackerExtraBonus: aiBattleBonus(s, newHero),
              defenderExtraBonus: aiBattleBonus(s, otherHero),
            });
            set({
              heroes: { ...s.heroes, [hero.id]: newHero },
              battle,
              phase: "battle",
            });
            return "interaction";
          }
          // Если на step стоит непроходимый объект — стоп; если он триггерный — запустить взаимодействие, не вступая.
          if (tile.objectId) {
            const obj = s.map.objects[tile.objectId];
            const interactive =
              obj.kind === "monster" ||
              obj.kind === "dwelling" ||
              obj.kind === "resource" ||
              obj.kind === "mine" ||
              obj.kind === "chest" ||
              obj.kind === "artifact";
            if (!obj.passable) {
              if (interactive) triggered = obj.id;
              break;
            }
          }
          mp -= cost;
          curPos = { ...step };
          newHero.pos = curPos;
          newHero.movePoints = mp;
          // Если на шаге есть проходимый триггерный объект — встать и сработать.
          if (tile.objectId) {
            const obj = s.map.objects[tile.objectId];
            if (obj.kind !== "tree" && obj.kind !== "mountain") {
              triggered = obj.id;
              break;
            }
          }
        }

        const heroes = { ...s.heroes, [hero.id]: newHero };
        // Открыть тайлы вокруг новой позиции героя.
        const updatedOwner = revealForPlayer(
          s.players[hero.ownerId],
          newHero.pos,
          VISION_RADIUS_HERO,
          s.map.width,
          s.map.height,
        );
        const players = { ...s.players, [hero.ownerId]: updatedOwner };
        // Если на пути есть интерактивный объект — откладываем взаимодействие до
        // конца анимации движения. commitInteraction вызовет UI, когда герой
        // визуально доедет до клетки.
        if (triggered) {
          set({ heroes, players, pendingInteraction: { objectId: triggered, heroId: hero.id } });
          return "interaction";
        }
        set({ heroes, players });
        if (newHero.movePoints < STEP_STRAIGHT) return "noPoints";
        return "ok";
      }),

      endTurn: gate("endTurn", () => {
        const s = get();
        const order = s.playerOrder;
        const curIdx = order.indexOf(s.activePlayerId);
        let nextIdx = (curIdx + 1) % order.length;
        // Пропустим побеждённых.
        let safety = 0;
        while (s.players[order[nextIdx]].defeated && safety < order.length) {
          nextIdx = (nextIdx + 1) % order.length;
          safety++;
        }

        // Новый день, если виток.
        let day = s.day,
          week = s.week,
          month = s.month;
        let log = s.log.slice();
        if (nextIdx <= curIdx) {
          day += 1;
          if ((day - 1) % 7 === 0) {
            week += 1;
            if ((week - 1) % 4 === 0) month += 1;
            // Прирост юнитов в городах.
            const newTowns = applyWeeklyGrowth(s);
            set({ towns: newTowns });
          }
          // Регенерация маны: +1 за каждую единицу знаний (с учётом артефактов).
          // Применяем ко всем героям сразу, до последующей раздачи MP.
          const regenHeroes = Object.fromEntries(
            Object.entries(get().heroes).map(([id, h]) => {
              const maxMana = getEffectiveMaxMana(h);
              const regen = getEffectiveKnowledge(h);
              return [id, { ...h, mana: Math.min(maxMana, h.mana + regen) }];
            }),
          );
          set({ heroes: regenHeroes });
          log.push(logLine(day, "— начало дня —"));
        }

        // Восстановим MP всем героям следующего активного игрока и далее — но проще всем.
        const heroes = Object.fromEntries(
          Object.entries(get().heroes).map(([id, h]) => [id, { ...h, movePoints: getEffectiveMaxMP(h) }]),
        );

        // Дневной доход для всех игроков (золото от ратуш + шахты).
        const players = applyDailyIncome(get());

        // Сбросим builtToday для городов.
        const towns = Object.fromEntries(
          Object.entries(get().towns).map(([id, t]) => [id, { ...t, builtToday: false }]),
        );

        set({
          activePlayerId: order[nextIdx],
          day,
          week,
          month,
          heroes,
          players,
          towns,
          log,
        });

        // Если ход теперь у ИИ — пусть он сходит и сразу передаст ход.
        const nextPlayer = get().players[order[nextIdx]];
        if (nextPlayer && !nextPlayer.isHuman && !nextPlayer.defeated) {
          // Выполнить через микротаск, чтобы UI обновился.
          setTimeout(() => runAiTurn(), 0);
        }

        // Проверка победы.
        const alive = Object.values(get().players).filter(p => !p.defeated);
        if (alive.length === 1) {
          set({ phase: "gameOver", winnerId: alive[0].id });
        }
      }),

      openTown: (id: string) => set({ phase: "town", selectedTownId: id }),
      closeTown: () => set({ phase: "adventure", selectedTownId: null }),

      openHero: (id: string) => set({ phase: "hero", selectedHeroId: id }),
      closeHero: () => set({ phase: "adventure" }),

      buildBuilding: gate("buildBuilding", (townId: string, buildingId: string) => {
        const s = get();
        const town = s.towns[townId];
        if (!town || town.builtToday) return false;
        // Строить можно только в свой ход в своём городе.
        if (town.ownerId !== s.activePlayerId) return false;
        if (town.built.includes(buildingId)) return false;
        const def = getBuilding(town.faction, buildingId);
        if (!def) return false;
        if (def.prereq && !def.prereq.every(p => town.built.includes(p))) return false;
        const player = s.players[town.ownerId!];
        if (!player || !canAfford(player.resources, def.cost)) return false;

        const newPlayer = { ...player, resources: pay(player.resources, def.cost) };
        const newTown: Town = {
          ...town,
          built: [...town.built, buildingId],
          builtToday: true,
          hasFort: town.hasFort || buildingId === "fort",
          availableUnits: { ...town.availableUnits },
        };
        // Если это жилище — задать прирост на сегодня.
        if (def.produces) {
          const unit = UNITS[def.produces];
          newTown.availableUnits[def.produces] = (newTown.availableUnits[def.produces] ?? 0) + unit.growth;
        }
        // Если это очередной уровень гильдии магов — катаем кости и докидываем
        // случайные заклинания этого уровня (по 4/3/2 для L1/L2/L3) к уже известным.
        const guildLevel = MAGE_GUILD_LEVEL[buildingId];
        if (guildLevel) {
          newTown.mageGuildLevel = guildLevel;
          const rolled = rollSpellsForGuildLevel(guildLevel as 1 | 2 | 3, newTown.learnedSpells);
          newTown.learnedSpells = [...newTown.learnedSpells, ...rolled];
        }
        // Если в этом городе стоит герой и мы построили гильдию магов — он сразу учит заклинания.
        let newHeroes = s.heroes;
        if (guildLevel) {
          const heroHere = Object.values(s.heroes).find(h => h.pos.x === town.pos.x && h.pos.y === town.pos.y);
          if (heroHere && heroHere.ownerId === town.ownerId) {
            const updated = applyMageGuildVisit(heroHere, newTown);
            if (updated !== heroHere) newHeroes = { ...s.heroes, [heroHere.id]: updated };
          }
        }
        set({
          towns: { ...s.towns, [townId]: newTown },
          players: { ...s.players, [player.id]: newPlayer },
          heroes: newHeroes,
          log: [...s.log, logLine(s.day, `Построено: ${def.name}`, town.ownerId ?? undefined)],
        });
        return true;
      }),

      hireUnits: gate("hireUnits", (townId: string, unitId: string, count: number) => {
        const s = get();
        const town = s.towns[townId];
        if (!town) return false;
        if (town.ownerId !== s.activePlayerId) return false;
        const avail = town.availableUnits[unitId] ?? 0;
        if (avail <= 0 || count <= 0) return false;
        const buy = Math.min(count, avail);
        const unit = getUnit(unitId);
        const totalCost: Partial<ResourceBag> = {};
        for (const k in unit.cost) {
          const key = k as keyof ResourceBag;
          totalCost[key] = (unit.cost[key] ?? 0) * buy;
        }
        const player = s.players[town.ownerId!];
        if (!canAfford(player.resources, totalCost)) return false;

        const newAvail = { ...town.availableUnits, [unitId]: avail - buy };
        const newGarrison = addToArmy(town.garrison, unitId, buy);
        const newTown: Town = { ...town, availableUnits: newAvail, garrison: newGarrison };
        const newPlayer: Player = { ...player, resources: pay(player.resources, totalCost) };
        set({
          towns: { ...s.towns, [townId]: newTown },
          players: { ...s.players, [player.id]: newPlayer },
        });
        return true;
      }),

      hireHero: gate("hireHero", (townId: string, protoId?: string) => {
        const s = get();
        const town = s.towns[townId];
        if (!town || !town.ownerId) return false;
        if (town.ownerId !== s.activePlayerId) return false;
        if (!town.built.includes("tavern")) return false;
        const player = s.players[town.ownerId];
        if (!canAfford(player.resources, HERO_HIRE_COST)) return false;
        if (!s.map) return false;
        // Найти позицию для нового героя: на клетке города, если свободна, иначе на соседней.
        const spawnPos = findHeroSpawnPos(s, town.pos);
        if (!spawnPos) return false;

        const rng = mulberry32((Date.now() ^ town.id.length) >>> 0);
        // Если игрок выбрал конкретного кандидата (например, второй из таверны — из чужой
        // фракции) — используем его. Иначе — случайный из родной фракции города.
        const proto = (protoId && getHeroProto(protoId)) || pickHeroProto(town.faction, rng);
        const hid = makeId("h");
        const army: UnitStack[] = proto.startingArmy.map(stack => ({
          unitId: stack.unitId,
          count: randInt(rng, stack.min, stack.max),
        }));
        const baseMana = proto.baseStats.knowledge * 10;
        let hero: Hero = {
          id: hid,
          ownerId: town.ownerId,
          name: proto.name,
          faction: proto.faction,
          pos: spawnPos,
          movePoints: 1500,
          maxMovePoints: 1500,
          army,
          artifacts: { equipped: {}, backpack: [] },
          level: 1,
          xp: 0,
          statBonus: { attack: 0, defense: 0, spellPower: 0, knowledge: 0 },
          attack: proto.baseStats.attack,
          defense: proto.baseStats.defense,
          spellPower: proto.baseStats.spellPower,
          knowledge: proto.baseStats.knowledge,
          mana: baseMana,
          maxMana: baseMana,
          spells: [],
          icon: proto.icon,
        };
        // Если в городе есть гильдия магов — нанятый герой сразу учит её заклинания.
        hero = applyMageGuildVisit(hero, town);

        const withHero: Player = {
          ...player,
          resources: pay(player.resources, HERO_HIRE_COST),
          heroIds: [...player.heroIds, hid],
        };
        const revealedOwner = revealForPlayer(withHero, spawnPos, VISION_RADIUS_HERO, s.map.width, s.map.height);
        set({
          heroes: { ...s.heroes, [hid]: hero },
          players: { ...s.players, [player.id]: revealedOwner },
          log: [...s.log, logLine(s.day, `Нанят герой: ${hero.name}`, player.id)],
          selectedHeroId: hid,
        });
        return true;
      }),

      tradeResource: gate("tradeResource", (townId: string, from: Resource, to: Resource, fromQty: number) => {
        const s = get();
        const town = s.towns[townId];
        if (!town || !town.ownerId) return false;
        if (town.ownerId !== s.activePlayerId) return false;
        if (!town.built.includes("marketplace")) return false;
        if (fromQty <= 0 || from === to) return false;
        const player = s.players[town.ownerId];
        if ((player.resources[from] ?? 0) < fromQty) return false;
        const toQty = reverseRate(from, to, fromQty);
        if (toQty <= 0) return false;
        const newRes = { ...player.resources };
        newRes[from] -= fromQty;
        newRes[to] += toQty;
        set({
          players: { ...s.players, [player.id]: { ...player, resources: newRes } },
          log: [
            ...s.log,
            logLine(s.day, `Рынок: ${fromQty} ${RESOURCE_NAMES[from]} → ${toQty} ${RESOURCE_NAMES[to]}`, player.id),
          ],
        });
        return true;
      }),

      garrisonToHero: gate("garrisonToHero", (townId: string, slotIdx: number) => {
        const s = get();
        const town = s.towns[townId];
        if (!town) return;
        if (town.ownerId !== s.activePlayerId) return;
        // Найти героя на этой клетке города.
        const hero = Object.values(s.heroes).find(h => h.pos.x === town.pos.x && h.pos.y === town.pos.y);
        if (!hero) return;
        const stack = town.garrison[slotIdx];
        if (!stack) return;
        const newHeroArmy = addToArmy(hero.army, stack.unitId, stack.count);
        const newGarrison = town.garrison.slice();
        newGarrison.splice(slotIdx, 1);
        set({
          heroes: { ...s.heroes, [hero.id]: { ...hero, army: newHeroArmy } },
          towns: { ...s.towns, [townId]: { ...town, garrison: newGarrison } },
        });
      }),

      heroToGarrison: gate("heroToGarrison", (heroId: string, slotIdx: number) => {
        const s = get();
        const hero = s.heroes[heroId];
        if (!hero) return;
        if (hero.ownerId !== s.activePlayerId) return;
        const tile = s.map?.tiles[hero.pos.y * (s.map?.width ?? 0) + hero.pos.x];
        if (!tile?.objectId) return;
        const town = s.towns[tile.objectId];
        if (!town) return;
        const stack = hero.army[slotIdx];
        if (!stack) return;
        const newGarrison = addToArmy(town.garrison, stack.unitId, stack.count);
        const newHeroArmy = hero.army.slice();
        newHeroArmy.splice(slotIdx, 1);
        set({
          heroes: { ...s.heroes, [heroId]: { ...hero, army: newHeroArmy } },
          towns: { ...s.towns, [town.id]: { ...town, garrison: newGarrison } },
        });
      }),

      openHeroMeeting: (otherHeroId: string) => {
        const s = get();
        const myId = s.selectedHeroId;
        if (!myId || myId === otherHeroId) return false;
        const mine = s.heroes[myId];
        const other = s.heroes[otherHeroId];
        if (!mine || !other) return false;
        // Только союзные (один владелец) и только смежные клетки (chebyshev = 1).
        if (mine.ownerId !== other.ownerId) return false;
        if (chebyshev(mine.pos, other.pos) !== 1) return false;
        set({ phase: "heroMeeting", meetingHeroIds: [myId, otherHeroId] });
        return true;
      },

      closeHeroMeeting: () => set({ phase: "adventure", meetingHeroIds: null }),

      swapArmySlots: gate("swapArmySlots", (heroIdA: string, slotA: number, heroIdB: string, slotB: number) => {
        const s = get();
        const a = s.heroes[heroIdA];
        const b = s.heroes[heroIdB];
        if (!a || !b) return;
        if (a.ownerId !== b.ownerId) return;
        if (a.ownerId !== s.activePlayerId) return;
        // Один и тот же герой, разные слоты — внутренний swap.
        // Разные герои — swap между армиями (включая мердж одинаковых стеков).
        if (heroIdA === heroIdB) {
          const army = a.army.slice();
          const tmp = army[slotA];
          army[slotA] = army[slotB];
          army[slotB] = tmp;
          // Очистка undefined-хвоста: лишних дыр в массиве не остаётся.
          const clean = army.filter(Boolean);
          set({ heroes: { ...s.heroes, [heroIdA]: { ...a, army: clean } } });
          return;
        }
        const stackA = a.army[slotA];
        const stackB = b.army[slotB];
        const newA = a.army.slice();
        const newB = b.army.slice();
        // Если у обоих один и тот же тип юнита — слить в B, освободить слот у A.
        if (stackA && stackB && stackA.unitId === stackB.unitId) {
          newB[slotB] = { unitId: stackB.unitId, count: stackB.count + stackA.count };
          newA.splice(slotA, 1);
        } else {
          // Чистый swap. Если в одном слоте undefined — это просто перемещение.
          if (stackA && !stackB) {
            newB[slotB] = stackA;
            newA.splice(slotA, 1);
          } else if (!stackA && stackB) {
            newA[slotA] = stackB;
            newB.splice(slotB, 1);
          } else if (stackA && stackB) {
            newA[slotA] = stackB;
            newB[slotB] = stackA;
          }
        }
        set({
          heroes: {
            ...s.heroes,
            [heroIdA]: { ...a, army: newA.filter(Boolean) },
            [heroIdB]: { ...b, army: newB.filter(Boolean) },
          },
        });
      }),

      equipFromBackpack: gate("equipFromBackpack", (heroId: string, backpackIdx: number) => {
        const s = get();
        const hero = s.heroes[heroId];
        if (!hero) return;
        if (hero.ownerId !== s.activePlayerId) return;
        const artId = hero.artifacts.backpack[backpackIdx];
        if (!artId) return;
        const def = ARTIFACTS[artId];
        if (!def) return;
        const slot = def.slot;
        const currentInSlot = hero.artifacts.equipped[slot];
        const newBackpack = hero.artifacts.backpack.slice();
        newBackpack.splice(backpackIdx, 1);
        // Если в слоте уже что-то надето — заменяем, вытесненный артефакт уходит в backpack на ту же позицию.
        if (currentInSlot) newBackpack.splice(backpackIdx, 0, currentInSlot);
        set({
          heroes: {
            ...s.heroes,
            [heroId]: {
              ...hero,
              artifacts: { equipped: { ...hero.artifacts.equipped, [slot]: artId }, backpack: newBackpack },
            },
          },
        });
      }),

      unequipToBackpack: gate("unequipToBackpack", (heroId: string, slot: ArtifactSlot) => {
        const s = get();
        const hero = s.heroes[heroId];
        if (!hero) return;
        if (hero.ownerId !== s.activePlayerId) return;
        const artId = hero.artifacts.equipped[slot];
        if (!artId) return;
        const newEquipped = { ...hero.artifacts.equipped };
        delete newEquipped[slot];
        set({
          heroes: {
            ...s.heroes,
            [heroId]: {
              ...hero,
              artifacts: { equipped: newEquipped, backpack: [...hero.artifacts.backpack, artId] },
            },
          },
        });
      }),

      // Передать всю армию из одного героя в другого. Стеки с одинаковым unitId
      // сливаются, новые — кладутся в свободные слоты. Если у получателя нет места,
      // лишние стеки остаются у исходного героя.
      transferAllArmy: gate("transferAllArmy", (fromHeroId: string, toHeroId: string) => {
        const s = get();
        const from = s.heroes[fromHeroId];
        const to = s.heroes[toHeroId];
        if (!from || !to || fromHeroId === toHeroId) return;
        if (from.ownerId !== to.ownerId) return;
        if (from.ownerId !== s.activePlayerId) return;
        const toArmy = to.army.map(st => ({ ...st }));
        const remaining: UnitStack[] = [];
        for (const stack of from.army) {
          const ex = toArmy.find(st => st.unitId === stack.unitId);
          if (ex) {
            ex.count += stack.count;
            continue;
          }
          if (toArmy.length < 7) {
            toArmy.push({ ...stack });
          } else {
            remaining.push({ ...stack });
          }
        }
        set({
          heroes: {
            ...s.heroes,
            [fromHeroId]: { ...from, army: remaining },
            [toHeroId]: { ...to, army: toArmy },
          },
        });
      }),

      // Передать все артефакты (надетые + рюкзак) другому герою. Получатель кладёт
      // всё себе в рюкзак — пусть решит сам, что надевать.
      transferAllArtifacts: gate("transferAllArtifacts", (fromHeroId: string, toHeroId: string) => {
        const s = get();
        const from = s.heroes[fromHeroId];
        const to = s.heroes[toHeroId];
        if (!from || !to || fromHeroId === toHeroId) return;
        if (from.ownerId !== to.ownerId) return;
        if (from.ownerId !== s.activePlayerId) return;
        const all: string[] = [];
        for (const slot of ARTIFACT_SLOT_ORDER) {
          const aid = from.artifacts.equipped[slot];
          if (aid) all.push(aid);
        }
        for (const aid of from.artifacts.backpack) all.push(aid);
        if (all.length === 0) return;
        set({
          heroes: {
            ...s.heroes,
            [fromHeroId]: { ...from, artifacts: { equipped: {}, backpack: [] } },
            [toHeroId]: {
              ...to,
              artifacts: { ...to.artifacts, backpack: [...to.artifacts.backpack, ...all] },
            },
          },
        });
      }),

      transferArtifact: gate(
        "transferArtifact",
        (
          fromHeroId: string,
          source: { kind: "equipped"; slot: ArtifactSlot } | { kind: "backpack"; idx: number },
          toHeroId: string,
        ) => {
          const s = get();
          const from = s.heroes[fromHeroId];
          const to = s.heroes[toHeroId];
          if (!from || !to || fromHeroId === toHeroId) return;
          if (from.ownerId !== to.ownerId) return;
          if (from.ownerId !== s.activePlayerId) return;
          // Извлечь артефакт из исходной локации.
          let artId: string | undefined;
          let newFromArtifacts: HeroArtifacts;
          if (source.kind === "equipped") {
            artId = from.artifacts.equipped[source.slot];
            if (!artId) return;
            const newEquipped = { ...from.artifacts.equipped };
            delete newEquipped[source.slot];
            newFromArtifacts = { equipped: newEquipped, backpack: from.artifacts.backpack };
          } else {
            artId = from.artifacts.backpack[source.idx];
            if (!artId) return;
            const newBackpack = from.artifacts.backpack.slice();
            newBackpack.splice(source.idx, 1);
            newFromArtifacts = { equipped: from.artifacts.equipped, backpack: newBackpack };
          }
          // Получатель — всегда в backpack, пусть сам решит надевать или нет.
          set({
            heroes: {
              ...s.heroes,
              [fromHeroId]: { ...from, artifacts: newFromArtifacts },
              [toHeroId]: { ...to, artifacts: { ...to.artifacts, backpack: [...to.artifacts.backpack, artId] } },
            },
          });
        },
      ),

      battleAct: _action => {
        // Заглушка — действия игрока обрабатывает battle/engine.ts через прямой вызов.
        // Это для будущего расширения; сейчас движок не разделяет действия.
      },

      battleAttack: gate("battleAttack", (attackerId: string, defenderId: string, approachTo?: Coord) => {
        const b = get().battle;
        if (!b) return;
        set({ battle: doAttack(b, attackerId, defenderId, approachTo) });
      }),
      battleShoot: gate("battleShoot", (attackerId: string, defenderId: string) => {
        const b = get().battle;
        if (!b) return;
        set({ battle: doShoot(b, attackerId, defenderId) });
      }),
      battleMove: gate("battleMove", (stackId: string, to: Coord) => {
        const b = get().battle;
        if (!b) return;
        set({ battle: doMove(b, stackId, to) });
      }),
      battleWait: gate("battleWait", (stackId: string) => {
        const b = get().battle;
        if (!b) return;
        set({ battle: doWait(b, stackId) });
      }),
      battleDefend: gate("battleDefend", (stackId: string) => {
        const b = get().battle;
        if (!b) return;
        set({ battle: doDefend(b, stackId) });
      }),
      battleCastSpell: gate(
        "battleCastSpell",
        (side: "attacker" | "defender", spellId: string, targetStackId: string) => {
          const b = get().battle;
          if (!b) return;
          set({ battle: doCastSpell(b, side, spellId, targetStackId) });
        },
      ),
      battleStepAi: gate("battleStepAi", () => {
        const b = get().battle;
        if (!b) return;
        const { battle: nb } = stepBattleAI(b);
        set({ battle: nb });
      }),
      battleRunAuto: gate("battleRunAuto", () => {
        let b = get().battle;
        if (!b) return;
        let i = 0;
        while (!isBattleOver(b) && i < 300) {
          b = stepBattleAI(b).battle;
          i++;
        }
        set({ battle: b });
      }),

      endBattleVictory: gate("endBattleVictory", () => {
        const s = get();
        const b = s.battle;
        if (!b) return;
        const attacker = s.heroes[b.attackerHeroId];
        if (!attacker) {
          set({ battle: null, phase: "adventure" });
          return;
        }
        // Применим потери к атакующему герою.
        const newAttackerArmy = computeArmyAfterBattle(b, "attacker", attacker.army);
        const map = s.map!;
        const newObjects = { ...map.objects };
        const newTiles = map.tiles.slice();
        // Записи о ходе боя видят обе стороны: и нападавший, и защитник.
        const sides: Array<string | null | undefined> = [attacker.ownerId];
        if (b.defenderHeroId) {
          const defenderHero = s.heroes[b.defenderHeroId];
          if (defenderHero) sides.push(defenderHero.ownerId);
        }
        let log = [...s.log, ...logForPlayers(s.day, `${attacker.name} побеждает в бою!`, ...sides)];
        let newPlayers = { ...s.players };
        let newTowns = { ...s.towns };

        // Обработать defender-объект: монстр — удалить, город — сменить владельца.
        if (b.defenderObjectId) {
          const obj = newObjects[b.defenderObjectId];
          if (obj) {
            if (obj.kind === "monster") {
              const tileIdx = obj.pos.y * map.width + obj.pos.x;
              newTiles[tileIdx] = { ...newTiles[tileIdx], objectId: null };
              delete newObjects[b.defenderObjectId];
              attacker.pos = { ...obj.pos };
            } else if (obj.kind === "dwelling") {
              const town = newTowns[obj.id];
              if (town) {
                // Сменить владельца. Если у города был предыдущий владелец — снять townId.
                if (town.ownerId) {
                  const oldOwner = newPlayers[town.ownerId];
                  newPlayers[town.ownerId] = {
                    ...oldOwner,
                    townIds: oldOwner.townIds.filter(t => t !== town.id),
                  };
                }
                const newOwner = newPlayers[attacker.ownerId];
                const withTown: Player = { ...newOwner, townIds: [...newOwner.townIds, town.id] };
                newPlayers[attacker.ownerId] = revealForPlayer(
                  withTown,
                  town.pos,
                  VISION_RADIUS_TOWN,
                  map.width,
                  map.height,
                );
                newTowns[town.id] = { ...town, ownerId: attacker.ownerId, garrison: [] };
                newObjects[town.id] = { ...obj, ownerId: attacker.ownerId };
                // Захват видят и атакующий, и (если был) прежний владелец.
                log.push(...logForPlayers(s.day, `Город "${town.name}" захвачен!`, attacker.ownerId, town.ownerId));
                // Если у предыдущего владельца не осталось ни городов, ни героев — поражение.
                if (town.ownerId) {
                  const old = newPlayers[town.ownerId];
                  if (old.heroIds.length === 0 && old.townIds.length === 0 && !old.defeated) {
                    newPlayers[town.ownerId] = { ...old, defeated: true };
                    // Глобальное событие — видят все.
                    log.push(logLine(s.day, `${old.name} побеждён.`));
                  }
                }
              }
            }
          }
        }

        // Начислить XP и обработать level-up (может быть несколько уровней за раз).
        const newXp = attacker.xp + b.xpReward;
        const newLevel = levelFromXp(newXp);
        const newStatBonus = { ...attacker.statBonus };
        if (newLevel > attacker.level) {
          for (let lvl = attacker.level + 1; lvl <= newLevel; lvl++) {
            const which = rollLevelUpStat();
            newStatBonus[which] += 1;
            log.push(
              logLine(s.day, `${attacker.name} — уровень ${lvl}! +1 ${LEVEL_UP_LABEL[which]}.`, attacker.ownerId),
            );
          }
        }
        log.push(logLine(s.day, `${attacker.name} получает ${b.xpReward} опыта.`, attacker.ownerId));

        const newHeroes = {
          ...s.heroes,
          [attacker.id]: {
            ...attacker,
            army: newAttackerArmy,
            pos: attacker.pos,
            xp: newXp,
            level: newLevel,
            statBonus: newStatBonus,
            // Перенесём остаточную ману из боя обратно герою (клампим по эффективной).
            mana: Math.max(0, Math.min(getEffectiveMaxMana(attacker), b.attackerMagic.mana)),
          },
        };

        // Если бой был с героем противника — обработаем защищающегося.
        if (b.defenderHeroId) {
          const defender = s.heroes[b.defenderHeroId];
          if (defender) {
            delete newHeroes[defender.id];
            const owner = newPlayers[defender.ownerId];
            const newOwner: Player = { ...owner, heroIds: owner.heroIds.filter(h => h !== defender.id) };
            newPlayers[owner.id] = newOwner;
            // Уничтожение героя видят обе стороны.
            log.push(...logForPlayers(s.day, `${defender.name} разгромлен.`, attacker.ownerId, owner.id));
            if (newOwner.heroIds.length === 0 && newOwner.townIds.length === 0) {
              newPlayers[owner.id] = { ...newOwner, defeated: true };
              log.push(logLine(s.day, `${owner.name} побеждён.`));
            }
          }
        }

        set({
          battle: null,
          phase: "adventure",
          heroes: newHeroes,
          map: { ...map, objects: newObjects, tiles: newTiles },
          log,
          players: newPlayers,
          towns: newTowns,
        });
        // Если шли в бой к страже, чтобы подобрать охраняемый объект — продолжить движение к нему.
        const pending = get().pendingMoveAfterCombat;
        if (pending) {
          set({ pendingMoveAfterCombat: null });
          const heroAfter = get().heroes[pending.heroId];
          if (heroAfter && heroAfter.movePoints >= STEP_STRAIGHT && get().phase === "adventure") {
            setTimeout(() => {
              const cur = useGame.getState();
              if (cur.phase !== "adventure") return;
              if (!cur.heroes[pending.heroId]) return;
              useGame.setState({ selectedHeroId: pending.heroId });
              cur.moveHeroTo(pending.target, pending.heroId);
            }, 0);
          }
        }
        // Если остался только один не-побеждённый игрок — конец игры.
        const alive = Object.values(get().players).filter(p => !p.defeated);
        if (alive.length === 1) {
          set({ phase: "gameOver", winnerId: alive[0].id });
        }
      }),

      commitInteraction: gate("commitInteraction", () => {
        const s = get();
        const p = s.pendingInteraction;
        if (!p) return;
        set({ pendingInteraction: null });
        interactWithObject(p.objectId, p.heroId);
        // Если интеракция запустила бой и атакующий — ИИ, прогоним его автоматически.
        const after = get();
        if (after.battle) {
          const attacker = after.heroes[after.battle.attackerHeroId];
          const attackerOwner = attacker ? after.players[attacker.ownerId] : null;
          if (attackerOwner && !attackerOwner.isHuman) {
            runAiBattle();
          }
        }
      }),

      endBattleDefeat: gate("endBattleDefeat", () => {
        const s = get();
        const b = s.battle;
        if (!b) return;
        const attacker = s.heroes[b.attackerHeroId];
        if (!attacker) {
          set({ battle: null, phase: "adventure" });
          return;
        }
        const owner = s.players[attacker.ownerId];
        const restHeroes = { ...s.heroes };
        delete restHeroes[attacker.id];
        const newOwner: Player = { ...owner, heroIds: owner.heroIds.filter(h => h !== attacker.id) };
        let players = { ...s.players, [owner.id]: newOwner };
        // Защитник тоже должен видеть исход боя; нейтральный бой (без героя-защитника) — только атакующий.
        const defenderHero = b.defenderHeroId ? s.heroes[b.defenderHeroId] : null;
        const log = [
          ...s.log,
          ...logForPlayers(s.day, `${attacker.name} погиб в бою.`, owner.id, defenderHero?.ownerId),
        ];
        if (newOwner.heroIds.length === 0 && newOwner.townIds.length === 0) {
          players[owner.id] = { ...newOwner, defeated: true };
          log.push(logLine(s.day, `${owner.name} побеждён.`));
        }
        set({
          battle: null,
          phase: "adventure",
          heroes: restHeroes,
          players,
          log,
          pendingMoveAfterCombat: null,
        });
        // Проверка победы.
        const alive = Object.values(get().players).filter(p => !p.defeated);
        if (alive.length <= 1) {
          set({ phase: "gameOver", winnerId: alive[0]?.id ?? null });
        }
      }),
    }),
    {
      name: "heroes-web-save",
      // v6 — baseline после релиза. С этой точки любое изменение формата
      // ОБЯЗАНО сопровождаться миграцией в migrate() ниже, а не просто бампом version.
      version: 13,
      migrate: (persisted, fromVersion) => {
        const state = persisted as Partial<GameState>;
        // Сейвы версий < 6 — времён до релиза, формат менялся свободно. Их не мигрируем,
        // вернём пустое состояние, чтобы persist подставил initialState.
        if (fromVersion < 6) return undefined;
        if (fromVersion < 7) {
          // v7: магия. Героям проставляем дефолтные spellPower/knowledge/mana/spells.
          // Городам — нулевой уровень гильдии и пустой список заклинаний.
          // Активный бой при таком изменении формата не восстанавливаем — формат BattleState
          // тоже изменился (магия, tempBonus).
          if (state.heroes) {
            const newHeroes: Record<string, Hero> = {};
            for (const [id, h] of Object.entries(state.heroes)) {
              newHeroes[id] = {
                ...h,
                spellPower: (h as Partial<Hero>).spellPower ?? 1,
                knowledge: (h as Partial<Hero>).knowledge ?? 1,
                mana: (h as Partial<Hero>).mana ?? 10,
                maxMana: (h as Partial<Hero>).maxMana ?? 10,
                spells: (h as Partial<Hero>).spells ?? [],
              } as Hero;
            }
            state.heroes = newHeroes;
          }
          if (state.towns) {
            const newTowns: Record<string, Town> = {};
            for (const [id, t] of Object.entries(state.towns)) {
              newTowns[id] = {
                ...t,
                mageGuildLevel: (t as Partial<Town>).mageGuildLevel ?? 0,
                learnedSpells: (t as Partial<Town>).learnedSpells ?? [],
              } as Town;
            }
            state.towns = newTowns;
          }
          state.battle = null;
          if (state.phase === "battle") state.phase = "adventure";
        }
        if (fromVersion < 8) {
          // v8: statBonus теперь содержит spellPower/knowledge. Старые сейвы — нули.
          if (state.heroes) {
            const newHeroes: Record<string, Hero> = {};
            for (const [id, h] of Object.entries(state.heroes)) {
              const old = (h as Partial<Hero>).statBonus as Partial<Hero["statBonus"]> | undefined;
              newHeroes[id] = {
                ...h,
                statBonus: {
                  attack: old?.attack ?? 0,
                  defense: old?.defense ?? 0,
                  spellPower: old?.spellPower ?? 0,
                  knowledge: old?.knowledge ?? 0,
                },
              } as Hero;
            }
            state.heroes = newHeroes;
          }
        }
        if (fromVersion < 9) {
          // v9: у героев появились базовые attack/defense (раньше неявно 0).
          // Магия (spellPower/knowledge) в сейвах уже есть с v7. Старым героям
          // оставляем attack=0, defense=0 — поведение не меняется.
          if (state.heroes) {
            const newHeroes: Record<string, Hero> = {};
            for (const [id, h] of Object.entries(state.heroes)) {
              newHeroes[id] = {
                ...h,
                attack: (h as Partial<Hero>).attack ?? 0,
                defense: (h as Partial<Hero>).defense ?? 0,
              } as Hero;
            }
            state.heroes = newHeroes;
          }
        }
        if (fromVersion < 10) {
          // v10: формат BattleStack обновлён (добавлен hasWaited). Активный бой не
          // мигрируем — просто роняем, при следующем сражении создастся в новом формате.
          state.battle = null;
          if (state.phase === "battle") state.phase = "adventure";
        }
        if (fromVersion < 11) {
          // v11: «Защита» теперь даёт +30% к защите до конца раунда — у BattleStack
          // появилось поле defendDefenseBonus. Активный бой роняем.
          state.battle = null;
          if (state.phase === "battle") state.phase = "adventure";
        }
        if (fromVersion < 12) {
          // v12: добавлено pendingInteraction — отложенная интеракция с объектом
          // на карте до окончания анимации перемещения героя.
          state.pendingInteraction = null;
        }
        if (fromVersion < 13) {
          // v13: log стал массивом LogEntry с playerId. Старые строковые записи
          // делаем глобальными (без playerId), чтобы они оставались видимыми.
          const oldLog = state.log as unknown;
          if (Array.isArray(oldLog) && oldLog.length > 0 && typeof oldLog[0] === "string") {
            state.log = (oldLog as string[]).map(text => ({ text }));
          }
        }
        // Сюда добавляются ветки `if (fromVersion < N) { ... }` для каждой будущей версии.
        return state as GameState;
      },
    },
  ),
);

// =================== ВСПОМОГАТЕЛЬНОЕ ===================

// Доступные «прокачиваемые» характеристики при повышении уровня. Распределение
// равномерное — игроку важна универсальность, специализация решается артефактами.
const LEVEL_UP_STATS = ["attack", "defense", "spellPower", "knowledge"] as const;
type LevelUpStat = (typeof LEVEL_UP_STATS)[number];

const LEVEL_UP_LABEL: Record<LevelUpStat, string> = {
  attack: "к атаке",
  defense: "к защите",
  spellPower: "к силе магии",
  knowledge: "к знаниям",
};

function rollLevelUpStat(): LevelUpStat {
  return LEVEL_UP_STATS[Math.floor(Math.random() * LEVEL_UP_STATS.length)];
}

// Применить эффект гильдии магов: герой учит все доступные в городе заклинания
// и восстанавливает ману до эффективного максимума (с учётом артефактов).
function applyMageGuildVisit(hero: Hero, town: Town): Hero {
  if (town.learnedSpells.length === 0) return hero;
  const before = new Set(hero.spells);
  const next = new Set(hero.spells);
  for (const s of town.learnedSpells) next.add(s);
  const effMax = getEffectiveMaxMana(hero);
  const learnedSomething = next.size !== before.size;
  if (!learnedSomething && hero.mana >= effMax) return hero;
  return { ...hero, spells: [...next], mana: effMax };
}

function addToArmy(army: UnitStack[], unitId: string, count: number): UnitStack[] {
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
  // Армия полна — кинуть в существующий слот тот же тип, если есть, иначе игнор (для прототипа).
  return out;
}

// Боевой бонус ИИ из текущей сложности — применяем к стороне, чей герой принадлежит ИИ
// (или к защитнику, если нейтральные охраняют объект и они тоже считаются «не-человеком»).
function aiBattleBonus(state: GameState, hero: Hero | null): Partial<HeroBonus> | undefined {
  if (!state.options) return undefined;
  const preset = getPreset(state.options.difficulty);
  if (!preset.aiCombatBonus.attack && !preset.aiCombatBonus.defense) return undefined;
  // Защитник без героя — нейтральный монстр/гарнизон, бонусы для них не применяем.
  if (!hero) return undefined;
  const owner = state.players[hero.ownerId];
  if (!owner || owner.isHuman) return undefined;
  return preset.aiCombatBonus;
}

function applyWeeklyGrowth(state: GameState): Record<string, Town> {
  const out: Record<string, Town> = {};
  const preset = state.options ? getPreset(state.options.difficulty) : null;
  for (const [id, t] of Object.entries(state.towns)) {
    const newAvail = { ...t.availableUnits };
    const owner = t.ownerId ? state.players[t.ownerId] : null;
    const aiMult = owner && !owner.isHuman && preset ? preset.aiGrowthMult : 1;
    // Форт даёт +50% к приросту всех существ в этом городе.
    const fortMult = t.built.includes("fort") ? 1.5 : 1;
    const mult = aiMult * fortMult;
    for (const bId of t.built) {
      const def = FACTION_BUILDINGS[t.faction].find(b => b.id === bId);
      if (def?.produces) {
        const unit = UNITS[def.produces];
        const inc = Math.max(1, Math.round(unit.growth * mult));
        newAvail[def.produces] = (newAvail[def.produces] ?? 0) + inc;
      }
    }
    out[id] = { ...t, availableUnits: newAvail };
  }
  return out;
}

function applyDailyIncome(s: GameState): Record<string, Player> {
  const players: Record<string, Player> = { ...s.players };
  for (const pid of Object.keys(players)) {
    const p = players[pid];
    if (p.defeated) continue;
    let res = { ...p.resources };
    // Города.
    for (const tid of p.townIds) {
      const t = s.towns[tid];
      if (!t) continue;
      for (const bId of t.built) {
        const def = FACTION_BUILDINGS[t.faction].find(b => b.id === bId);
        if (def?.givesGoldPerDay) res.gold += def.givesGoldPerDay;
      }
    }
    // Шахты — посмотреть все объекты карты, принадлежащие игроку.
    if (s.map) {
      for (const obj of Object.values(s.map.objects)) {
        if (obj.kind === "mine" && obj.ownerId === pid && obj.mineResource && obj.mineYield) {
          res = add(res, { [obj.mineResource]: obj.mineYield } as Partial<ResourceBag>);
        }
      }
    }
    players[pid] = { ...p, resources: res };
  }
  return players;
}

function computeArmyAfterBattle(b: BattleState, side: "attacker" | "defender", original: UnitStack[]): UnitStack[] {
  // Сопоставим стэки боя с исходной армией по порядку.
  const sideStacks = b.stacks.filter(s => s.side === side);
  const out: UnitStack[] = [];
  for (let i = 0; i < original.length; i++) {
    const bs = sideStacks[i];
    if (!bs || bs.count <= 0) continue;
    out.push({ unitId: original[i].unitId, count: bs.count });
  }
  return out;
}

// =================== ВЗАИМОДЕЙСТВИЕ С ОБЪЕКТАМИ ===================

function interactWithObject(objId: string, heroId?: string) {
  const s = useGame.getState();
  if (!s.map) return;
  const obj = s.map.objects[objId];
  if (!obj) return;
  // Героя берём явно, если передан (он мог остановиться на соседней клетке —
  // например, перед монстром, на которого нельзя вступать).
  // Иначе — fallback: ищем героя на клетке объекта.
  const hero = heroId
    ? s.heroes[heroId]
    : Object.values(s.heroes).find(
        h => h.ownerId === s.activePlayerId && h.pos.x === obj.pos.x && h.pos.y === obj.pos.y,
      );

  if (obj.kind === "resource" && obj.resource) {
    if (!hero) return;
    const player = s.players[hero.ownerId];
    const newResources = add(player.resources, { [obj.resource]: obj.amount ?? 0 } as Partial<ResourceBag>);
    const newObjects = { ...s.map.objects };
    delete newObjects[obj.id];
    const newTiles = s.map.tiles.slice();
    newTiles[obj.pos.y * s.map.width + obj.pos.x] = {
      ...newTiles[obj.pos.y * s.map.width + obj.pos.x],
      objectId: null,
    };
    useGame.setState({
      players: { ...s.players, [player.id]: { ...player, resources: newResources } },
      map: { ...s.map, objects: newObjects, tiles: newTiles },
      log: [...s.log, logLine(s.day, `Подобрано: ${obj.amount} ${RESOURCE_NAMES[obj.resource]}`, hero.ownerId)],
    });
    return;
  }

  if (obj.kind === "chest") {
    if (!hero) return;
    const player = s.players[hero.ownerId];
    const baseAmount = obj.goldAmount ?? 1000;
    const giveXp = Math.random() < 0.35;
    const newObjects = { ...s.map.objects };
    delete newObjects[obj.id];
    const newTiles = s.map.tiles.slice();
    newTiles[obj.pos.y * s.map.width + obj.pos.x] = {
      ...newTiles[obj.pos.y * s.map.width + obj.pos.x],
      objectId: null,
    };
    if (giveXp) {
      // Сундук с опытом — может дать уровень.
      const newXp = hero.xp + baseAmount;
      const newLevel = levelFromXp(newXp);
      const newStatBonus = { ...hero.statBonus };
      const levelUps: LogEntry[] = [];
      if (newLevel > hero.level) {
        for (let lvl = hero.level + 1; lvl <= newLevel; lvl++) {
          const which = rollLevelUpStat();
          newStatBonus[which] += 1;
          levelUps.push(logLine(s.day, `${hero.name} — уровень ${lvl}! +1 ${LEVEL_UP_LABEL[which]}.`, hero.ownerId));
        }
      }
      useGame.setState({
        heroes: { ...s.heroes, [hero.id]: { ...hero, xp: newXp, level: newLevel, statBonus: newStatBonus } },
        map: { ...s.map, objects: newObjects, tiles: newTiles },
        log: [...s.log, logLine(s.day, `Сундук с опытом: +${baseAmount} опыта`, hero.ownerId), ...levelUps],
      });
    } else {
      const newResources = { ...player.resources, gold: player.resources.gold + baseAmount };
      useGame.setState({
        players: { ...s.players, [player.id]: { ...player, resources: newResources } },
        map: { ...s.map, objects: newObjects, tiles: newTiles },
        log: [...s.log, logLine(s.day, `Сундук: +${baseAmount} золота`, hero.ownerId)],
      });
    }
    return;
  }

  if (obj.kind === "mine" && obj.mineResource) {
    if (!hero) return;
    if (obj.ownerId === hero.ownerId) return;
    const newObjects = { ...s.map.objects, [obj.id]: { ...obj, ownerId: hero.ownerId } };
    // Захват шахты у противника видят обе стороны.
    useGame.setState({
      map: { ...s.map, objects: newObjects },
      log: [
        ...s.log,
        ...logForPlayers(
          s.day,
          `Шахта (${RESOURCE_NAMES[obj.mineResource]}) захвачена`,
          hero.ownerId,
          obj.ownerId ?? undefined,
        ),
      ],
    });
    return;
  }

  if (obj.kind === "artifact" && obj.artifactId) {
    if (!hero) return;
    const artDef = getArtifact(obj.artifactId);
    // Если слот свободен — сразу экипируем; иначе кидаем в backpack.
    const slotFree = !hero.artifacts.equipped[artDef.slot];
    const newArtifacts: HeroArtifacts = slotFree
      ? { ...hero.artifacts, equipped: { ...hero.artifacts.equipped, [artDef.slot]: obj.artifactId } }
      : { ...hero.artifacts, backpack: [...hero.artifacts.backpack, obj.artifactId] };
    const newHero = { ...hero, artifacts: newArtifacts };
    const newObjects = { ...s.map.objects };
    delete newObjects[obj.id];
    const newTiles = s.map.tiles.slice();
    newTiles[obj.pos.y * s.map.width + obj.pos.x] = {
      ...newTiles[obj.pos.y * s.map.width + obj.pos.x],
      objectId: null,
    };
    useGame.setState({
      heroes: { ...s.heroes, [hero.id]: newHero },
      map: { ...s.map, objects: newObjects, tiles: newTiles },
      log: [
        ...s.log,
        logLine(s.day, `Подобран артефакт: ${artDef.name}${slotFree ? " (надет)" : " (в рюкзак)"}`, hero.ownerId),
      ],
    });
    return;
  }

  if (obj.kind === "monster" && obj.unitId && obj.unitCount) {
    if (!hero) return;
    // Запустить бой.
    const battle = startBattle({
      attackerHero: hero,
      defenderHero: null,
      defenderObjectId: obj.id,
      defenderArmy: [{ unitId: obj.unitId, count: obj.unitCount }],
      attackerExtraBonus: aiBattleBonus(s, hero),
    });
    useGame.setState({ battle, phase: "battle" });
    return;
  }

  if (obj.kind === "dwelling") {
    // Это город.
    const town = s.towns[obj.id];
    if (!town) return;
    if (town.ownerId === s.activePlayerId) {
      // Свой город — если герой стоит в нём и есть гильдия, учим заклинания и поим ману.
      if (hero) {
        const updated = applyMageGuildVisit(hero, town);
        if (updated !== hero) {
          useGame.setState({ heroes: { ...s.heroes, [hero.id]: updated } });
        }
      }
      // Открыть UI только если за игрока-человека.
      if (s.players[s.activePlayerId]?.isHuman) {
        useGame.setState({ phase: "town", selectedTownId: town.id });
      }
    } else if (hero) {
      // Захват пустого города или бой с гарнизоном.
      if (town.garrison.length === 0) {
        captureTown(town.id, hero.ownerId);
      } else {
        // Бой с гарнизоном (нет защищающегося героя).
        const battle = startBattle({
          attackerHero: hero,
          defenderHero: null,
          defenderObjectId: town.id,
          defenderArmy: town.garrison,
          attackerExtraBonus: aiBattleBonus(s, hero),
        });
        useGame.setState({ battle, phase: "battle" });
      }
    }
    return;
  }
}

function captureTown(townId: string, newOwnerId: string) {
  const s = useGame.getState();
  const town = s.towns[townId];
  if (!town) return;
  let players = { ...s.players };
  if (town.ownerId) {
    const oldOwner = players[town.ownerId];
    players[town.ownerId] = { ...oldOwner, townIds: oldOwner.townIds.filter(t => t !== townId) };
  }
  const newOwner = players[newOwnerId];
  const withTown: Player = { ...newOwner, townIds: [...newOwner.townIds, townId] };
  const map = s.map!;
  // Захват открывает округу города новому владельцу.
  players[newOwnerId] = revealForPlayer(withTown, town.pos, VISION_RADIUS_TOWN, map.width, map.height);
  const newTown: Town = { ...town, ownerId: newOwnerId };
  const newObjects = { ...map.objects, [townId]: { ...map.objects[townId], ownerId: newOwnerId } };
  useGame.setState({
    players,
    towns: { ...s.towns, [townId]: newTown },
    map: { ...map, objects: newObjects },
    log: [...s.log, ...logForPlayers(s.day, `Город "${town.name}" захвачен!`, newOwnerId, town.ownerId ?? undefined)],
  });
  // Проверка победы — если у предыдущего владельца не осталось ни городов, ни героев.
  if (town.ownerId) {
    const old = useGame.getState().players[town.ownerId];
    if (old.heroIds.length === 0 && old.townIds.length === 0 && !old.defeated) {
      useGame.setState({
        players: { ...useGame.getState().players, [town.ownerId]: { ...old, defeated: true } },
        // Глобально: «X побеждён» видят все.
        log: [...useGame.getState().log, logLine(useGame.getState().day, `${old.name} побеждён.`)],
      });
    }
  }
  const alive = Object.values(useGame.getState().players).filter(p => !p.defeated);
  if (alive.length === 1) {
    useGame.setState({ phase: "gameOver", winnerId: alive[0].id });
  }
}

// =================== ИИ КАРТЫ ===================

async function runAiTurn() {
  const game = useGame.getState();
  const pid = game.activePlayerId;
  const player = game.players[pid];
  if (!player || player.isHuman || player.defeated) {
    if (!useGame.getState().battle) useGame.getState().endTurn();
    return;
  }
  // 1) Постройка в каждом городе одной постройки, если возможно.
  for (const tid of player.townIds) {
    const town = useGame.getState().towns[tid];
    if (!town || town.builtToday) continue;
    const candidates = FACTION_BUILDINGS[town.faction]
      .filter(b => !town.built.includes(b.id))
      .filter(b => !b.prereq || b.prereq.every(p => town.built.includes(p)))
      .filter(b => canAfford(useGame.getState().players[pid].resources, b.cost));
    // Приоритет: жилища, потом ратуши, форт.
    const order: typeof candidates = [
      ...candidates.filter(b => b.id === "fort"),
      ...candidates.filter(b => b.produces),
      ...candidates.filter(b => b.givesGoldPerDay),
      ...candidates.filter(b => !b.produces && !b.givesGoldPerDay),
    ];
    if (order[0]) useGame.getState().buildBuilding(tid, order[0].id);
  }
  // 2) Найм всех доступных юнитов в каждом городе.
  for (const tid of player.townIds) {
    const town = useGame.getState().towns[tid];
    if (!town) continue;
    for (const [unitId, count] of Object.entries(town.availableUnits)) {
      if (count > 0) useGame.getState().hireUnits(tid, unitId, count);
    }
    // Передать гарнизон герою, если он на клетке города и есть гарнизон.
    const tw = useGame.getState().towns[tid];
    const hero = Object.values(useGame.getState().heroes).find(
      h => h.ownerId === pid && h.pos.x === tw.pos.x && h.pos.y === tw.pos.y,
    );
    if (hero) {
      while (useGame.getState().towns[tid].garrison.length > 0) {
        useGame.getState().garrisonToHero(tid, 0);
      }
    }
  }
  // 3) Движение героев. Простая логика: идти к ближайшему ресурсу/шахте/городу/герою противника.
  // Между шагами держим паузу, пропорциональную animSpeed — иначе игрок не успевает увидеть,
  // куда ИИ перемещался, потому что несколько setState'ов внутри одного синхронного блока
  // схлопываются в один ре-рендер UI.
  const heroIds = useGame.getState().players[pid].heroIds.slice();
  for (const hid of heroIds) {
    if (useGame.getState().battle) return; // если ИИ ввязался в бой — выходим.
    let hero = useGame.getState().heroes[hid];
    if (!hero) continue;
    // Цикл хождения, пока есть MP.
    for (let i = 0; i < 6; i++) {
      hero = useGame.getState().heroes[hid];
      if (!hero || hero.movePoints < STEP_STRAIGHT) break;
      const target = pickAiTarget(hero);
      if (!target) break;
      const map = useGame.getState().map!;
      const path = findPath(map, hero.pos, target);
      if (!path || path.length === 0) break;
      const beforePos = { ...hero.pos };
      moveAiHero(hid, target);
      // Дать UI отрисовать перемещение героя до следующего шага.
      const heroAfter = useGame.getState().heroes[hid];
      if (heroAfter && (heroAfter.pos.x !== beforePos.x || heroAfter.pos.y !== beforePos.y)) {
        await waitForAiMoveAnim(beforePos, heroAfter.pos, map);
      }
      // Если героем была запланирована интеракция с объектом (ресурс/шахта/монстр),
      // выполняем её ПОСЛЕ окончания анимации — иначе предмет пропадает с карты
      // прямо в момент клика, а герой едет на пустую клетку.
      if (useGame.getState().pendingInteraction) {
        useGame.getState().commitInteraction();
      }
      if (useGame.getState().battle) return;
    }
  }
  // Закончить ход.
  if (!useGame.getState().battle) {
    setTimeout(() => useGame.getState().endTurn(), 50);
  }
}

// Длительность паузы между шагами ИИ ≈ длительности анимации движения на карте
// (см. AdventureScreen). Если игрок выбрал «мгновенно» — без пауз.
function waitForAiMoveAnim(from: Coord, to: Coord, map: NonNullable<ReturnType<typeof useGame.getState>["map"]>) {
  const scale = ANIM_SPEED_SCALE[useSettings.getState().animSpeed];
  if (scale === 0) return Promise.resolve();
  const path = findPath(map, from, to);
  const steps = path && path.length > 0 ? path.length : Math.max(1, chebyshev(from, to));
  const ms = Math.min(900, 120 * steps) * scale + 40;
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

function pickAiTarget(hero: Hero): Coord | null {
  const s = useGame.getState();
  if (!s.map) return null;
  let best: { d: number; pos: Coord } | null = null;
  // Кандидаты: ресурсы, не-свои шахты, города не-свои, герои других игроков.
  for (const obj of Object.values(s.map.objects)) {
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

function moveAiHero(heroId: string, target: Coord) {
  const s = useGame.getState();
  const hero = s.heroes[heroId];
  if (!s.map || !hero) return;
  const path = findPath(s.map, hero.pos, target);
  if (!path) return;
  let mp = hero.movePoints;
  let curPos = { ...hero.pos };
  let triggered: string | null = null;
  let battleWithHero: string | null = null;
  for (const step of path) {
    const dx = Math.abs(step.x - curPos.x);
    const dy = Math.abs(step.y - curPos.y);
    const cost = stepCost(dx, dy);
    if (mp < cost) break;
    const otherHero = Object.values(s.heroes).find(h => h.id !== hero.id && h.pos.x === step.x && h.pos.y === step.y);
    if (otherHero) {
      if (otherHero.ownerId === hero.ownerId) break;
      battleWithHero = otherHero.id;
      break;
    }
    const tile = s.map.tiles[step.y * s.map.width + step.x];
    if (tile.objectId) {
      const obj = s.map.objects[tile.objectId];
      const interactive =
        obj.kind === "monster" ||
        obj.kind === "dwelling" ||
        obj.kind === "resource" ||
        obj.kind === "mine" ||
        obj.kind === "chest" ||
        obj.kind === "artifact";
      if (!obj.passable) {
        if (interactive) triggered = obj.id;
        break;
      }
    }
    mp -= cost;
    curPos = { ...step };
    if (tile.objectId) {
      const obj = s.map.objects[tile.objectId];
      if (obj.kind !== "tree" && obj.kind !== "mountain") {
        triggered = obj.id;
        break;
      }
    }
  }
  const owner = useGame.getState().players[hero.ownerId];
  const updatedOwner = owner ? revealForPlayer(owner, curPos, VISION_RADIUS_HERO, s.map.width, s.map.height) : owner;
  useGame.setState({
    heroes: { ...useGame.getState().heroes, [heroId]: { ...hero, pos: curPos, movePoints: mp } },
    players: updatedOwner
      ? { ...useGame.getState().players, [hero.ownerId]: updatedOwner }
      : useGame.getState().players,
  });
  if (battleWithHero) {
    const defender = useGame.getState().heroes[battleWithHero];
    if (defender) {
      const attacker = useGame.getState().heroes[heroId];
      const stateNow = useGame.getState();
      const battle = startBattle({
        attackerHero: attacker,
        defenderHero: defender,
        defenderObjectId: null,
        attackerExtraBonus: aiBattleBonus(stateNow, attacker),
        defenderExtraBonus: aiBattleBonus(stateNow, defender),
      });
      useGame.setState({ battle, phase: "battle" });
      runAiBattle();
    }
    return;
  }
  // Объектную интеракцию НЕ запускаем здесь — её закоммитит runAiTurn после
  // окончания анимации, чтобы предмет/монстр визуально оставался на карте, пока
  // герой к нему доходит.
  if (triggered) {
    useGame.setState({ pendingInteraction: { objectId: triggered, heroId } });
  }
}

function runAiBattle() {
  // ИИ играет за обе стороны, когда атакующий — ИИ.
  let safety = 0;
  while (useGame.getState().battle && safety < 200) {
    safety++;
    const result = stepBattleAI(useGame.getState().battle!);
    useGame.setState({ battle: result.battle });
    const over = isBattleOver(result.battle);
    if (over) {
      if (over === "attacker") useGame.getState().endBattleVictory();
      else useGame.getState().endBattleDefeat();
      break;
    }
  }
}

// Экспорт для использования из UI: возможность вручную проводить шаг боя.
export { interactWithObject };
