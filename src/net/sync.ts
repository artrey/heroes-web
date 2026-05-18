import { useGame } from "../game/store";
import type { GameState } from "../game/types";
import { useNet } from "./netStore";
import type { NetMessage } from "./peer";

// Список действий, которые шлются от клиента к хосту. Сам хост выполняет
// их обычным путём — это просто разрешённый «whitelist» команд.
export const NETWORKED_ACTIONS = [
  "moveHeroTo",
  "endTurn",
  "buildBuilding",
  "hireUnits",
  "hireHero",
  "tradeResource",
  "garrisonToHero",
  "heroToGarrison",
  "openHeroMeeting",
  "closeHeroMeeting",
  "swapArmySlots",
  "splitStack",
  "equipFromBackpack",
  "unequipToBackpack",
  "transferArtifact",
  "transferAllArmy",
  "transferAllArtifacts",
  "openTown",
  "closeTown",
  "openHero",
  "closeHero",
  "selectHero",
  "selectTown",
  "battleAttack",
  "battleShoot",
  "battleMove",
  "battleWait",
  "battleDefend",
  "battleCastSpell",
  "battleStepAi",
  "battleRunAuto",
  "endBattleVictory",
  "endBattleDefeat",
  "commitInteraction",
] as const;

export type NetworkedActionName = (typeof NETWORKED_ACTIONS)[number];
const NETWORKED_SET = new Set<string>(NETWORKED_ACTIONS);

export function isNetworkedAction(name: string): name is NetworkedActionName {
  return NETWORKED_SET.has(name);
}

// Поля состояния, которые синхронизируются между host и client. Намеренно НЕ
// шлём UI-поля (phase, selectedHeroId/TownId, meetingHeroIds, pendingObjectVisit) —
// они у каждого клиента свои: у меня открыт мой город, у соседа — его карта.
// Битву показывает App.tsx по полю state.battle независимо от локальной фазы.
export function snapshotGameState(s: GameState): Partial<GameState> {
  return {
    day: s.day,
    week: s.week,
    month: s.month,
    activePlayerId: s.activePlayerId,
    players: s.players,
    playerOrder: s.playerOrder,
    heroes: s.heroes,
    towns: s.towns,
    map: s.map,
    battle: s.battle,
    pendingMoveAfterCombat: s.pendingMoveAfterCombat,
    pendingInteraction: s.pendingInteraction,
    options: s.options,
    log: s.log,
    winnerId: s.winnerId,
  };
}

// Host: послать всем клиентам актуальный GameState.
export function broadcastState(): void {
  const net = useNet.getState();
  if (net.role !== "host" || !net.host) return;
  const snap = snapshotGameState(useGame.getState());
  net.host.broadcast({ type: "state", state: snap });
  console.log("[net] host: broadcast state day=", snap.day, "peers=", net.host.peerIds().length);
}

// Подписаться один раз на изменения game-store. Когда роль = host, любые мутации
// (включая каскадные set() внутри одного action или setTimeout-вызовов ИИ) уйдут
// клиентам. Микротаск-дебаунс склеивает пачку set() в один broadcast.
let pending = false;
export function installNetworkHooks(): void {
  useGame.subscribe(() => {
    if (useNet.getState().role !== "host") return;
    if (pending) return;
    pending = true;
    queueMicrotask(() => {
      pending = false;
      broadcastState();
    });
  });
}

// Host: входящее сообщение от клиента.
export function handleIncomingFromClient(_peerId: string, msg: NetMessage): void {
  if (msg.type !== "action") return;
  if (!isNetworkedAction(msg.name)) return;
  // Выполняем у себя — стандартный путь zustand-store, и потом broadcast.
  runNetworkedAction(msg.name, msg.args ?? []);
}

// Client: входящее сообщение от хоста.
export function handleIncomingFromHost(msg: NetMessage): void {
  if (msg.type === "state") {
    useGame.setState(msg.state as Partial<GameState>);
    return;
  }
  if (msg.type === "assign") {
    useNet.getState().setMyPlayerId(msg.playerId);
    useNet.getState().setRoomCode(msg.roomCode);
    return;
  }
  if (msg.type === "lobby") {
    useNet.getState().setLobby(msg.players);
    return;
  }
}

// Универсальный вызов действия из store по имени. Используется хостом —
// и при локальном клике (action() оборачивается этой функцией), и при
// получении команды от клиента.
function runNetworkedAction(name: NetworkedActionName, args: unknown[]): void {
  const actions = useGame.getState() as unknown as Record<string, (...args: unknown[]) => unknown>;
  const fn = actions[name];
  if (typeof fn !== "function") return;
  fn(...args);
  broadcastState();
}

// Точка входа из UI/store: «выполнить действие N с аргументами args».
// В sp- и host-режимах действие выполняется локально (и хост дополнительно делает broadcast).
// В client-режиме действие НЕ выполняется локально — отправляем хосту и ждём state.
export function dispatchAction(name: NetworkedActionName, args: unknown[]): "local" | "sent" {
  const net = useNet.getState();
  if (net.role === "client") {
    net.client?.send({ type: "action", name, args });
    return "sent";
  }
  if (net.role === "host") {
    runNetworkedAction(name, args);
    return "local";
  }
  // sp — просто вызвать локально.
  const actions = useGame.getState() as unknown as Record<string, (...args: unknown[]) => unknown>;
  const fn = actions[name];
  if (typeof fn === "function") fn(...args);
  return "local";
}
