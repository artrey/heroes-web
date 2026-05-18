import { initialState } from "../game/state/initial";
import type { GameState } from "../game/types";

// Поля GameState, которые НЕ синхронизируются между host и client. У каждого
// игрока они свои: «у меня открыт мой город, у соседа — карта». Битву показывает
// App.tsx по полю state.battle независимо от локальной phase.
//
// ВСЕ остальные поля GameState считаются sync по умолчанию. То есть при добавлении
// нового поля в GameState достаточно:
//   1) добавить в initialState (как и сейчас);
//   2) если оно UI-локальное — внести сюда.
// Иначе оно автоматически попадёт в broadcast — это «безопасный по умолчанию»
// контракт (легче забыть пометить локальное, чем забыть про синк новой механики).
export const LOCAL_STATE_FIELDS: ReadonlyArray<keyof GameState> = [
  "phase",
  "selectedHeroId",
  "selectedTownId",
  "meetingHeroIds",
  "pendingObjectVisit",
];

const LOCAL_SET = new Set<keyof GameState>(LOCAL_STATE_FIELDS);
// Полный список ключей GameState получаем из initialState — он гарантированно
// содержит все поля типа (TS проверяет initialState: GameState).
const ALL_STATE_KEYS = Object.keys(initialState) as Array<keyof GameState>;
const SYNCED_KEYS: ReadonlyArray<keyof GameState> = ALL_STATE_KEYS.filter(k => !LOCAL_SET.has(k));

// Снимок GameState для отправки клиентам. Берёт все sync-поля автоматически.
export function snapshotGameState(s: GameState): Partial<GameState> {
  const out: Partial<GameState> = {};
  for (const key of SYNCED_KEYS) {
    // TS не различает индивидуальные ключи, но runtime поведение корректное.
    (out as Record<string, unknown>)[key] = s[key];
  }
  return out;
}
