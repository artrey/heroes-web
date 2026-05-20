import { startBattle } from "../../battle/engine";
import { FACTION_BUILDINGS } from "../../data/buildings";
import type { Coord } from "../../types";
import { VISION_RADIUS_HERO } from "../../types";
import { findPath, STEP_STRAIGHT, stepCost } from "../../utils/pathfind";
import { canAfford } from "../../utils/resources";
import { revealForPlayer } from "../../utils/visibility";
import type { GameStore } from "../actions";
import { aiBattleBonus, pickAiTarget, waitForAiMoveAnim } from "../helpers/ai";
import { HERO_HIRE_COST } from "../initial";
import { runAiBattle } from "../slices/battle";

// Сколько героев максимум держим у одного ИИ-игрока. Больше — лишняя экономия
// золота, мало что добавляет тактически. Лимит, не цель.
const AI_MAX_HEROES = 3;
// Сколько золота держим в резерве после найма героя, если у игрока уже есть
// хотя бы один герой — иначе экономика просядет под армию.
const AI_GOLD_RESERVE_AFTER_HIRE = 2000;

// Store-API, через который ИИ читает/пишет состояние и вызывает action'ы.
// Передаётся параметром, чтобы избежать циклического импорта useGame.
export interface RunAiApi {
  getState: () => GameStore;
  setState: (patch: Partial<GameStore>) => void;
}

// Сходить один ход ИИ-игрока: строим, нанимаем, двигаем героев, передаём ход.
// Между шагами героев пауза, пропорциональная animSpeed — иначе игрок не успевает
// увидеть, куда ИИ перемещался (несколько setState'ов внутри одного синхронного
// блока схлопываются в один ре-рендер UI).
export async function runAiTurn(api: RunAiApi): Promise<void> {
  const game = api.getState();
  const pid = game.activePlayerId;
  const player = game.players[pid];
  if (!player || player.isHuman || player.defeated) {
    if (!api.getState().battle) api.getState().endTurn();
    return;
  }
  // 1) Постройка в каждом городе одной постройки, если возможно.
  for (const tid of player.townIds) {
    const town = api.getState().towns[tid];
    if (!town || town.builtToday) continue;
    const candidates = FACTION_BUILDINGS[town.faction]
      .filter(b => !town.built.includes(b.id))
      .filter(b => !b.prereq || b.prereq.every(p => town.built.includes(p)))
      .filter(b => canAfford(api.getState().players[pid].resources, b.cost));
    // Приоритет: форт → таверна (для найма героев) → жилища → ратуши → прочее.
    const order: typeof candidates = [
      ...candidates.filter(b => b.id === "fort"),
      ...candidates.filter(b => b.id === "tavern"),
      ...candidates.filter(b => b.produces),
      ...candidates.filter(b => b.givesGoldPerDay),
      ...candidates.filter(b => b.id !== "fort" && b.id !== "tavern" && !b.produces && !b.givesGoldPerDay),
    ];
    if (order[0]) api.getState().buildBuilding(tid, order[0].id);
  }
  // 2) Найм всех доступных юнитов в каждом городе.
  for (const tid of player.townIds) {
    const town = api.getState().towns[tid];
    if (!town) continue;
    for (const [unitId, count] of Object.entries(town.availableUnits)) {
      if (count > 0) api.getState().hireUnits(tid, unitId, count);
    }
    // Передать гарнизон герою, если он на клетке города и есть гарнизон.
    const tw = api.getState().towns[tid];
    const hero = Object.values(api.getState().heroes).find(
      h => h.ownerId === pid && h.pos.x === tw.pos.x && h.pos.y === tw.pos.y,
    );
    if (hero) {
      while (api.getState().towns[tid].garrison.length > 0) {
        api.getState().garrisonToHero(tid, 0);
      }
    }
  }
  // 2.5) Найм героев в таверне. Без героя ИИ просто стоит — берём первого
  // обязательно, остальных только если есть запас золота помимо стоимости.
  for (const tid of player.townIds) {
    const town = api.getState().towns[tid];
    if (!town || !town.built.includes("tavern")) continue;
    const p = api.getState().players[pid];
    if (p.heroIds.length >= AI_MAX_HEROES) break;
    if (!canAfford(p.resources, HERO_HIRE_COST)) break;
    const goldAfter = (p.resources.gold ?? 0) - (HERO_HIRE_COST.gold ?? 0);
    const reserve = p.heroIds.length === 0 ? 0 : AI_GOLD_RESERVE_AFTER_HIRE;
    if (goldAfter < reserve) break;
    api.getState().hireHero(tid);
  }
  // 3) Движение героев. heroIds читаем после найма, чтобы новый герой тоже
  // походил в этот же ход — у него полный запас MP.
  const heroIds = api.getState().players[pid].heroIds.slice();
  for (const hid of heroIds) {
    if (api.getState().battle) return; // если ИИ ввязался в бой — выходим.
    let hero = api.getState().heroes[hid];
    if (!hero) continue;
    for (let i = 0; i < 6; i++) {
      hero = api.getState().heroes[hid];
      if (!hero || hero.movePoints < STEP_STRAIGHT) break;
      const target = pickAiTarget(api.getState(), hero);
      if (!target) break;
      const map = api.getState().map!;
      const path = findPath(map, hero.pos, target);
      if (!path || path.length === 0) break;
      const beforePos = { ...hero.pos };
      moveAiHero(api, hid, target);
      // Дать UI отрисовать перемещение героя до следующего шага.
      const heroAfter = api.getState().heroes[hid];
      if (heroAfter && (heroAfter.pos.x !== beforePos.x || heroAfter.pos.y !== beforePos.y)) {
        await waitForAiMoveAnim(beforePos, heroAfter.pos, map);
      }
      // Если героем была запланирована интеракция с объектом (ресурс/шахта/монстр),
      // выполняем её ПОСЛЕ окончания анимации — иначе предмет пропадает с карты
      // прямо в момент клика, а герой едет на пустую клетку.
      if (api.getState().pendingInteraction) {
        api.getState().commitInteraction();
      }
      if (api.getState().battle) return;
    }
  }
  if (!api.getState().battle) {
    setTimeout(() => api.getState().endTurn(), 50);
  }
}

