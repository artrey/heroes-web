import { startBattle } from "../../battle/engine";
import { getArtifact } from "../../data/artifacts";
import type { GameState, HeroArtifacts, Player, ResourceBag, Town } from "../../types";
import { VISION_RADIUS_TOWN } from "../../types";
import { levelFromXp } from "../../utils/leveling";
import { add, RESOURCE_NAMES } from "../../utils/resources";
import { revealForPlayer } from "../../utils/visibility";
import { aiBattleBonus } from "./ai";
import { applyMageGuildVisit } from "./army";
import { LEVEL_UP_LABEL, rollLevelUpStat } from "./levelUp";
import { logForPlayers, logLine } from "./log";

// Store-API, который мы дёргаем из interactWithObject / captureTown. Помещён как
// параметр, чтобы не плодить циклические импорты с главным store.
export interface StoreApi {
  getState: () => GameState;
  setState: (patch: Partial<GameState>) => void;
}

// Захват города новым владельцем. Меняет ownerId, переоформляет townIds и
// добавляет видимость для нового владельца. Если у предыдущего владельца не
// осталось ни городов, ни героев — фиксируем поражение. Если живых игроков
// остался один — выставляем gameOver.
export function captureTown(api: StoreApi, townId: string, newOwnerId: string): void {
  const s = api.getState();
  const town = s.towns[townId];
  if (!town) return;
  const players = { ...s.players };
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
  api.setState({
    players,
    towns: { ...s.towns, [townId]: newTown },
    map: { ...map, objects: newObjects },
    log: [...s.log, ...logForPlayers(s.day, `Город "${town.name}" захвачен!`, newOwnerId, town.ownerId ?? undefined)],
  });
  // Проверка победы — если у предыдущего владельца не осталось ни городов, ни героев.
  if (town.ownerId) {
    const old = api.getState().players[town.ownerId];
    if (old.heroIds.length === 0 && old.townIds.length === 0 && !old.defeated) {
      api.setState({
        players: { ...api.getState().players, [town.ownerId]: { ...old, defeated: true } },
        // Глобально: «X побеждён» видят все.
        log: [...api.getState().log, logLine(api.getState().day, `${old.name} побеждён.`)],
      });
    }
  }
  const alive = Object.values(api.getState().players).filter(p => !p.defeated);
  if (alive.length === 1) {
    api.setState({ phase: "gameOver", winnerId: alive[0].id });
  }
}

// Обработать «наступление» героя на объект карты: подобрать ресурс/артефакт/сундук,
// захватить шахту/город, начать бой с монстром. Состояние читаем/пишем через
// store API, чтобы не зависеть напрямую от useGame.
export function interactWithObject(api: StoreApi, objId: string, heroId?: string): void {
  const s = api.getState();
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
    api.setState({
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
      const levelUps = [];
      if (newLevel > hero.level) {
        for (let lvl = hero.level + 1; lvl <= newLevel; lvl++) {
          const which = rollLevelUpStat();
          newStatBonus[which] += 1;
          levelUps.push(logLine(s.day, `${hero.name} — уровень ${lvl}! +1 ${LEVEL_UP_LABEL[which]}.`, hero.ownerId));
        }
      }
      api.setState({
        heroes: { ...s.heroes, [hero.id]: { ...hero, xp: newXp, level: newLevel, statBonus: newStatBonus } },
        map: { ...s.map, objects: newObjects, tiles: newTiles },
        log: [...s.log, logLine(s.day, `Сундук с опытом: +${baseAmount} опыта`, hero.ownerId), ...levelUps],
      });
    } else {
      const newResources = { ...player.resources, gold: player.resources.gold + baseAmount };
      api.setState({
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
    api.setState({
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
    api.setState({
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
    const battle = startBattle({
      attackerHero: hero,
      defenderHero: null,
      defenderObjectId: obj.id,
      defenderArmy: [{ unitId: obj.unitId, count: obj.unitCount }],
      attackerExtraBonus: aiBattleBonus(s, hero),
    });
    api.setState({ battle, phase: "battle" });
    return;
  }

  if (obj.kind === "dwelling") {
    const town = s.towns[obj.id];
    if (!town) return;
    if (town.ownerId === s.activePlayerId) {
      // Свой город — если герой стоит в нём и есть гильдия, учим заклинания и поим ману.
      if (hero) {
        const updated = applyMageGuildVisit(hero, town);
        if (updated !== hero) {
          api.setState({ heroes: { ...s.heroes, [hero.id]: updated } });
        }
      }
      // Открыть UI только если за игрока-человека.
      if (s.players[s.activePlayerId]?.isHuman) {
        api.setState({ phase: "town", selectedTownId: town.id });
      }
    } else if (hero) {
      // Захват пустого города или бой с гарнизоном.
      if (town.garrison.length === 0) {
        captureTown(api, town.id, hero.ownerId);
      } else {
        const battle = startBattle({
          attackerHero: hero,
          defenderHero: null,
          defenderObjectId: town.id,
          defenderArmy: town.garrison,
          attackerExtraBonus: aiBattleBonus(s, hero),
        });
        api.setState({ battle, phase: "battle" });
      }
    }
    return;
  }
}
