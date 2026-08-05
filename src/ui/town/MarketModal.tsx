import { useState } from "react";

import { reverseRate } from "../../game/data/marketRates";
import type { Resource, ResourceBag } from "../../game/types";
import { RESOURCE_NAMES } from "../../game/utils/resources";
import { ResourceIcon, UiIcon } from "../gameArt";

const RESOURCE_LIST: Resource[] = ["gold", "wood", "ore", "mercury", "sulfur", "crystal", "gems"];

// Рынок — обмен ресурсов по курсу из marketRates. Курсы асимметричные: сырьё
// дешевле редких. Trade-функция передаётся снаружи и сама дёргает store action.
export function MarketModal({
  resources,
  onClose,
  onTrade,
}: {
  resources: ResourceBag;
  onClose: () => void;
  onTrade: (from: Resource, to: Resource, qty: number) => boolean;
}) {
  const [from, setFrom] = useState<Resource>("wood");
  const [to, setTo] = useState<Resource>("gold");
  const [qty, setQty] = useState(1);

  const have = resources[from] ?? 0;
  const safeQty = Math.max(0, Math.min(qty, have));
  const willGet = from === to ? 0 : reverseRate(from, to, safeQty);
  const canDo = safeQty > 0 && willGet > 0 && from !== to;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ minWidth: 460 }}>
        <h2 style={{ marginTop: 0, color: "var(--gold)" }}>
          <UiIcon name="market" size={28} /> Рынок
        </h2>
        <p style={{ color: "var(--text-dim)", marginTop: 0 }}>
          Обмен ресурсов. Курс зависит от типа: сырьё (дерево/руда) дешевле редкого (ртуть/сера/кристаллы/самоцветы).
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 4 }}>Отдать</div>
            <select value={from} onChange={e => setFrom(e.target.value as Resource)} style={{ width: "100%" }}>
              {RESOURCE_LIST.map(r => (
                <option key={r} value={r}>
                  {RESOURCE_NAMES[r]} (есть {resources[r]})
                </option>
              ))}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 4 }}>Получить</div>
            <select value={to} onChange={e => setTo(e.target.value as Resource)} style={{ width: "100%" }}>
              {RESOURCE_LIST.map(r => (
                <option key={r} value={r}>
                  {RESOURCE_NAMES[r]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ color: "var(--text-dim)", fontSize: 13 }}>Кол-во:</label>
          <input
            type="number"
            min={0}
            max={have}
            value={qty}
            onChange={e => setQty(Math.max(0, Number(e.target.value) || 0))}
            style={{ width: 100 }}
          />
          <button onClick={() => setQty(have)}>Всё</button>
          <div style={{ marginLeft: "auto", fontSize: 13, color: canDo ? "var(--good)" : "var(--text-dim)" }}>
            → получите <b>{willGet}</b> <ResourceIcon resource={to} size={20} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={{ flex: 1 }}>
            Закрыть
          </button>
          <button
            onClick={() => {
              if (onTrade(from, to, safeQty)) setQty(0);
            }}
            disabled={!canDo}
            style={{ flex: 2 }}
          >
            Обменять
          </button>
        </div>
      </div>
    </div>
  );
}
