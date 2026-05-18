import type { ArmySlotRef, ArtifactSlot, Coord, GameState, NewGameOptions, Resource } from "../types";

// Полная типовая модель store: state + actions. Используется как тип zustand'а
// и в StateCreator всех slice'ов.
export type GameStore = GameState & Actions;

// Все действия store. UI получает их через useGame((s) => s.action). Слайсы
// внутри src/game/state/slices/* реализуют куски этого интерфейса; главный
// store собирает их в один объект.
//
// Возвращаемые типы у gate-обёрнутых action'ов имеют `| undefined` — в
// client-режиме action просто шлёт команду хосту и сразу возвращает undefined.
export interface Actions {
  // ===== Фазы / навигация =====
  goToMenu: () => void;
  goToNewGame: () => void;
  goToMultiplayer: () => void;

  // ===== Жизненный цикл партии =====
  startGame: (opts: NewGameOptions) => void;
  reset: () => void;

  // ===== Выбор/открытие экранов =====
  selectHero: (id: string | null) => void;
  selectTown: (id: string | null) => void;
  openTown: (id: string) => void;
  closeTown: () => void;
  openHero: (id: string) => void;
  closeHero: () => void;
  openHeroMeeting: (otherHeroId: string) => boolean | undefined;
  closeHeroMeeting: () => void;

  // ===== Карта приключений =====
  // heroId опционален: SP читает s.selectedHeroId, MP — клиент явно шлёт свой
  // выбор, иначе host попытается двигать своего героя.
  moveHeroTo: (target: Coord, heroId?: string) => "ok" | "blocked" | "noPoints" | "noPath" | "interaction" | undefined;
  endTurn: () => void;
  // Завершить отложенную интеракцию: вызвать interactWithObject. Дергается UI
  // после окончания анимации перемещения; для ИИ — после await паузы анимации.
  commitInteraction: () => void;

  // ===== Город =====
  buildBuilding: (townId: string, buildingId: string) => boolean | undefined;
  hireUnits: (townId: string, unitId: string, count: number) => boolean | undefined;
  hireHero: (townId: string, protoId?: string) => boolean | undefined;
  tradeResource: (townId: string, from: Resource, to: Resource, fromQty: number) => boolean | undefined;
  garrisonToHero: (townId: string, slotIdx: number) => void;
  heroToGarrison: (heroId: string, slotIdx: number) => void;

  // ===== Армия / артефакты =====
  swapArmySlots: (heroIdA: string, slotA: number, heroIdB: string, slotB: number) => void;
  // Разделить/перенести часть стека between hero ↔ hero ↔ garrison.
  // target слот может быть занят тем же юнитом (merge) или пустым (новый стек).
  splitStack: (from: ArmySlotRef, to: ArmySlotRef, count: number) => void;
  equipFromBackpack: (heroId: string, backpackIdx: number) => void;
  unequipToBackpack: (heroId: string, slot: ArtifactSlot) => void;
  transferArtifact: (
    fromHeroId: string,
    source: { kind: "equipped"; slot: ArtifactSlot } | { kind: "backpack"; idx: number },
    toHeroId: string,
  ) => void;
  transferAllArmy: (fromHeroId: string, toHeroId: string) => void;
  transferAllArtifacts: (fromHeroId: string, toHeroId: string) => void;

  // ===== Бой =====
  // Прямые действия — заведены отдельными actions, чтобы по сети было что
  // прокидывать (UI раньше напрямую вызывал do* из engine).
  battleAttack: (attackerId: string, defenderId: string, approachTo?: Coord) => void;
  battleShoot: (attackerId: string, defenderId: string) => void;
  battleMove: (stackId: string, to: Coord) => void;
  battleWait: (stackId: string) => void;
  battleDefend: (stackId: string) => void;
  battleCastSpell: (side: "attacker" | "defender", spellId: string, targetStackId: string) => void;
  battleStepAi: () => void;
  battleRunAuto: () => void;
  endBattleVictory: () => void;
  endBattleDefeat: () => void;
}
