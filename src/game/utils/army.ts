import type { UnitStack } from "../types";

// Найти первый пустой слот в армии (0..6). null — если все 7 заняты.
// Используется UI-кодом (drag/drop, split) для определения куда положить
// новый стек, а также backend-логикой (addToArmy в helpers/army.ts работает
// похоже, но возвращает изменённую армию, а не индекс слота).
export function findFirstEmptySlot(army: UnitStack[]): number | null {
  for (let i = 0; i < 7; i++) {
    if (!army[i]) return i;
  }
  return null;
}
