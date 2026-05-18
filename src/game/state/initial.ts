import type { GameState, ResourceBag } from "../types";

// Цвета слотов игроков — индекс совпадает с порядком в playerOrder.
export const PLAYER_COLORS = ["#d04040", "#4080d0", "#40b040", "#d0a040", "#a040b0", "#40b0b0", "#d04080", "#808080"];

// Стоимость найма героя в таверне города — едина для всех фракций.
export const HERO_HIRE_COST: Partial<ResourceBag> = { gold: 2500 };

export const initialState: GameState = {
  phase: "menu",
  day: 1,
  week: 1,
  month: 1,
  activePlayerId: "",
  players: {},
  playerOrder: [],
  heroes: {},
  towns: {},
  map: null,
  battle: null,
  selectedHeroId: null,
  selectedTownId: null,
  meetingHeroIds: null,
  pendingObjectVisit: null,
  pendingMoveAfterCombat: null,
  pendingInteraction: null,
  options: null,
  log: [],
  winnerId: null,
};
