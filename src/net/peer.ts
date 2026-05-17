import { Peer, type DataConnection } from "peerjs";

// Сообщения сетевого протокола. Намеренно держим формат плоским — никаких
// версий/контрольных сумм, MVP. BinaryPack чанкает большие сообщения сам.
export type NetMessage =
  | { type: "hello"; name: string; faction: string }
  | { type: "setFaction"; faction: string }
  | { type: "assign"; playerId: string; roomCode: string }
  | { type: "lobby"; players: LobbyPlayer[]; canStart: boolean }
  | { type: "state"; state: unknown }
  | { type: "action"; name: string; args: unknown[] }
  | { type: "start" };

export interface LobbyPlayer {
  peerId: string;
  name: string;
  // Назначенный host'ом playerId внутри игровой модели. До старта игры — null.
  playerId: string | null;
  isHost: boolean;
  // Выбранная игроком фракция (для MP стартует с этой; host задаёт свою сразу).
  faction: string;
}

// Параметры хоста: что делать при подключении клиента, при получении данных и при разрыве.
export interface HostHandlers {
  onPeerOpen: (peerId: string) => void;
  onConnect: (conn: DataConnection) => void;
  onMessage: (peerId: string, msg: NetMessage) => void;
  onDisconnect: (peerId: string) => void;
  onError: (err: Error) => void;
}

export interface ClientHandlers {
  onOpen: () => void;
  onMessage: (msg: NetMessage) => void;
  onDisconnect: () => void;
  onError: (err: Error) => void;
}

// Управляющая обёртка над PeerJS для хоста: держит карту peerId → DataConnection.
export class NetHost {
  private peer: Peer | null = null;
  private conns = new Map<string, DataConnection>();
  private handlers: HostHandlers;

  constructor(handlers: HostHandlers) {
    this.handlers = handlers;
  }

  start(): void {
    // По умолчанию PeerJS использует публичный broker peerjs.com — для signaling этого хватает.
    const peer = new Peer();
    this.peer = peer;
    peer.on("open", id => this.handlers.onPeerOpen(id));
    peer.on("connection", conn => this.attachIncoming(conn));
    peer.on("error", err => this.handlers.onError(err as Error));
  }

  private attachIncoming(conn: DataConnection): void {
    conn.on("open", () => {
      this.conns.set(conn.peer, conn);
      this.handlers.onConnect(conn);
    });
    conn.on("data", data => this.handlers.onMessage(conn.peer, data as NetMessage));
    conn.on("close", () => {
      this.conns.delete(conn.peer);
      this.handlers.onDisconnect(conn.peer);
    });
    conn.on("error", err => this.handlers.onError(err as Error));
  }

  sendTo(peerId: string, msg: NetMessage): void {
    const c = this.conns.get(peerId);
    if (c?.open) c.send(msg);
  }

  broadcast(msg: NetMessage): void {
    for (const c of this.conns.values()) if (c.open) c.send(msg);
  }

  peerIds(): string[] {
    return Array.from(this.conns.keys());
  }

  stop(): void {
    for (const c of this.conns.values()) c.close();
    this.conns.clear();
    this.peer?.destroy();
    this.peer = null;
  }
}

// Обёртка для клиента: одно соединение к хосту.
export class NetClient {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private handlers: ClientHandlers;

  constructor(handlers: ClientHandlers) {
    this.handlers = handlers;
  }

  connect(hostCode: string): void {
    const peer = new Peer();
    this.peer = peer;
    peer.on("open", () => {
      // serialization по умолчанию — binary (BinaryPack). Важно именно binary: у
      // json в peerjs нет чанкинга и большие сообщения (state с картой) теряются
      // с ошибкой MessageToBig. Binary режет по 16 KB и сам собирает обратно.
      const conn = peer.connect(hostCode, { reliable: true });
      this.conn = conn;
      conn.on("open", () => this.handlers.onOpen());
      conn.on("data", data => this.handlers.onMessage(data as NetMessage));
      conn.on("close", () => this.handlers.onDisconnect());
      conn.on("error", err => this.handlers.onError(err as Error));
    });
    peer.on("error", err => this.handlers.onError(err as Error));
  }

  send(msg: NetMessage): void {
    if (this.conn?.open) this.conn.send(msg);
  }

  stop(): void {
    this.conn?.close();
    this.peer?.destroy();
    this.conn = null;
    this.peer = null;
  }
}
