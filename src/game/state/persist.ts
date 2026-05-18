import type { PersistOptions } from "zustand/middleware";

import type { GameState, Hero, Town } from "../types";
import type { GameStore } from "./actions";

// Конфиг persist-middleware. Версия и миграция собраны в одном месте, чтобы
// при добавлении новых полей в GameState было ясно, как обновлять сохранения.
//
// Игра в релизе. v6 — baseline после релиза. С этой точки любое изменение
// формата ОБЯЗАНО сопровождаться миграцией здесь, а не просто бампом version.
export const persistConfig: PersistOptions<GameStore> = {
  name: "heroes-web-save",
  version: 13,
  migrate: (persisted, fromVersion) => {
    const state = persisted as Partial<GameState>;
    // Сейвы версий < 6 — времён до релиза, формат менялся свободно. Их не мигрируем,
    // вернём пустое состояние, чтобы persist подставил initialState.
    if (fromVersion < 6) return undefined as unknown as GameStore;
    if (fromVersion < 7) {
      // v7: магия. Героям проставляем дефолтные spellPower/knowledge/mana/spells.
      // Городам — нулевой уровень гильдии и пустой список заклинаний.
      // Активный бой при таком изменении формата не восстанавливаем — формат
      // BattleState тоже изменился (магия, tempBonus).
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
      // v10: формат BattleStack обновлён (добавлен hasWaited). Активный бой роняем.
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
    return state as GameStore;
  },
};
