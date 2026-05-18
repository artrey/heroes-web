import type { StateCreator } from "zustand";

import {
  doAttack,
  doCastSpell,
  doDefend,
  doMove,
  doShoot,
  doWait,
  isBattleOver,
  stepBattleAI,
} from "../../battle/engine";
import type { Player } from "../../types";
import { VISION_RADIUS_TOWN } from "../../types";
import { getEffectiveMaxMana } from "../../utils/heroBonus";
import { levelFromXp } from "../../utils/leveling";
import { STEP_STRAIGHT } from "../../utils/pathfind";
import { revealForPlayer } from "../../utils/visibility";
import type { Actions, GameStore } from "../actions";
import { computeArmyAfterBattle } from "../helpers/army";
import { gate } from "../helpers/gate";
import { LEVEL_UP_LABEL, rollLevelUpStat } from "../helpers/levelUp";
import { logForPlayers, logLine } from "../helpers/log";

export type BattleSlice = Pick<
  Actions,
  | "battleAttack"
  | "battleShoot"
  | "battleMove"
  | "battleWait"
  | "battleDefend"
  | "battleCastSpell"
  | "battleStepAi"
  | "battleRunAuto"
  | "endBattleVictory"
  | "endBattleDefeat"
>;

// Вспомогательный прогон ИИ-боя в режиме «обе стороны не игрок» (атакующий — ИИ,
// либо ИИ атакует охраняемый объект). Вызывается из battle slice и из adventure
// slice (commitInteraction), поэтому экспортируем.
export function runAiBattle(get: () => GameStore, set: (patch: Partial<GameStore>) => void): void {
  let safety = 0;
  while (get().battle && safety < 200) {
    safety++;
    const result = stepBattleAI(get().battle!);
    set({ battle: result.battle });
    const over = isBattleOver(result.battle);
    if (over) {
      if (over === "attacker") get().endBattleVictory();
      else get().endBattleDefeat();
      break;
    }
  }
}

export const createBattleSlice: StateCreator<GameStore, [], [], BattleSlice> = (set, get) => ({
  battleAttack: gate("battleAttack", (attackerId, defenderId, approachTo) => {
    const b = get().battle;
    if (!b) return;
    set({ battle: doAttack(b, attackerId, defenderId, approachTo) });
  }),
  battleShoot: gate("battleShoot", (attackerId, defenderId) => {
    const b = get().battle;
    if (!b) return;
    set({ battle: doShoot(b, attackerId, defenderId) });
  }),
  battleMove: gate("battleMove", (stackId, to) => {
    const b = get().battle;
    if (!b) return;
    set({ battle: doMove(b, stackId, to) });
  }),
  battleWait: gate("battleWait", stackId => {
    const b = get().battle;
    if (!b) return;
    set({ battle: doWait(b, stackId) });
  }),
  battleDefend: gate("battleDefend", stackId => {
    const b = get().battle;
    if (!b) return;
    set({ battle: doDefend(b, stackId) });
  }),
  battleCastSpell: gate("battleCastSpell", (side, spellId, targetStackId) => {
    const b = get().battle;
    if (!b) return;
    set({ battle: doCastSpell(b, side, spellId, targetStackId) });
  }),
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
    const log = [...s.log, ...logForPlayers(s.day, `${attacker.name} побеждает в бою!`, ...sides)];
    const newPlayers = { ...s.players };
    const newTowns = { ...s.towns };

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
        log.push(logLine(s.day, `${attacker.name} — уровень ${lvl}! +1 ${LEVEL_UP_LABEL[which]}.`, attacker.ownerId));
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
    // Если шли в бой к страже, чтобы подобрать охраняемый объект — продолжить движение.
    const pending = get().pendingMoveAfterCombat;
    if (pending) {
      set({ pendingMoveAfterCombat: null });
      const heroAfter = get().heroes[pending.heroId];
      if (heroAfter && heroAfter.movePoints >= STEP_STRAIGHT && get().phase === "adventure") {
        setTimeout(() => {
          const cur = get();
          if (cur.phase !== "adventure") return;
          if (!cur.heroes[pending.heroId]) return;
          set({ selectedHeroId: pending.heroId } as Partial<GameStore>);
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
    const players = { ...s.players, [owner.id]: newOwner };
    // Защитник тоже должен видеть исход боя; нейтральный бой (без героя-защитника) — только атакующий.
    const defenderHero = b.defenderHeroId ? s.heroes[b.defenderHeroId] : null;
    const log = [...s.log, ...logForPlayers(s.day, `${attacker.name} погиб в бою.`, owner.id, defenderHero?.ownerId)];
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
});
