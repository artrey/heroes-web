import type { StateCreator } from "zustand";

import { getPreset } from "../../data/difficulty";
import { FACTION_LIST, FACTION_META } from "../../data/factions";
import { pickHeroProto } from "../../data/heroes";
import { FACTION_UNIT_ORDER } from "../../data/units";
import { generateMap } from "../../map/generate";
import type { Faction, Hero, Player, ResourceBag, Town, UnitStack } from "../../types";
import { VISION_RADIUS_HERO, VISION_RADIUS_TOWN } from "../../types";
import { makeId, resetIdCounter } from "../../utils/id";
import { mulberry32, randInt } from "../../utils/rng";
import { revealForPlayer } from "../../utils/visibility";
import type { Actions, GameStore } from "../actions";
import { logLine } from "../helpers/log";
import { HERO_HIRE_COST as _HERO_HIRE_COST, initialState, PLAYER_COLORS } from "../initial";

// HERO_HIRE_COST используется только в town-slice — оставляем экспорт для прозрачности.
void _HERO_HIRE_COST;

export type LifecycleSlice = Pick<Actions, "startGame" | "reset">;

export const createLifecycleSlice: StateCreator<GameStore, [], [], LifecycleSlice> = set => ({
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

      const numHumansLocal = Math.max(1, opts.numHumans ?? 1);
      const isAi = i >= numHumansLocal;

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
      // Положим объект-города на карту. Замок 3×2 с entry в центральной нижней клетке:
      // на все 6 клеток ставим objectId=townId (UI ловит клик по любой части города и
      // резолвит в entry-tile), а 5 не-entry клеток помечаем непроходимыми (passable=false).
      // map.objects содержит ОДИН объект с pos=entry — drawMap рисует одну большую плитку.
      for (let dy = -1; dy <= 0; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const fx = town.pos.x + dx;
          const fy = town.pos.y + dy;
          if (fx < 0 || fy < 0 || fx >= map.width || fy >= map.height) continue;
          const tIdx = fy * map.width + fx;
          map.tiles[tIdx].objectId = tid;
          if (!(dx === 0 && dy === 0)) {
            map.tiles[tIdx].passable = false;
          }
        }
      }
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
});
