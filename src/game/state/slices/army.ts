import type { StateCreator } from "zustand";

import { ARTIFACTS } from "../../data/artifacts";
import type { ArmySlotRef, HeroArtifacts, UnitStack } from "../../types";
import { ARTIFACT_SLOT_ORDER } from "../../types";
import type { Actions, GameStore } from "../actions";
import { gate } from "../helpers/gate";

export type ArmySlice = Pick<
  Actions,
  | "swapArmySlots"
  | "splitStack"
  | "equipFromBackpack"
  | "unequipToBackpack"
  | "transferArtifact"
  | "transferAllArmy"
  | "transferAllArtifacts"
>;

export const createArmySlice: StateCreator<GameStore, [], [], ArmySlice> = (set, get) => ({
  swapArmySlots: gate("swapArmySlots", (heroIdA, slotA, heroIdB, slotB) => {
    const s = get();
    const a = s.heroes[heroIdA];
    const b = s.heroes[heroIdB];
    if (!a || !b) return;
    if (a.ownerId !== b.ownerId) return;
    if (a.ownerId !== s.activePlayerId) return;
    // Один и тот же герой, разные слоты — внутренний swap. Одинаковые юниты
    // сливаются (как и при обмене между разными героями), иначе игрок
    // вынужден был бы делать лишний шаг через splitStack.
    if (heroIdA === heroIdB) {
      const army = a.army.slice();
      const stA = army[slotA];
      const stB = army[slotB];
      if (stA && stB && stA.unitId === stB.unitId) {
        army[slotB] = { unitId: stB.unitId, count: stB.count + stA.count };
        army.splice(slotA, 1);
      } else {
        const tmp = army[slotA];
        army[slotA] = army[slotB];
        army[slotB] = tmp;
      }
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

  splitStack: gate("splitStack", (from: ArmySlotRef, to: ArmySlotRef, count: number) => {
    const s = get();
    function read(ref: ArmySlotRef): { army: UnitStack[]; ownerId: string | null } | null {
      if (ref.kind === "hero") {
        const h = s.heroes[ref.heroId];
        if (!h) return null;
        return { army: h.army, ownerId: h.ownerId };
      }
      const t = s.towns[ref.townId];
      if (!t) return null;
      return { army: t.garrison, ownerId: t.ownerId };
    }
    const A = read(from);
    const B = read(to);
    if (!A || !B) return;
    // Действовать может только активный игрок и только над своими отрядами.
    if (A.ownerId !== s.activePlayerId || B.ownerId !== s.activePlayerId) return;
    const src = A.army[from.slot];
    if (!src) return;
    if (count < 1 || count > src.count) return;
    const dst = B.army[to.slot];
    if (dst && dst.unitId !== src.unitId) return; // несовместимые юниты
    const sameContainer =
      (from.kind === "hero" && to.kind === "hero" && from.heroId === to.heroId) ||
      (from.kind === "garrison" && to.kind === "garrison" && from.townId === to.townId);
    if (sameContainer && from.slot === to.slot) return;
    // Если переносим весь стек в пустой слот того же контейнера — это просто
    // перестановка; используется swapArmySlots, splitStack игнорим как no-op.
    if (sameContainer && !dst && count === src.count) return;

    const fromArmy = A.army.map(st => ({ ...st }));
    const toArmy = sameContainer ? fromArmy : B.army.map(st => ({ ...st }));
    const srcCopy = fromArmy[from.slot];
    if (dst) {
      // Merge в существующий слот того же юнита.
      toArmy[to.slot] = { unitId: dst.unitId, count: dst.count + count };
    } else {
      // Append (массивы армии плотные — точный visual index слота не важен,
      // UI отрисует юнит в первом свободном слоте).
      if (toArmy.length >= 7) return;
      toArmy.push({ unitId: srcCopy.unitId, count });
    }
    if (count >= srcCopy.count) {
      fromArmy.splice(from.slot, 1);
    } else {
      srcCopy.count -= count;
    }

    const newHeroes = { ...s.heroes };
    const newTowns = { ...s.towns };
    function write(ref: ArmySlotRef, army: UnitStack[]) {
      if (ref.kind === "hero") {
        newHeroes[ref.heroId] = { ...s.heroes[ref.heroId], army };
      } else {
        newTowns[ref.townId] = { ...s.towns[ref.townId], garrison: army };
      }
    }
    if (sameContainer) {
      write(from, fromArmy);
    } else {
      write(from, fromArmy);
      write(to, toArmy);
    }
    set({ heroes: newHeroes, towns: newTowns });
  }),

  equipFromBackpack: gate("equipFromBackpack", (heroId, backpackIdx) => {
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

  unequipToBackpack: gate("unequipToBackpack", (heroId, slot) => {
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
  transferAllArmy: gate("transferAllArmy", (fromHeroId, toHeroId) => {
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
  transferAllArtifacts: gate("transferAllArtifacts", (fromHeroId, toHeroId) => {
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

  transferArtifact: gate("transferArtifact", (fromHeroId, source, toHeroId) => {
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
  }),
});
