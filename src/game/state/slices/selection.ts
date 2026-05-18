import type { StateCreator } from "zustand";

import { chebyshev } from "../../utils/pathfind";
import type { Actions, GameStore } from "../actions";

// Локальные UI-действия — не сетятся: у каждого клиента свой выбор/фаза. Сюда же
// открытие/закрытие экранов героя, города и встречи героев.
export type SelectionSlice = Pick<
  Actions,
  | "selectHero"
  | "selectTown"
  | "openTown"
  | "closeTown"
  | "openHero"
  | "closeHero"
  | "openHeroMeeting"
  | "closeHeroMeeting"
>;

export const createSelectionSlice: StateCreator<GameStore, [], [], SelectionSlice> = (set, get) => ({
  selectHero: id => set({ selectedHeroId: id }),
  selectTown: id => set({ selectedTownId: id }),
  openTown: id => set({ phase: "town", selectedTownId: id }),
  closeTown: () => set({ phase: "adventure", selectedTownId: null }),
  openHero: id => set({ phase: "hero", selectedHeroId: id }),
  closeHero: () => set({ phase: "adventure" }),
  openHeroMeeting: otherHeroId => {
    const s = get();
    const myId = s.selectedHeroId;
    if (!myId || myId === otherHeroId) return false;
    const mine = s.heroes[myId];
    const other = s.heroes[otherHeroId];
    if (!mine || !other) return false;
    // Только союзные (один владелец) и только смежные клетки (chebyshev = 1).
    if (mine.ownerId !== other.ownerId) return false;
    if (chebyshev(mine.pos, other.pos) !== 1) return false;
    set({ phase: "heroMeeting", meetingHeroIds: [myId, otherHeroId] });
    return true;
  },
  closeHeroMeeting: () => set({ phase: "adventure", meetingHeroIds: null }),
});
