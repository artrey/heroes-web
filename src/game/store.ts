import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { GameStore } from "./state/actions";
import { initialState } from "./state/initial";
import { persistConfig } from "./state/persist";
import { createAdventureSlice } from "./state/slices/adventure";
import { createArmySlice } from "./state/slices/army";
import { createBattleSlice } from "./state/slices/battle";
import { createLifecycleSlice } from "./state/slices/lifecycle";
import { createMenuSlice } from "./state/slices/menu";
import { createSelectionSlice } from "./state/slices/selection";
import { createTownSlice } from "./state/slices/town";

// Главный store — тонкая композиция slice'ов. Каждый slice владеет своей частью
// action'ов и держит свою бизнес-логику в src/game/state/. Внешний API
// (useGame((s) => s.xxx)) тот же — UI компоненты ничего не знают про
// внутреннее устройство.
export type { Actions, BattleAction, GameStore } from "./state/actions";

export const useGame = create<GameStore>()(
  persist(
    (...api) => ({
      ...initialState,
      ...createMenuSlice(...api),
      ...createLifecycleSlice(...api),
      ...createSelectionSlice(...api),
      ...createAdventureSlice(...api),
      ...createTownSlice(...api),
      ...createArmySlice(...api),
      ...createBattleSlice(...api),
    }),
    persistConfig,
  ),
);
