import type { StateCreator } from "zustand";

import { getBuilding, MAGE_GUILD_LEVEL } from "../../data/buildings";
import { getHeroProto, pickHeroProto } from "../../data/heroes";
import { reverseRate } from "../../data/marketRates";
import { rollSpellsForGuildLevel } from "../../data/spells";
import { getUnit, UNITS } from "../../data/units";
import type { Hero, Player, Resource, ResourceBag, Town, UnitStack } from "../../types";
import { VISION_RADIUS_HERO } from "../../types";
import { makeId } from "../../utils/id";
import { canAfford, pay, RESOURCE_NAMES } from "../../utils/resources";
import { mulberry32, randInt } from "../../utils/rng";
import { revealForPlayer } from "../../utils/visibility";
import type { Actions, GameStore } from "../actions";
import { addToArmy, applyMageGuildVisit, findHeroSpawnPos } from "../helpers/army";
import { gate } from "../helpers/gate";
import { logLine } from "../helpers/log";
import { HERO_HIRE_COST } from "../initial";

export type TownSlice = Pick<
  Actions,
  "buildBuilding" | "hireUnits" | "hireHero" | "tradeResource" | "garrisonToHero" | "heroToGarrison"
>;

export const createTownSlice: StateCreator<GameStore, [], [], TownSlice> = (set, get) => ({
  buildBuilding: gate("buildBuilding", (townId, buildingId) => {
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
    // случайные заклинания этого уровня к уже известным.
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

  hireUnits: gate("hireUnits", (townId, unitId, count) => {
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

  hireHero: gate("hireHero", (townId, protoId) => {
    const s = get();
    const town = s.towns[townId];
    if (!town || !town.ownerId) return false;
    if (town.ownerId !== s.activePlayerId) return false;
    if (!town.built.includes("tavern")) return false;
    const player = s.players[town.ownerId];
    if (!canAfford(player.resources, HERO_HIRE_COST)) return false;
    if (!s.map) return false;
    // Найти позицию для нового героя.
    const spawnPos = findHeroSpawnPos(s, town.pos);
    if (!spawnPos) return false;

    const rng = mulberry32((Date.now() ^ town.id.length) >>> 0);
    // Если игрок выбрал конкретного кандидата (второй из таверны — из чужой
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

  tradeResource: gate("tradeResource", (townId, from, to, fromQty) => {
    const s = get();
    const town = s.towns[townId];
    if (!town || !town.ownerId) return false;
    if (town.ownerId !== s.activePlayerId) return false;
    if (!town.built.includes("marketplace")) return false;
    if (fromQty <= 0 || from === to) return false;
    const player = s.players[town.ownerId];
    if ((player.resources[from as Resource] ?? 0) < fromQty) return false;
    const toQty = reverseRate(from, to, fromQty);
    if (toQty <= 0) return false;
    const newRes = { ...player.resources };
    newRes[from as Resource] -= fromQty;
    newRes[to as Resource] += toQty;
    set({
      players: { ...s.players, [player.id]: { ...player, resources: newRes } },
      log: [
        ...s.log,
        logLine(s.day, `Рынок: ${fromQty} ${RESOURCE_NAMES[from]} → ${toQty} ${RESOURCE_NAMES[to]}`, player.id),
      ],
    });
    return true;
  }),

  garrisonToHero: gate("garrisonToHero", (townId, slotIdx) => {
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

  heroToGarrison: gate("heroToGarrison", (heroId, slotIdx) => {
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
});
