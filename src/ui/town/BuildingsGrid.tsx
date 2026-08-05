import { FACTION_BUILDINGS, getBuilding, MAGE_GUILD_LEVEL } from "../../game/data/buildings";
import type { BuildingDef, Player, ResourceBag, Town } from "../../game/types";
import { canAfford } from "../../game/utils/resources";
import { ResourceIcon, UiIcon, UnitIcon } from "../gameArt";

// Сетка карточек построек города. Каждая карточка показывает статус (построено /
// требования / нет ресурсов / сегодня уже строили / можно). Клик отдаётся
// родителю — он сам решает, открывать ли модалку (для tavern/market/гильдии)
// или строить.
export function BuildingsGrid({
  town,
  player,
  canAct,
  onBuildingClick,
}: {
  town: Town;
  player: Player;
  canAct: boolean;
  // Родитель получает id здания + флаги: canBuild означает «требования ок, есть
  // ресурсы, нет лимита дня»; built — «уже построено».
  onBuildingClick: (buildingId: string, canBuild: boolean, built: boolean) => void;
}) {
  const buildings = FACTION_BUILDINGS[town.faction];
  return (
    <div className="buildings-grid">
      {buildings.map(b => (
        <BuildingCard key={b.id} town={town} player={player} canAct={canAct} def={b} onClick={onBuildingClick} />
      ))}
    </div>
  );
}

function BuildingCard({
  town,
  player,
  canAct,
  def,
  onClick,
}: {
  town: Town;
  player: Player;
  canAct: boolean;
  def: BuildingDef;
  onClick: (id: string, canBuild: boolean, built: boolean) => void;
}) {
  const built = town.built.includes(def.id);
  const prereqsOk = !def.prereq || def.prereq.every(p => town.built.includes(p));
  const affordable = canAfford(player.resources, def.cost);
  const canBuild = !built && prereqsOk && affordable && !town.builtToday && canAct;
  // Здание полностью доступно по prereq + ресурсам, но недоступно только из-за дневного лимита.
  const lockedByDay = !built && prereqsOk && affordable && town.builtToday;
  const cls = built ? "built" : !prereqsOk ? "locked" : !affordable ? "cant-afford" : lockedByDay ? "locked-today" : "";
  const interactive = built && (def.id === "tavern" || def.id === "marketplace" || !!MAGE_GUILD_LEVEL[def.id]);
  return (
    <div
      className={`building-card ${cls}`}
      style={interactive ? { cursor: "pointer" } : undefined}
      onClick={() => onClick(def.id, canBuild, built)}
      title={
        !prereqsOk
          ? `Требуется: ${def.prereq?.map(p => getBuilding(town.faction, p)?.name).join(", ")}`
          : lockedByDay
            ? "Сегодня уже строили в этом городе"
            : interactive
              ? "Открыть"
              : undefined
      }
    >
      <div className="bc-row1">
        {def.produces ? (
          <UnitIcon id={def.produces} size={42} className="icon" />
        ) : (
          <UiIcon
            name={def.id === "tavern" ? "tavern" : def.id === "marketplace" ? "market" : "town"}
            size={42}
            className="icon"
          />
        )}
        <span className="bc-status">
          {built ? (
            <span style={{ color: "var(--good)" }}>✓ построено</span>
          ) : !prereqsOk ? (
            <span style={{ color: "var(--text-dim)" }}>
              <UiIcon name="lock" size={15} /> требования
            </span>
          ) : !affordable ? (
            <span style={{ color: "var(--danger)" }}>
              <UiIcon name="treasury" size={15} /> нет ресурсов
            </span>
          ) : lockedByDay ? (
            <span style={{ color: "var(--danger)" }}>
              <UiIcon name="lock" size={15} /> сегодня
            </span>
          ) : (
            <span style={{ color: "var(--good)" }}>можно построить</span>
          )}
        </span>
      </div>
      <div className="name">{def.name}</div>
      <div className="desc">{def.description}</div>
      {!built && def.prereq && def.prereq.length > 0 && (
        <div className="prereq">
          Требуется: {def.prereq.map(p => getBuilding(town.faction, p)?.name ?? p).join(", ")}
        </div>
      )}
      {!built && (
        <div className="cost">
          {Object.entries(def.cost).map(([k, v]) => (
            <span key={k}>
              <ResourceIcon resource={k as keyof ResourceBag} size={16} /> {v}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
