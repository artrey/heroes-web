import { useState } from "react";

import { FACTION_META } from "../../game/data/factions";
import { pickHeroFromAnyOtherFaction, pickHeroProto } from "../../game/data/heroes";
import { UNITS } from "../../game/data/units";
import { HERO_HIRE_COST } from "../../game/state/initial";
import type { Faction } from "../../game/types";

// Таверна — найм героя. Двое кандидатов фиксируются один раз при открытии
// (re-roll = закрыть/открыть). Слева герой из родной фракции города, справа —
// иноземец, чтобы у игрока был выбор «специалист vs. универсал».
export function TavernModal({
  gold,
  townFaction,
  onHire,
  onClose,
}: {
  gold: number;
  townFaction: Faction;
  onHire: (protoId: string) => void;
  onClose: () => void;
}) {
  const cost = HERO_HIRE_COST.gold ?? 2500;
  const afford = gold >= cost;
  const [candidates] = useState(() => {
    const rng = Math.random;
    const local = pickHeroProto(townFaction, rng);
    const foreign = pickHeroFromAnyOtherFaction(townFaction, rng);
    return [local, foreign];
  });
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ minWidth: 520 }}>
        <h2 style={{ marginTop: 0, color: "var(--gold)" }}>🍺 Таверна</h2>
        <p style={{ color: "var(--text-dim)", marginTop: 0 }}>
          Двое странников ждут найма за {cost} 🪙. Слева — из вашей фракции, справа — иноземец.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
          {candidates.map((c, idx) => (
            <div
              key={c.id}
              style={{
                background: "var(--bg-2)",
                border: "1px solid var(--border)",
                padding: 12,
                borderRadius: 4,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
              }}
            >
              <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{idx === 0 ? "Местный" : "Иноземец"}</div>
              <div style={{ fontSize: 48, lineHeight: 1 }}>{c.icon}</div>
              <div style={{ fontWeight: "bold" }}>{c.name}</div>
              <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{FACTION_META[c.faction].name}</div>
              <div style={{ fontSize: 11, color: "var(--text-dim)", textAlign: "center" }}>
                {c.startingArmy.map(s => `${s.min}–${s.max} ${UNITS[s.unitId]?.name ?? s.unitId}`).join(", ")}
              </div>
              <button onClick={() => onHire(c.id)} disabled={!afford} style={{ width: "100%", marginTop: 6 }}>
                Нанять ({cost} 🪙)
              </button>
            </div>
          ))}
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
