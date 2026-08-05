import { UNITS } from "../../game/data/units";
import type { BuildingDef, Player, ResourceBag, Town } from "../../game/types";
import { canAfford } from "../../game/utils/resources";
import { ResourceIcon, UnitIcon } from "../gameArt";

// Карточка найма юнита из конкретного жилища. Содержит статы юнита, цену, прирост
// (с учётом форта), кнопки ×1 и ×N (всех доступных).
export function RecruitCard({
  town,
  player,
  dwelling,
  canAct,
  onHire,
}: {
  town: Town;
  player: Player;
  dwelling: BuildingDef;
  canAct: boolean;
  onHire: (unitId: string, count: number) => void;
}) {
  const unitId = dwelling.produces!;
  const unit = UNITS[unitId];
  const avail = town.availableUnits[unitId] ?? 0;
  const canBuyOne = canAfford(player.resources, unit.cost);
  const hasFort = town.built.includes("fort");
  const growth = hasFort ? Math.max(1, Math.round(unit.growth * 1.5)) : unit.growth;
  return (
    <div className="recruit-card">
      <div className="row">
        <UnitIcon id={unit.id} size={48} className="icon" />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: "bold" }}>
            {unit.name}{" "}
            <span style={{ color: "var(--text-dim)", fontWeight: "normal", fontSize: 12 }}>
              (+{growth}/нед{hasFort ? " с фортом" : ""})
            </span>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
            Доступно: {avail} | Атк {unit.attack} / Защ {unit.defense} / HP {unit.hp} / Ск {unit.speed}
          </div>
          <div style={{ fontSize: 11 }}>
            {Object.entries(unit.cost).map(([k, v]) => (
              <span key={k} style={{ marginRight: 6 }}>
                <ResourceIcon resource={k as keyof ResourceBag} size={16} /> {v}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
        <button disabled={avail < 1 || !canBuyOne || !canAct} onClick={() => onHire(unitId, 1)} style={{ flex: 1 }}>
          ×1
        </button>
        <button disabled={avail < 1 || !canBuyOne || !canAct} onClick={() => onHire(unitId, avail)} style={{ flex: 1 }}>
          ×{avail}
        </button>
      </div>
    </div>
  );
}
