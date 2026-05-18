import { networkedActionNames } from "../game/state/helpers/gate";
import { useGame } from "../game/store";
import type { GameState } from "../game/types";
import { useNet } from "./netStore";
import type { NetMessage } from "./peer";
import { snapshotGameState } from "./registry";

// Сетевая прослойка над game-store. Дизайн:
//   - Whitelist сетевых action'ов формируется автоматически: каждый gate(name, fn)
//     при определении регистрирует name в registry. См. game/state/helpers/gate.ts.
//   - Поля state, которые НЕ нужно синхронизировать (UI-локальные), перечислены
//     в net/registry.ts. Снимок GameState строится автоматически из всех остальных.
//   - Этот файл — минимальный «маршрутизатор»: получил/отправил.

function isNetworkedAction(name: string): boolean {
  return networkedActionNames.has(name);
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
  const actions = useGame.getState() as unknown as Record<string, (...args: unknown[]) => unknown>;
  const fn = actions[msg.name];
  if (typeof fn !== "function") return;
  fn(...(msg.args ?? []));
  broadcastState();
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