// Один шаг ИИ: проложить путь до target и пройти его пока хватает MP, обрабатывая
// столкновения с героями и интерактивными объектами. Интеракцию НЕ выполняем —
// её закоммитит runAiTurn после окончания анимации.
function moveAiHero(api: RunAiApi, heroId: string, target: Coord): void {
  const s = api.getState();
  const hero = s.heroes[heroId];
  if (!s.map || !hero) return;
  const path = findPath(s.map, hero.pos, target);
  if (!path) return;
  let mp = hero.movePoints;
  let curPos: Coord = { ...hero.pos };
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
  const owner = api.getState().players[hero.ownerId];
  const updatedOwner = owner ? revealForPlayer(owner, curPos, VISION_RADIUS_HERO, s.map.width, s.map.height) : owner;
  api.setState({
    heroes: { ...api.getState().heroes, [heroId]: { ...hero, pos: curPos, movePoints: mp } },
    players: updatedOwner ? { ...api.getState().players, [hero.ownerId]: updatedOwner } : api.getState().players,
  });
  if (battleWithHero) {
    const defender = api.getState().heroes[battleWithHero];
    if (defender) {
      const attacker = api.getState().heroes[heroId];
      const stateNow = api.getState();
      const battle = startBattle({
        attackerHero: attacker,
        defenderHero: defender,
        defenderObjectId: null,
        attackerExtraBonus: aiBattleBonus(stateNow, attacker),
        defenderExtraBonus: aiBattleBonus(stateNow, defender),
      });
      api.setState({ battle, phase: "battle" });
      runAiBattle(api.getState, api.setState);
    }
    return;
  }
  // Объектную интеракцию НЕ запускаем — её закоммитит runAiTurn после паузы.
  if (triggered) {
    api.setState({ pendingInteraction: { objectId: triggered, heroId } });
  }
}
