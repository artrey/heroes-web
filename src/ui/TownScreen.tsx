import { useState } from "react";

import { FACTION_BUILDINGS, getBuilding } from "../game/data/buildings";
import { reverseRate } from "../game/data/marketRates";
import { UNITS } from "../game/data/units";
import { useGame } from "../game/store";
import type { Resource, ResourceBag } from "../game/types";
import { dailyIncomeFor } from "../game/utils/income";
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
  const tradeResource = useGame(s => s.tradeResource);
  const garrisonToHero = useGame(s => s.garrisonToHero);
  const heroes = useGame(s => s.heroes);
  const heroToGarrison = useGame(s => s.heroToGarrison);

  const [openModal, setOpenModal] = useState<"tavern" | "marketplace" | null>(null);

  if (!town || !player) return null;

  const buildings = FACTION_BUILDINGS[town.faction];
  const heroHere = Object.values(heroes).find(h => h.pos.x === town.pos.x && h.pos.y === town.pos.y);

  const dwellings = buildings.filter(b => b.produces && town.built.includes(b.id));

  function handleBuildingClick(buildingId: string, canBuild: boolean, built: boolean) {
    if (built) {
      if (buildingId === "tavern") setOpenModal("tavern");
      else if (buildingId === "marketplace") setOpenModal("marketplace");
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
          {(Object.keys(player.resources) as Array<keyof ResourceBag>).map(k => {
            const inc = dailyIncomeFor(useGame.getState(), player.id)[k];
            return (
              <div className="res-item" key={k} title={`${RESOURCE_NAMES[k]}${inc ? ` · +${inc}/день` : ""}`}>
                <span>{RESOURCE_ICONS[k]}</span>
                <span>{player.resources[k]}</span>
                {inc > 0 && <span style={{ color: "var(--good)", fontSize: 11, marginLeft: 2 }}>(+{inc})</span>}
              </div>
            );
          })}
        </div>
        <button onClick={closeTown}>← На карту</button>
      </div>

      <div className="town-content">
        <div className="town-main">
          <h1 className="town-title">Постройки</h1>
          <div className={`build-status ${town.builtToday ? "done" : "ready"}`}>
            {town.builtToday ? (
              <>
                <span className="build-status-icon">🔒</span>
                <div>
                  <div className="build-status-title">Сегодня вы уже построили здание</div>
                  <div className="build-status-sub">Следующая постройка станет доступна завтра.</div>
                </div>
              </>
            ) : (
              <>
                <span className="build-status-icon">🔨</span>
                <div>
                  <div className="build-status-title">Доступна постройка на сегодня</div>
                  <div className="build-status-sub">Выберите одно здание — на день будет израсходован лимит.</div>
                </div>
              </>
            )}
          </div>
          <div className="buildings-grid">
            {buildings.map(b => {
              const built = town.built.includes(b.id);
              const prereqsOk = !b.prereq || b.prereq.every(p => town.built.includes(p));
              const affordable = canAfford(player.resources, b.cost);
              const canBuild = !built && prereqsOk && affordable && !town.builtToday;
              // Здание полностью доступно по prereq + ресурсам, но недоступно только из-за дневного лимита.
              const lockedByDay = !built && prereqsOk && affordable && town.builtToday;
              const cls = built
                ? "built"
                : !prereqsOk
                  ? "locked"
                  : !affordable
                    ? "cant-afford"
                    : lockedByDay
                      ? "locked-today"
                      : "";
              const interactive = built && (b.id === "tavern" || b.id === "marketplace");
              return (
                <div
                  key={b.id}
                  className={`building-card ${cls}`}
                  style={interactive ? { cursor: "pointer" } : undefined}
                  onClick={() => handleBuildingClick(b.id, canBuild, built)}
                  title={
                    !prereqsOk
                      ? `Требуется: ${b.prereq?.map(p => getBuilding(town.faction, p)?.name).join(", ")}`
                      : lockedByDay
                        ? "Сегодня уже строили в этом городе"
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
                    <div style={{ fontWeight: "bold" }}>
                      {unit.name}{" "}
                      <span style={{ color: "var(--text-dim)", fontWeight: "normal", fontSize: 12 }}>
                        (+{unit.growth}/нед)
                      </span>
                    </div>
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
      {openModal === "marketplace" && (
        <MarketModal
          resources={player.resources}
          onClose={() => setOpenModal(null)}
          onTrade={(from, to, qty) => tradeResource(town.id, from, to, qty)}
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

const RESOURCE_LIST: Resource[] = ["gold", "wood", "ore", "mercury", "sulfur", "crystal", "gems"];

function MarketModal({
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
        <h2 style={{ marginTop: 0, color: "var(--gold)" }}>🏪 Рынок</h2>
        <p style={{ color: "var(--text-dim)", marginTop: 0 }}>
          Обмен ресурсов. Курс зависит от типа: сырьё (дерево/руда) дешевле редкого (ртуть/сера/кристаллы/самоцветы).
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 4 }}>Отдать</div>
            <select value={from} onChange={e => setFrom(e.target.value as Resource)} style={{ width: "100%" }}>
              {RESOURCE_LIST.map(r => (
                <option key={r} value={r}>
                  {RESOURCE_ICONS[r]} {RESOURCE_NAMES[r]} (есть {resources[r]})
                </option>
              ))}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 4 }}>Получить</div>
            <select value={to} onChange={e => setTo(e.target.value as Resource)} style={{ width: "100%" }}>
              {RESOURCE_LIST.map(r => (
                <option key={r} value={r}>
                  {RESOURCE_ICONS[r]} {RESOURCE_NAMES[r]}
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
            → получите <b>{willGet}</b> {RESOURCE_ICONS[to]}
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
