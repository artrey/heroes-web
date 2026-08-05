import { useEffect, useState } from "react";

import { UNITS } from "../game/data/units";
import { UiIcon, UnitIcon } from "./gameArt";

// Универсальный диалог разделения отряда: показывает источник и цель, слайдер
// числа существ и кнопки min / -1 / +1 / max. Сторона target может быть пустой —
// тогда game store просто положит новый стек в первый свободный слот.
export function SplitDialog({
  fromUnitId,
  fromCount,
  toUnitId,
  toCount,
  initialCount,
  onCancel,
  onConfirm,
}: {
  fromUnitId: string;
  fromCount: number;
  // Если target — пустой слот, передавать null.
  toUnitId: string | null;
  toCount: number;
  initialCount?: number;
  onCancel: () => void;
  onConfirm: (count: number) => void;
}) {
  // По умолчанию делим пополам (округление вниз) — привычка HoMM3. Минимум 1,
  // максимум fromCount - 1 (нужно оставить хоть одного в источнике), либо ровно
  // fromCount, если можно перенести весь стек.
  // Слайдер ограничиваем строго [1; fromCount]: 0 — это «закрыть без действия»,
  // обрабатывается отдельной кнопкой «Отмена».
  const min = 1;
  const max = fromCount;
  const def = initialCount ?? Math.max(min, Math.floor(fromCount / 2));
  const [count, setCount] = useState(Math.min(max, Math.max(min, def)));

  // ESC закрывает.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
      else if (e.key === "Enter") onConfirm(Math.min(max, Math.max(min, count)));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count, max, min, onCancel, onConfirm]);

  const fromUnit = UNITS[fromUnitId];
  const toUnit = toUnitId ? UNITS[toUnitId] : null;
  const remaining = fromCount - count;
  const targetAfter = (toCount ?? 0) + count;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ minWidth: 380 }}>
        <h2 style={{ marginTop: 0, color: "var(--gold)" }}>Разделить отряд</h2>
        <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
          <SplitSide unitId={fromUnit?.id ?? null} name={fromUnit?.name ?? "?"} count={remaining} />
          <UiIcon name="transfer" size={30} />
          <SplitSide
            unitId={toUnit?.id ?? fromUnit?.id ?? null}
            name={toUnit?.name ?? fromUnit?.name ?? "(новый стек)"}
            count={targetAfter}
            emphasized
          />
        </div>
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setCount(min)} title="К минимуму">
            «
          </button>
          <button onClick={() => setCount(c => Math.max(min, c - 1))} title="−1">
            −
          </button>
          <input
            type="range"
            min={min}
            max={max}
            value={count}
            onChange={e => setCount(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <button onClick={() => setCount(c => Math.min(max, c + 1))} title="+1">
            +
          </button>
          <button onClick={() => setCount(max)} title="К максимуму">
            »
          </button>
        </div>
        <div style={{ marginTop: 8, fontSize: 13, color: "var(--text-dim)", textAlign: "center" }}>
          Перенести: <span style={{ color: "var(--gold)" }}>{count}</span> из {fromCount}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button onClick={onCancel} style={{ flex: 1 }}>
            Отмена (ESC)
          </button>
          <button onClick={() => onConfirm(count)} style={{ flex: 1 }} title="Подтвердить (Enter)">
            Принять (↵)
          </button>
        </div>
      </div>
    </div>
  );
}

function SplitSide({
  unitId,
  name,
  count,
  emphasized,
}: {
  unitId: string | null;
  name: string;
  count: number;
  emphasized?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        minWidth: 110,
        padding: 8,
        background: "var(--bg-2)",
        border: `1px solid ${emphasized ? "var(--gold)" : "var(--border)"}`,
        borderRadius: 4,
      }}
    >
      {unitId ? <UnitIcon id={unitId} size={54} /> : <UiIcon name="unknown" size={54} />}
      <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{name}</span>
      <span style={{ fontSize: 18, color: "var(--gold)", marginTop: 4 }}>{count}</span>
    </div>
  );
}
