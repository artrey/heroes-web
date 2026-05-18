import type { StateCreator } from "zustand";

import { startBattle } from "../../battle/engine";
import type { Coord, Hero } from "../../types";
import { VISION_RADIUS_HERO } from "../../types";
import { getEffectiveKnowledge, getEffectiveMaxMana, getEffectiveMaxMP } from "../../utils/heroBonus";
import { findPath, STEP_STRAIGHT, stepCost } from "../../utils/pathfind";
import { revealForPlayer } from "../../utils/visibility";
import { computeDanger } from "../../utils/zoc";
import type { Actions, GameStore } from "../actions";
import { runAiTurn } from "../ai/runTurn";
import { aiBattleBonus } from "../helpers/ai";
import { applyDailyIncome, applyWeeklyGrowth } from "../helpers/economy";
import { gate } from "../helpers/gate";
import { interactWithObject } from "../helpers/interactions";
import { logLine } from "../helpers/log";
import { runAiBattle } from "./battle";

export type AdventureSlice = Pick<Actions, "moveHeroTo" | "endTurn" | "commitInteraction">;

export const createAdventureSlice: StateCreator<GameStore, [], [], AdventureSlice> = (set, get) => ({
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
    const newHero: Hero = { ...hero, pos: curPos, army: hero.army.map(st => ({ ...st })) };
    let triggered: string | null = null;

    for (const step of path) {
      const dx = Math.abs(step.x - curPos.x);
      const dy = Math.abs(step.y - curPos.y);
      const cost = stepCost(dx, dy);
      if (mp < cost) break;
      const tile = s.map.tiles[step.y * s.map.width + step.x];
      // Чужой герой на этой клетке — не наступаем, инициируем бой.
      const otherHero = Object.values(s.heroes).find(h => h.id !== hero.id && h.pos.x === step.x && h.pos.y === step.y);
      if (otherHero) {
        if (otherHero.ownerId === hero.ownerId) break; // свой — стоп
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
      // Непроходимый объект — стоп; если триггерный — запустить взаимодействие, не вступая.
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
    const log = s.log.slice();
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
    const towns = Object.fromEntries(Object.entries(get().towns).map(([id, t]) => [id, { ...t, builtToday: false }]));

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
      setTimeout(() => {
        runAiTurn({ getState: get, setState: set });
      }, 0);
    }

    // Проверка победы.
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
    interactWithObject({ getState: get, setState: set }, p.objectId, p.heroId);
    // Если интеракция запустила бой и атакующий — ИИ, прогоним его автоматически.
    const after = get();
    if (after.battle) {
      const attacker = after.heroes[after.battle.attackerHeroId];
      const attackerOwner = attacker ? after.players[attacker.ownerId] : null;
      if (attackerOwner && !attackerOwner.isHuman) {
        runAiBattle(get, set);
      }
    }
  }),
});
