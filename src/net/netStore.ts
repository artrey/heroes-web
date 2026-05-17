import { create } from "zustand";

import type { LobbyPlayer, NetClient, NetHost } from "./peer";

export type NetRole = "sp" | "host" | "client";
export type NetStatus = "idle" | "connecting" | "lobby" | "in-game" | "error";

export interface NetState {
  role: NetRole;
  status: NetStatus;
  // Код комнаты — peerId хоста. На host — собственный peerId; на client — введённый.
  roomCode: string | null;
  // Собственный peerId — обоим сторонам полезно для UI.
  myPeerId: string | null;
  // Назначенный нам playerId внутри игры. Host выставляет себе сразу при создании игры.
  myPlayerId: string | null;
  // Имя локального игрока для лобби.
  myName: string;
  // Состояние лобби (на host — собирается; на client — приходит от host).
  lobby: LobbyPlayer[];
  // Транспорт. Не сериализуем (на странице не сохраняется).
  host: NetHost | null;
  client: NetClient | null;
  errorText: string | null;
}

interface Actions {
  setMyName: (name: string) => void;
  setStatus: (s: NetStatus) => void;
  setRoomCode: (code: string | null) => void;
  setMyPeerId: (id: string | null) => void;
  setMyPlayerId: (id: string | null) => void;
  setLobby: (players: LobbyPlayer[]) => void;
  setError: (text: string | null) => void;
  setRole: (r: NetRole) => void;
  setHost: (h: NetHost | null) => void;
  setClient: (c: NetClient | null) => void;
  // Полный сброс сетевого состояния (например, при возврате в меню).
  reset: () => void;
}

const initial: NetState = {
  role: "sp",
  status: "idle",
  roomCode: null,
  myPeerId: null,
  myPlayerId: null,
  myName: "Игрок",
  lobby: [],
  host: null,
  client: null,
  errorText: null,
};

// Хук-резолвер: какой playerId считать «своим». В SP — null (UI смотрит на isHuman),
// в MP — myPlayerId из assign либо запасной путь через lobby+myPeerId.
export function useMyPlayerId(): string | null {
  const role = useNet(s => s.role);
  const myPlayerNetId = useNet(s => s.myPlayerId);
  const myPeerId = useNet(s => s.myPeerId);
  const lobby = useNet(s => s.lobby);
  if (role === "sp") return null;
  if (myPlayerNetId) return myPlayerNetId;
  if (myPeerId) {
    const me = lobby.find(p => p.peerId === myPeerId);
    if (me?.playerId) return me.playerId;
  }
  return null;
}

export const useNet = create<NetState & Actions>((set, get) => ({
  ...initial,
  setMyName: name => set({ myName: name }),
  setStatus: status => set({ status }),
  setRoomCode: code => set({ roomCode: code }),
  setMyPeerId: id => set({ myPeerId: id }),
  setMyPlayerId: id => set({ myPlayerId: id }),
  setLobby: players => set({ lobby: players }),
  setError: text => set({ errorText: text }),
  setRole: r => set({ role: r }),
  setHost: h => set({ host: h }),
  setClient: c => set({ client: c }),
  reset: () => {
    const s = get();
    s.host?.stop();
    s.client?.stop();
    set({ ...initial });
  },
}));
