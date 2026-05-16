import { useState } from "react";

import { FACTION_BUILDINGS, getBuilding } from "../game/data/buildings";
import { UNITS } from "../game/data/units";
import { useGame } from "../game/store";
import type { ResourceBag } from "../game/types";
import { canAfford, RESOURCE_ICONS, RESOURCE_NAMES } from "../game/utils/resources";

const HERO_HIRE_GOLD = 2500;

export function TownScreen() {
  const townId = useGame(s => s.selectedTownId);
  const town = useGame(s => (townId ? s.towns[townId] : null));
  const player = useGame(s => (town?.ownerId ? s.players[town.ownerId] : null));
  const closeTown = useGame(s => s.closeTown);
  const buildBuilding = useGame(s => s.buildBuilding);
  const hireUnits = useGame(s => s.hireUnits);
  const hireHero = useGame(s => s.hireHero);
  const garrisonToHero = useGame(s => s.garrisonToHero);
  const heroes = useGame(s => s.heroes);
  const heroToGarrison = useGame(s => s.heroToGarrison);

  const [openModal, setOpenModal] = useState<"tavern" | null>(null);

  if (!town || !player) return null;

  const buildings = FACTION_BUILDINGS[town.faction];
  const heroHere = Object.values(heroes).find(h => h.pos.x === town.pos.x && h.pos.y === town.pos.y);

  const dwellings = buildings.filter(b => b.produces && town.built.includes(b.id));

  function handleBuildingClick(buildingId: string, canBuild: boolean, built: boolean) {
    if (built) {
      // Interactive built building.
      if (buildingId === "tavern") setOpenModal("tavern");
      return;
    }
    if (canBuild) buildBuilding(town!.id, buildingId);
  }

  return (
    <div className="town-screen">
      <div className="top-bar">
        <span className="day">
          {town.faction === "castle" ? "🏰" : "🏯"} {town.name}
        </span>
        <div className="res-bar">
          {(Object.keys(player.resources) as Array<keyof ResourceBag>).map(k => (
            <div className="res-item" key={k} title={RESOURCE_NAMES[k]}>
              <span>{RESOURCE_ICONS[k]}</span>
              <span>{player.resources[k]}</span>
            </div>
          ))}
        </div>
        <button onClick={closeTown}>← На карту</button>
      </div>

      <div className="town-content">
        <div className="town-main">
          <h1 className="town-title">Постройки</h1>
          <div className="buildings-grid">
            {buildings.map(b => {
              const built = town.built.includes(b.id);
              const prereqsOk = !b.prereq || b.prereq.every(p => town.built.includes(p));
              const affordable = canAfford(player.resources, b.cost);
              const canBuild = !built && prereqsOk && affordable && !town.builtToday;
              const cls = built ? "built" : !prereqsOk ? "locked" : !affordable ? "cant-afford" : "";
              const interactive = built && b.id === "tavern";
              return (
                <div
                  key={b.id}
                  className={`building-card ${cls}`}
                  style={interactive ? { cursor: "pointer" } : undefined}
                  onClick={() => handleBuildingClick(b.id, canBuild, built)}
                  title={
                    !prereqsOk
                      ? `Требуется: ${b.prereq?.map(p => getBuilding(town.faction, p)?.name).join(", ")}`
                      : interactive
                        ? "Открыть"
                        : undefined
                  }
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="icon">{b.icon}</span>
                    <div className="name">{b.name}</div>
                    {built && <span style={{ marginLeft: "auto", color: "var(--good)" }}>✓</span>}
                  </div>
                  <div className="desc">{b.description}</div>
                  {!built && (
                    <div className="cost">
                      {Object.entries(b.cost).map(([k, v]) => (
                        <span key={k}>
                          {RESOURCE_ICONS[k as keyof ResourceBag]} {v}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="town-sidebar">
          <h3 style={{ marginTop: 0, color: "var(--gold)" }}>Найм</h3>
          {dwellings.length === 0 && <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Постройте жилища.</div>}
          {dwellings.map(b => {
            const unitId = b.produces!;
            const unit = UNITS[unitId];
            const avail = town.availableUnits[unitId] ?? 0;
            const canBuyOne = canAfford(player.resources, unit.cost);
            return (
              <div className="recruit-card" key={b.id}>
                <div className="row">
                  <span className="icon">{unit.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: "bold" }}>{unit.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                      Доступно: {avail} | Атк {unit.attack} / Защ {unit.defense} / HP {unit.hp}
                    </div>
                    <div style={{ fontSize: 11 }}>
                      {Object.entries(unit.cost).map(([k, v]) => (
                        <span key={k} style={{ marginRight: 6 }}>
                          {RESOURCE_ICONS[k as keyof ResourceBag]} {v}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                  <button
                    disabled={avail < 1 || !canBuyOne}
                    onClick={() => hireUnits(town.id, unitId, 1)}
                    style={{ flex: 1 }}
                  >
                    ×1
                  </button>
                  <button
                    disabled={avail < 1 || !canBuyOne}
                    onClick={() => hireUnits(town.id, unitId, avail)}
                    style={{ flex: 1 }}
                  >
                    ×{avail}
                  </button>
                </div>
              </div>
            );
          })}

          <h3 style={{ color: "var(--gold)", marginTop: 16 }}>Гарнизон</h3>
          <div style={{ display: "flex", gap: 4 }}>
            {Array.from({ length: 7 }).map((_, idx) => {
              const stack = town.garrison[idx];
              if (!stack)
                return (
                  <div key={idx} className="army-slot empty" style={{ flex: 1 }}>
                    —
                  </div>
                );
              const u = UNITS[stack.unitId];
              return (
                <div
                  key={idx}
                  className="army-slot"
                  style={{ flex: 1, cursor: heroHere ? "pointer" : "default" }}
                  onClick={() => heroHere && garrisonToHero(town.id, idx)}
                  title={heroHere ? "Передать герою" : ""}
                >
                  <span className="icon">{u.icon}</span>
                  <span>{stack.count}</span>
                </div>
              );
            })}
          </div>

          {heroHere && (
            <>
              <h3 style={{ color: "var(--gold)", marginTop: 16 }}>Герой в городе</h3>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 28 }}>{heroHere.icon}</span>
                <div>{heroHere.name}</div>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                {Array.from({ length: 7 }).map((_, idx) => {
                  const stack = heroHere.army[idx];
                  if (!stack)
                    return (
                      <div key={idx} className="army-slot empty" style={{ flex: 1 }}>
                        —
                      </div>
                    );
                  const u = UNITS[stack.unitId];
                  return (
                    <div
                      key={idx}
                      className="army-slot"
                      style={{ flex: 1, cursor: "pointer" }}
                      onClick={() => heroToGarrison(heroHere.id, idx)}
                      title="В гарнизон"
                    >
                      <span className="icon">{u.icon}</span>
                      <span>{stack.count}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {openModal === "tavern" && (
        <TavernModal
          gold={player.resources.gold}
          onClose={() => setOpenModal(null)}
          onHire={() => {
            if (hireHero(town.id)) setOpenModal(null);
          }}
        />
      )}
    </div>
  );
}

function TavernModal({ gold, onHire, onClose }: { gold: number; onHire: () => void; onClose: () => void }) {
  const afford = gold >= HERO_HIRE_GOLD;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2 style={{ marginTop: 0, color: "var(--gold)" }}>🍺 Таверна</h2>
        <p style={{ color: "var(--text-dim)" }}>
          За {HERO_HIRE_GOLD} золота можно нанять нового героя со стартовой армией. Появится в городе или рядом с ним.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={{ flex: 1 }}>
            Отмена
          </button>
          <button onClick={onHire} disabled={!afford} style={{ flex: 2 }}>
            Нанять героя ({HERO_HIRE_GOLD} 🪙)
          </button>
        </div>
      </div>
    </div>
  );
}
