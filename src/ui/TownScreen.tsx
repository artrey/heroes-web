import { useState } from "react";

import { FACTION_BUILDINGS, getBuilding, MAGE_GUILD_LEVEL } from "../game/data/buildings";
import { FACTION_META } from "../game/data/factions";
import { UNITS } from "../game/data/units";
import { useGame } from "../game/store";
import type { ArmySlotRef, ResourceBag } from "../game/types";
import { findFirstEmptySlot } from "../game/utils/army";
import { dailyIncomeFor } from "../game/utils/income";
import { canAfford, RESOURCE_ICONS, RESOURCE_NAMES } from "../game/utils/resources";
import { useMyPlayerId } from "../net/netStore";
import { SplitDialog } from "./SplitDialog";
import { MageGuildModal } from "./town/MageGuildModal";
import { MarketModal } from "./town/MarketModal";
import { TavernModal } from "./town/TavernModal";

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
  const splitStack = useGame(s => s.splitStack);

  const [openModal, setOpenModal] = useState<"tavern" | "marketplace" | "mageGuild" | null>(null);
  const [splitDialog, setSplitDialog] = useState<{ from: ArmySlotRef; to: ArmySlotRef } | null>(null);
  const activePlayerId = useGame(s => s.activePlayerId);
  const myPlayerId = useMyPlayerId();
  // canAct: я владелец города И сейчас мой ход. В SP myPlayerId=null — используем
  // прежнюю эвристику: владелец == активный игрок.
  const canAct = myPlayerId
    ? town?.ownerId === myPlayerId && activePlayerId === myPlayerId
    : town?.ownerId === activePlayerId;

  if (!town || !player) return null;

  const buildings = FACTION_BUILDINGS[town.faction];
  const heroHere = Object.values(heroes).find(h => h.pos.x === town.pos.x && h.pos.y === town.pos.y);

  const dwellings = buildings.filter(b => b.produces && town.built.includes(b.id));

  function handleBuildingClick(buildingId: string, canBuild: boolean, built: boolean) {
    if (built) {
      if (buildingId === "tavern") setOpenModal("tavern");
      else if (buildingId === "marketplace") setOpenModal("marketplace");
      else if (MAGE_GUILD_LEVEL[buildingId]) setOpenModal("mageGuild");
      return;
    }
    if (canBuild && canAct) buildBuilding(town!.id, buildingId);
  }

  return (
    <div className="town-screen">
      <div className="top-bar">
        <span className="day">
          {FACTION_META[town.faction].icon} {town.name}
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
              const canBuild = !built && prereqsOk && affordable && !town.builtToday && canAct;
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
              const interactive = built && (b.id === "tavern" || b.id === "marketplace" || !!MAGE_GUILD_LEVEL[b.id]);
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
                  <div className="bc-row1">
                    <span className="icon">{b.icon}</span>
                    <span className="bc-status">
                      {built ? (
                        <span style={{ color: "var(--good)" }}>✓ построено</span>
                      ) : !prereqsOk ? (
                        <span style={{ color: "var(--text-dim)" }}>🔒 требования</span>
                      ) : !affordable ? (
                        <span style={{ color: "var(--danger)" }}>💰 нет ресурсов</span>
                      ) : lockedByDay ? (
                        <span style={{ color: "var(--danger)" }}>🔒 сегодня</span>
                      ) : (
                        <span style={{ color: "var(--good)" }}>можно построить</span>
                      )}
                    </span>
                  </div>
                  <div className="name">{b.name}</div>
                  <div className="desc">{b.description}</div>
                  {!built && b.prereq && b.prereq.length > 0 && (
                    <div className="prereq">
                      Требуется: {b.prereq.map(p => getBuilding(town.faction, p)?.name ?? p).join(", ")}
                    </div>
                  )}
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
                        (+{town.built.includes("fort") ? Math.max(1, Math.round(unit.growth * 1.5)) : unit.growth}/нед
                        {town.built.includes("fort") ? " с фортом" : ""})
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                      Доступно: {avail} | Атк {unit.attack} / Защ {unit.defense} / HP {unit.hp} / Ск {unit.speed}
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
                    disabled={avail < 1 || !canBuyOne || !canAct}
                    onClick={() => hireUnits(town.id, unitId, 1)}
                    style={{ flex: 1 }}
                  >
                    ×1
                  </button>
                  <button
                    disabled={avail < 1 || !canBuyOne || !canAct}
                    onClick={() => hireUnits(town.id, unitId, avail)}
                    style={{ flex: 1 }}
                  >
                    ×{avail}
                  </button>
                </div>
              </div>
            );
          })}

          <h3 style={{ color: "var(--gold)", marginTop: 16 }}>
            Гарнизон{" "}
            <span style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: "normal" }}>
              {heroHere
                ? "· клик — передать герою, Shift+клик — разделить внутри гарнизона"
                : "· Shift+клик — разделить"}
            </span>
          </h3>
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
                  style={{ flex: 1, cursor: canAct ? "pointer" : "default" }}
                  onClick={ev => {
                    if (!canAct) return;
                    // Shift+клик — деление ВНУТРИ гарнизона (не переносит в героя).
                    if (ev.shiftKey) {
                      if (stack.count < 2) return;
                      const empty = findFirstEmptySlot(town.garrison);
                      if (empty == null) return;
                      setSplitDialog({
                        from: { kind: "garrison", townId: town.id, slot: idx },
                        to: { kind: "garrison", townId: town.id, slot: empty },
                      });
                      return;
                    }
                    // Обычный клик — передать весь стек герою (если он стоит в городе).
                    if (heroHere) garrisonToHero(town.id, idx);
                  }}
                  title={
                    canAct
                      ? heroHere
                        ? "Клик — передать герою · Shift+клик — разделить внутри гарнизона"
                        : "Shift+клик — разделить (герой не в городе)"
                      : "Не ваш ход"
                  }
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
                      style={{ flex: 1, cursor: canAct ? "pointer" : "default" }}
                      onClick={ev => {
                        if (!canAct) return;
                        // Shift+клик — деление ВНУТРИ армии героя (не переносит в гарнизон).
                        if (ev.shiftKey) {
                          if (stack.count < 2) return;
                          const empty = findFirstEmptySlot(heroHere.army);
                          if (empty == null) return;
                          setSplitDialog({
                            from: { kind: "hero", heroId: heroHere.id, slot: idx },
                            to: { kind: "hero", heroId: heroHere.id, slot: empty },
                          });
                          return;
                        }
                        heroToGarrison(heroHere.id, idx);
                      }}
                      title={canAct ? "Клик — в гарнизон · Shift+клик — разделить в армии героя" : "Не ваш ход"}
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
          townFaction={town.faction}
          onClose={() => setOpenModal(null)}
          onHire={protoId => {
            if (hireHero(town.id, protoId)) setOpenModal(null);
          }}
        />
      )}
      {openModal === "marketplace" && (
        <MarketModal
          resources={player.resources}
          onClose={() => setOpenModal(null)}
          onTrade={(from, to, qty) => tradeResource(town.id, from, to, qty) ?? false}
        />
      )}
      {openModal === "mageGuild" && (
        <MageGuildModal
          level={town.mageGuildLevel}
          spellIds={town.learnedSpells}
          heroHere={heroHere ? { name: heroHere.name, icon: heroHere.icon, knownSpells: heroHere.spells } : null}
          onClose={() => setOpenModal(null)}
        />
      )}
      {splitDialog &&
        (() => {
          // Достаём source/target стеки из текущего state (гарнизона или героя).
          const srcArmy = splitDialog.from.kind === "hero" ? heroes[splitDialog.from.heroId]?.army : town.garrison;
          const dstArmy = splitDialog.to.kind === "hero" ? heroes[splitDialog.to.heroId]?.army : town.garrison;
          if (!srcArmy || !dstArmy) return null;
          const srcStack = srcArmy[splitDialog.from.slot];
          if (!srcStack) return null;
          const dstStack = dstArmy[splitDialog.to.slot] ?? null;
          return (
            <SplitDialog
              fromUnitId={srcStack.unitId}
              fromCount={srcStack.count}
              toUnitId={dstStack?.unitId ?? null}
              toCount={dstStack?.count ?? 0}
              onCancel={() => setSplitDialog(null)}
              onConfirm={count => {
                splitStack(splitDialog.from, splitDialog.to, count);
                setSplitDialog(null);
              }}
            />
          );
        })()}
    </div>
  );
}
