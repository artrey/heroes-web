import { FACTION_META } from "../game/data/factions";
import type { GameMap, Player } from "../game/types";

export function PlayersInfoModal({
  map,
  players,
  playerOrder,
  activePlayerId,
  myPlayerId,
  day,
  week,
  month,
  onClose,
}: {
  map: GameMap;
  players: Record<string, Player>;
  playerOrder: string[];
  activePlayerId: string;
  myPlayerId: string | null;
  day: number;
  week: number;
  month: number;
  onClose: () => void;
}) {
  const ordered = playerOrder.map(id => players[id]).filter(Boolean);
  const alive = ordered.filter(p => !p.defeated).length;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ minWidth: 460, maxWidth: 560 }}>
        <h2 style={{ marginTop: 0, color: "var(--gold)" }}>🗺 Карта и игроки</h2>
        <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--text-dim)", marginBottom: 12 }}>
          <span>
            Размер:{" "}
            <b style={{ color: "var(--text)" }}>
              {map.width}×{map.height}
            </b>
          </span>
          <span>
            День:{" "}
            <b style={{ color: "var(--text)" }}>
              М{month} · Н{((week - 1) % 4) + 1} · Д{((day - 1) % 7) + 1}
            </b>
          </span>
          <span>
            В игре:{" "}
            <b style={{ color: "var(--good)" }}>
              {alive}/{ordered.length}
            </b>
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {ordered.map(p => {
            const fac = FACTION_META[p.faction];
            const isActive = p.id === activePlayerId;
            const isMe = p.id === myPlayerId;
            return (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 10px",
                  background: "var(--bg-2)",
                  border: `1px solid ${isActive ? "var(--gold)" : "var(--border)"}`,
                  borderRadius: 3,
                  opacity: p.defeated ? 0.55 : 1,
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    background: p.color,
                    boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
                  }}
                />
                <span style={{ fontSize: 18 }}>{fac.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: "bold", textDecoration: p.defeated ? "line-through" : "none" }}>
                    {p.name}
                    {isMe && <span style={{ color: "var(--gold)", marginLeft: 6, fontSize: 11 }}>(вы)</span>}
                    {isActive && !p.defeated && (
                      <span style={{ color: "var(--accent)", marginLeft: 6, fontSize: 11 }}>● ход</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                    {fac.name} · {p.isHuman ? "Человек" : "ИИ"}
                    {isMe && (
                      <>
                        {" · "}🛡 {p.heroIds.length} · 🏰 {p.townIds.length}
                      </>
                    )}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    padding: "2px 8px",
                    borderRadius: 3,
                    background: p.defeated ? "rgba(180,60,60,0.18)" : "rgba(110,180,80,0.18)",
                    color: p.defeated ? "var(--danger)" : "var(--good)",
                    border: `1px solid ${p.defeated ? "var(--danger)" : "var(--good)"}`,
                  }}
                >
                  {p.defeated ? "выбыл" : "в игре"}
                </span>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={{ flex: 1 }}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
