import { useState } from "react";

import { FACTION_BUILDINGS, getBuilding, MAGE_GUILD_LEVEL } from "../game/data/buildings";
import { FACTION_META } from "../game/data/factions";
import { pickHeroFromAnyOtherFaction, pickHeroProto } from "../game/data/heroes";
import { reverseRate } from "../game/data/marketRates";
import { getSpell } from "../game/data/spells";
import { UNITS } from "../game/data/units";
import { useGame } from "../game/store";
import type { Faction, Resource, ResourceBag } from "../game/types";
import { dailyIncomeFor } from "../game/utils/income";
import { canAfford, RESOURCE_ICONS, RESOURCE_NAMES } from "../game/utils/resources";
import { useMyPlayerId } from "../net/netStore";

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

  const [openModal, setOpenModal] = useState<"tavern" | "marketplace" | "mageGuild" | null>(null);
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
                  style={{ flex: 1, cursor: heroHere && canAct ? "pointer" : "default" }}
                  onClick={() => heroHere && canAct && garrisonToHero(town.id, idx)}
                  title={heroHere ? (canAct ? "Передать герою" : "Не ваш ход") : ""}
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
                      onClick={() => canAct && heroToGarrison(heroHere.id, idx)}
                      title={canAct ? "В гарнизон" : "Не ваш ход"}
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
    </div>
  );
}

function TavernModal({
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
  const afford = gold >= HERO_HIRE_GOLD;
  // Двое кандидатов: один точно из родной фракции, второй — из любой другой.
  // Генерируется один раз при открытии (re-roll — закрыть и открыть таверну заново).
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
          Двое странников ждут найма за {HERO_HIRE_GOLD} 🪙. Слева — из вашей фракции, справа — иноземец.
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
                Нанять ({HERO_HIRE_GOLD} 🪙)
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

function MageGuildModal({
  level,
  spellIds,
  heroHere,
  onClose,
}: {
  level: number;
  spellIds: string[];
  heroHere: { name: string; icon: string; knownSpells: string[] } | null;
  onClose: () => void;
}) {
  // Группируем заклинания по уровню.
  const byLevel = new Map<number, string[]>();
  for (const id of spellIds) {
    const sp = getSpell(id);
    if (!sp) continue;
    const arr = byLevel.get(sp.level) ?? [];
    arr.push(id);
    byLevel.set(sp.level, arr);
  }
  const known = new Set(heroHere?.knownSpells ?? []);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ minWidth: 520 }}>
        <h2 style={{ marginTop: 0, color: "var(--gold)" }}>📖 Гильдия магов — уровень {level}</h2>
        <p style={{ color: "var(--text-dim)", marginTop: 0 }}>
          Здесь обучают магии. Герой, заходящий в город, автоматически изучает все доступные заклинания и пополняет
          ману.
        </p>
        {heroHere && (
          <div style={{ marginBottom: 8, fontSize: 13 }}>
            <span style={{ fontSize: 22, marginRight: 6 }}>{heroHere.icon}</span>
            <b>{heroHere.name}</b> сейчас в городе и автоматически изучает все заклинания.
          </div>
        )}
        {[1, 2, 3].map(lvl => {
          const ids = byLevel.get(lvl);
          if (!ids || ids.length === 0) return null;
          return (
            <div key={lvl} style={{ marginTop: 10 }}>
              <div style={{ color: "var(--text-dim)", fontSize: 12, marginBottom: 4 }}>Уровень {lvl}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
                {ids.map(id => {
                  const sp = getSpell(id)!;
                  const has = known.has(id);
                  return (
                    <div
                      key={id}
                      title={sp.description}
                      style={{
                        background: "var(--bg-0)",
                        border: "2px solid var(--border)",
                        borderRadius: 3,
                        padding: 8,
                        opacity: has ? 1 : 0.85,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 22 }}>{sp.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: "bold", fontSize: 13 }}>{sp.name}</div>
                          <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                            💧 {sp.manaCost} · {has ? "уже изучено" : "будет изучено"}
                          </div>
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>{sp.description}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={{ flex: 1 }}>
            Закрыть
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
