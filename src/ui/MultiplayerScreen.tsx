import { useEffect, useState } from "react";

import { FACTION_LIST, FACTION_META } from "../game/data/factions";
import { TEMPLATES } from "../game/data/templates";
import { useGame } from "../game/store";
import type { Difficulty, Faction, NewGameOptions } from "../game/types";
import { useNet } from "../net/netStore";
import { NetClient, NetHost } from "../net/peer";
import type { LobbyPlayer, NetMessage } from "../net/peer";
import { broadcastState } from "../net/sync";

type Mode = "choose" | "host" | "join";

export function MultiplayerScreen() {
  const goToMenu = useGame(s => s.goToMenu);
  const startGame = useGame(s => s.startGame);

  const net = useNet();
  const [mode, setMode] = useState<Mode>("choose");

  // Сбрасываем сеть при уходе с экрана через «назад в меню».
  function back() {
    net.reset();
    setMode("choose");
    goToMenu();
  }

  if (mode === "choose") {
    return (
      <div className="multiplayer-screen">
        <div className="mp-card">
          <h1 style={{ color: "var(--gold)", marginTop: 0 }}>🌐 Мультиплеер (P2P)</h1>
          <p style={{ color: "var(--text-dim)" }}>
            Прямое подключение между браузерами через PeerJS — никакого сервера не нужно. Один создаёт комнату,
            остальные подключаются по короткому коду.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
            <input
              placeholder="Ваше имя"
              value={net.myName}
              onChange={e => net.setMyName(e.target.value)}
              style={{ padding: 8 }}
            />
            <button onClick={() => setMode("host")}>Создать комнату</button>
            <button onClick={() => setMode("join")}>Присоединиться по коду</button>
            <button onClick={back} style={{ marginTop: 12 }}>
              ← В меню
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === "host") return <HostView startGame={startGame} onBack={back} />;
  return <JoinView onBack={back} />;
}

function HostView({ startGame, onBack }: { startGame: (opts: NewGameOptions) => void; onBack: () => void }) {
  const net = useNet();
  const [templateId, setTemplateId] = useState<string>(TEMPLATES[0].id);
  // Локально удобнее держать индекс текущего host'а в лобби; для фракции — обновляем
  // прямо в лобби, чтобы клиенты увидели смену.
  const hostEntry = net.lobby.find(p => p.isHost);
  const faction = (hostEntry?.faction as Faction) ?? "castle";
  function setHostFaction(f: Faction) {
    const next = useNet.getState().lobby.map(p => (p.isHost ? { ...p, faction: f } : p));
    useNet.getState().setLobby(next);
    // Сразу разошлём свежий лобби клиентам.
    useNet.getState().host?.broadcast({ type: "lobby", players: next, canStart: false });
  }

  // Поднимаем хост один раз при входе в этот режим.
  // ВАЖНО: проверяем useNet.getState() (а не замыкание net), потому что в
  // React StrictMode dev-режиме useEffect запускается дважды с тем же замыканием,
  // и мы плодим два NetHost — клиент потом коннектится к одному, а broadcast
  // идёт через другой (peers=0).
  useEffect(() => {
    if (useNet.getState().host) return;
    const host = new NetHost({
      onPeerOpen: id => {
        useNet.getState().setMyPeerId(id);
        useNet.getState().setRoomCode(id);
        useNet.getState().setStatus("lobby");
        useNet.getState().setRole("host");
        // Добавляем себя в лобби как host.
        useNet
          .getState()
          .setLobby([{ peerId: id, name: useNet.getState().myName, playerId: "p0", isHost: true, faction: "castle" }]);
      },
      onConnect: conn => {
        // По умолчанию — гость без имени; настоящее придёт в hello.
        const cur = useNet.getState().lobby;
        const next = [...cur, { peerId: conn.peer, name: "…", playerId: null, isHost: false, faction: "castle" }];
        useNet.getState().setLobby(next);
        broadcastLobby();
      },
      onMessage: (peerId, msg) => handleHostMessage(peerId, msg),
      onDisconnect: peerId => {
        const next = useNet.getState().lobby.filter(p => p.peerId !== peerId);
        useNet.getState().setLobby(next);
        broadcastLobby();
      },
      onError: err => {
        useNet.getState().setError(err.message);
        useNet.getState().setStatus("error");
      },
    });
    useNet.getState().setHost(host);
    host.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function broadcastLobby() {
    const host = useNet.getState().host;
    if (!host) return;
    host.broadcast({ type: "lobby", players: useNet.getState().lobby, canStart: false });
  }

  function handleHostMessage(peerId: string, msg: NetMessage) {
    if (msg.type === "hello") {
      const next = useNet
        .getState()
        .lobby.map(p => (p.peerId === peerId ? { ...p, name: msg.name, faction: msg.faction || p.faction } : p));
      useNet.getState().setLobby(next);
      broadcastLobby();
    }
    if (msg.type === "setFaction") {
      const next = useNet.getState().lobby.map(p => (p.peerId === peerId ? { ...p, faction: msg.faction } : p));
      useNet.getState().setLobby(next);
      broadcastLobby();
    }
    // Игровые action'ы — на отдельном уровне (через sync.ts).
    if (msg.type === "action") {
      // Импортируем динамически, чтобы не закольцевать.
      import("../net/sync").then(s => s.handleIncomingFromClient(peerId, msg));
    }
  }

  function start() {
    const lobby = useNet.getState().lobby;
    if (lobby.length < 1) return;
    const numHumans = lobby.length;
    // По умолчанию 2 ИИ-противника сверху — чтобы было разнообразие; пользователь
    // может позже регулировать через NewGameScreen, но MVP — фиксируем 2 AI.
    const humanFactions = lobby.map(p => p.faction as Faction);
    const opts: NewGameOptions = {
      templateId,
      mapWidth: TEMPLATES.find(t => t.id === templateId)?.defaultWidth ?? 36,
      mapHeight: TEMPLATES.find(t => t.id === templateId)?.defaultHeight ?? 36,
      opponentCount: numHumans - 1 + 2,
      playerFaction: faction,
      playerName: useNet.getState().myName,
      seed: Math.floor(Math.random() * 1_000_000),
      difficulty: "normal" as Difficulty,
      numHumans,
      humanFactions,
    };
    // Запустить игру локально (host) — broadcast подхватит и разошлёт state.
    startGame(opts);
    // Распределить playerId по лобби в порядке: host = playerOrder[0], дальше — гости.
    const order = useGame.getState().playerOrder;
    const assigned: LobbyPlayer[] = lobby.map((p, idx) => ({ ...p, playerId: order[idx] ?? null }));
    useNet.getState().setLobby(assigned);
    useNet.getState().setMyPlayerId(order[0] ?? null);
    useNet.getState().setStatus("in-game");
    const host = useNet.getState().host;
    if (host) {
      // Перед стартом разошлём ОБНОВЛЁННОЕ лобби с проставленными playerId — оно
      // дублирует assign и работает как fallback (клиент находит себя по peerId).
      host.broadcast({ type: "lobby", players: assigned, canStart: false });
      for (const p of assigned) {
        if (p.isHost) continue;
        const msg = { type: "assign" as const, playerId: p.playerId!, roomCode: useNet.getState().roomCode ?? "" };
        console.log("[net] host: assign →", p.peerId, "playerId=", msg.playerId);
        host.sendTo(p.peerId, msg);
      }
      host.broadcast({ type: "start" });
      // Принудительно отправим стартовое состояние сразу — без надежды на микротаск-
      // подписку (бывали гонки, когда клиент видел "start" и не дожидался state).
      broadcastState();
      console.log("[net] host: startGame done, broadcasted lobby/assign/start/state");
    }
  }

  return (
    <div className="multiplayer-screen">
      <div className="mp-card">
        <h2 style={{ color: "var(--gold)", marginTop: 0 }}>🛡 Хост — комната</h2>
        <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 8 }}>
          Поделитесь кодом с друзьями. Они вставят его в окне «Присоединиться».
        </div>
        <div className="mp-code">
          {net.roomCode ?? <span style={{ color: "var(--text-dim)" }}>генерируем подключение…</span>}
          {net.roomCode && (
            <button
              style={{ marginLeft: 8 }}
              onClick={() => {
                void navigator.clipboard.writeText(net.roomCode!);
              }}
            >
              📋
            </button>
          )}
        </div>

        <h3 style={{ color: "var(--gold)" }}>Игроки</h3>
        <ul className="mp-lobby">
          {net.lobby.map(p => (
            <li key={p.peerId}>
              {p.isHost ? "👑 " : "👤 "}
              {p.name}
              {p.isHost && <span style={{ color: "var(--text-dim)" }}> (вы)</span>}{" "}
              <span style={{ color: "var(--text-dim)" }}>
                · {FACTION_META[p.faction as Faction]?.icon ?? "❓"}{" "}
                {FACTION_META[p.faction as Faction]?.name ?? p.faction}
              </span>
            </li>
          ))}
        </ul>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
          <label>
            <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Шаблон</div>
            <select value={templateId} onChange={e => setTemplateId(e.target.value)} style={{ width: "100%" }}>
              {TEMPLATES.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Ваша фракция</div>
            <select value={faction} onChange={e => setHostFaction(e.target.value as Faction)} style={{ width: "100%" }}>
              {FACTION_LIST.map(f => (
                <option key={f} value={f}>
                  {FACTION_META[f].icon} {FACTION_META[f].name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={onBack}>← Отмена</button>
          <button onClick={start} disabled={!net.roomCode} style={{ flex: 1 }}>
            Начать игру ({net.lobby.length})
          </button>
        </div>
        {net.errorText && <div style={{ color: "var(--danger)", marginTop: 8 }}>{net.errorText}</div>}
      </div>
    </div>
  );
}

function JoinView({ onBack }: { onBack: () => void }) {
  const net = useNet();
  const [code, setCode] = useState("");
  const [faction, setFaction] = useState<Faction>("rampart");

  function sendFaction(f: Faction) {
    setFaction(f);
    useNet.getState().client?.send({ type: "setFaction", faction: f });
  }

  function connect() {
    if (!code.trim()) return;
    if (net.client) return;
    const client = new NetClient({
      onOpen: () => {
        useNet.getState().setStatus("lobby");
        useNet.getState().setRole("client");
        client.send({ type: "hello", name: useNet.getState().myName, faction });
      },
      onMessage: msg => {
        console.log("[net] client recv:", msg.type);
        // Лобби/assign — обрабатываем здесь же; state — общий путь.
        if (msg.type === "lobby") useNet.getState().setLobby(msg.players);
        else if (msg.type === "assign") {
          console.log("[net] client: assigned playerId=", msg.playerId);
          useNet.getState().setMyPlayerId(msg.playerId);
          useNet.getState().setRoomCode(msg.roomCode);
        } else if (msg.type === "start") {
          console.log("[net] client: start, myPlayerId=", useNet.getState().myPlayerId);
          useNet.getState().setStatus("in-game");
          // phase теперь локальный — клиент должен сам выйти из лобби в adventure.
          useGame.setState({ phase: "adventure" });
        } else {
          import("../net/sync").then(s => s.handleIncomingFromHost(msg));
        }
      },
      onDisconnect: () => {
        useNet.getState().setError("Соединение с хостом потеряно");
        useNet.getState().setStatus("error");
      },
      onError: err => {
        useNet.getState().setError(err.message);
        useNet.getState().setStatus("error");
      },
    });
    useNet.getState().setClient(client);
    useNet.getState().setStatus("connecting");
    client.connect(code.trim());
  }

  return (
    <div className="multiplayer-screen">
      <div className="mp-card">
        <h2 style={{ color: "var(--gold)", marginTop: 0 }}>🚪 Присоединиться</h2>
        {net.status === "idle" && (
          <>
            <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 8 }}>Введите код комнаты от хоста.</div>
            <input
              placeholder="код комнаты"
              value={code}
              onChange={e => setCode(e.target.value)}
              style={{ width: "100%", padding: 8, marginBottom: 8 }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={onBack}>← Назад</button>
              <button onClick={connect} style={{ flex: 1 }}>
                Подключиться
              </button>
            </div>
          </>
        )}
        {net.status === "connecting" && <div>Подключение…</div>}
        {net.status === "lobby" && (
          <>
            <h3 style={{ color: "var(--gold)" }}>В комнате</h3>
            <ul className="mp-lobby">
              {net.lobby.map(p => (
                <li key={p.peerId}>
                  {p.isHost ? "👑 " : "👤 "}
                  {p.name}
                  {p.peerId === net.myPeerId && <span style={{ color: "var(--text-dim)" }}> (вы)</span>}{" "}
                  <span style={{ color: "var(--text-dim)" }}>
                    · {FACTION_META[p.faction as Faction]?.icon ?? "❓"}{" "}
                    {FACTION_META[p.faction as Faction]?.name ?? p.faction}
                  </span>
                </li>
              ))}
            </ul>
            <label style={{ display: "block", marginTop: 8 }}>
              <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Ваша фракция</div>
              <select value={faction} onChange={e => sendFaction(e.target.value as Faction)} style={{ width: "100%" }}>
                {FACTION_LIST.map(f => (
                  <option key={f} value={f}>
                    {FACTION_META[f].icon} {FACTION_META[f].name}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ color: "var(--text-dim)", marginTop: 8 }}>Ожидаем, пока хост начнёт игру…</div>
            <div style={{ marginTop: 16 }}>
              <button onClick={onBack}>← Покинуть</button>
            </div>
          </>
        )}
        {net.status === "in-game" && (
          <>
            <h3 style={{ color: "var(--gold)" }}>Начинаем партию…</h3>
            <div style={{ color: "var(--text-dim)" }}>
              Ждём первое состояние от хоста. Если задержка больше нескольких секунд — попробуйте перезайти.
            </div>
          </>
        )}
        {net.status === "error" && (
          <>
            <div style={{ color: "var(--danger)" }}>{net.errorText ?? "Ошибка"}</div>
            <div style={{ marginTop: 16 }}>
              <button onClick={onBack}>← Назад</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
