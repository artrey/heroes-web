import type { StateCreator } from "zustand";

import type { Actions, GameStore } from "../actions";

export type MenuSlice = Pick<Actions, "goToMenu" | "goToNewGame" | "goToMultiplayer">;

export const createMenuSlice: StateCreator<GameStore, [], [], MenuSlice> = set => ({
  goToMenu: () => set({ phase: "menu" }),
  goToNewGame: () => set({ phase: "newGame" }),
  goToMultiplayer: () => set({ phase: "multiplayer" }),
});
