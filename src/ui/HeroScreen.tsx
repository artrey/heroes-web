import { useState } from "react";

import { ARTIFACTS, RARITY_COLOR, SLOT_ICON, SLOT_LABEL } from "../game/data/artifacts";
import { FACTION_META } from "../game/data/factions";
import { getSpell } from "../game/data/spells";
import { UNITS } from "../game/data/units";
import { useGame } from "../game/store";
import type { ArtifactSlot } from "../game/types";
import { ARTIFACT_SLOT_ORDER } from "../game/types";
import {
  getEffectiveKnowledge,
  getEffectiveMaxMana,
  getEffectiveMaxMP,
  getEffectiveSpellPower,
  getHeroBonus,
} from "../game/utils/heroBonus";
import { xpToNextLevel } from "../game/utils/leveling";

type Selected =
  | { kind: "army"; slot: number }
  | { kind: "equipped"; slot: ArtifactSlot }
  | { kind: "backpack"; idx: number }
  | null;

export function HeroScreen() {
  const id = useGame(s => s.selectedHeroId);
  const hero = useGame(s => (id ? s.heroes[id] : null));
  const close = useGame(s => s.closeHero);
  const swapArmySlots = useGame(s => s.swapArmySlots);
  const equipFromBackpack = useGame(s => s.equipFromBackpack);
  const unequipToBackpack = useGame(s => s.unequipToBackpack);

  const [selected, setSelected] = useState<Selected>(null);

  if (!hero) return null;
  const bonus = getHeroBonus(hero);
  const effMaxMP = getEffectiveMaxMP(hero);
  const effSpellPower = getEffectiveSpellPower(hero);
  const effKnowledge = getEffectiveKnowledge(hero);
  const effMaxMana = getEffectiveMaxMana(hero);

  function clickArmy(slot: number) {
    if (!hero) return;
    if (!selected) {
      if (hero.army[slot]) setSelected({ kind: "army", slot });
      return;
    }
    if (selected.kind !== "army") {
      setSelected(null);
      return;
    }
    swapArmySlots(hero.id, selected.slot, hero.id, slot);
    setSelected(null);
  }

  function clickEquipped(slot: ArtifactSlot) {
    if (!hero) return;
    if (!selected) {
      if (hero.artifacts.equipped[slot]) setSelected({ kind: "equipped", slot });
      return;
    }
    if (selected.kind === "backpack") {
      const sourceArt = ARTIFACTS[hero.artifacts.backpack[selected.idx]];
      if (sourceArt && sourceArt.slot === slot) equipFromBackpack(hero.id, selected.idx);
    }
    setSelected(null);
  }

  function clickBackpack(idx: number) {
    if (!hero) return;
    if (!selected) {
      if (hero.artifacts.backpack[idx]) setSelected({ kind: "backpack", idx });
      return;
    }
    if (selected.kind === "equipped") unequipToBackpack(hero.id, selected.slot);
    setSelected(null);
  }

  return (
    <div className="hero-screen">
      <div className="top-bar">
        <span className="day" style={{ color: "var(--gold)" }}>
          {hero.icon} {hero.name}
        </span>
        <button style={{ marginLeft: "auto" }} onClick={close}>
          ← На карту
        </button>
      </div>

      <div className="hero-body">
        <div className="hero-side">
          <div style={{ fontSize: 96, textAlign: "center", marginBottom: 12 }}>{hero.icon}</div>
          <h2 style={{ color: "var(--gold)", textAlign: "center", margin: "0 0 4px" }}>{hero.name}</h2>
          <div style={{ textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>
            {FACTION_META[hero.faction].name} · Уровень {hero.level}
          </div>
          <div style={{ marginTop: 14, fontSize: 13 }}>
            <div className="stat-row">
              <span>⚡ Очки движения</span>
              <span>
                {hero.movePoints} / {effMaxMP} MP
              </span>
            </div>
            <div className="stat-row">
              <span>⭐ Опыт</span>
              <span>
                {hero.xp} (до ур. {hero.level + 1}: {xpToNextLevel(hero.xp)})
              </span>
            </div>
            <div className="stat-row">
              <span>⚔️ База атаки (от уровней)</span>
              <span>+{hero.statBonus.attack}</span>
            </div>
            <div className="stat-row">
              <span>🛡️ База защиты (от уровней)</span>
              <span>+{hero.statBonus.defense}</span>
            </div>
            <div className="stat-row" title="База + бонусы от артефактов">
              <span>🔮 Сила магии</span>
              <span>
                {effSpellPower}
                {effSpellPower !== hero.spellPower && (
                  <span style={{ color: "var(--text-dim)", marginLeft: 4 }}>(база {hero.spellPower})</span>
                )}
              </span>
            </div>
            <div className="stat-row" title="База + бонусы от артефактов">
              <span>📚 Знания</span>
              <span>
                {effKnowledge}
                {effKnowledge !== hero.knowledge && (
                  <span style={{ color: "var(--text-dim)", marginLeft: 4 }}>(база {hero.knowledge})</span>
                )}
              </span>
            </div>
            <div className="stat-row">
              <span>💧 Мана</span>
              <span>
                {hero.mana} / {effMaxMana}
              </span>
            </div>
            <div className="stat-row" style={{ borderTop: "1px solid var(--border)", paddingTop: 8, marginTop: 8 }}>
              <span style={{ color: "var(--text-dim)" }}>Бонусы от экипировки:</span>
            </div>
            {(() => {
              // Бонусы от экипировки = общий бонус минус прирост от уровней (он уже показан выше).
              const gear = {
                attack: bonus.attack - hero.statBonus.attack,
                defense: bonus.defense - hero.statBonus.defense,
                speed: bonus.speed,
                hpBonus: bonus.hpBonus,
                movement: bonus.movement,
                spellPower: bonus.spellPower,
                knowledge: bonus.knowledge,
                manaMult: bonus.manaMult,
              };
              const total =
                gear.attack +
                gear.defense +
                gear.speed +
                gear.hpBonus +
                gear.movement +
                gear.spellPower +
                gear.knowledge +
                gear.manaMult;
              return (
                <>
                  {gear.attack ? <BonusRow label="⚔️ Атака" value={`+${gear.attack}`} /> : null}
                  {gear.defense ? <BonusRow label="🛡️ Защита" value={`+${gear.defense}`} /> : null}
                  {gear.speed ? <BonusRow label="🏃 Скорость" value={`+${gear.speed}`} /> : null}
                  {gear.hpBonus ? <BonusRow label="❤️ HP" value={`+${gear.hpBonus}`} /> : null}
                  {gear.movement ? <BonusRow label="🥾 Доп. MP" value={`+${gear.movement}`} /> : null}
                  {gear.spellPower ? <BonusRow label="🔮 Сила магии" value={`+${gear.spellPower}`} /> : null}
                  {gear.knowledge ? <BonusRow label="📚 Знания" value={`+${gear.knowledge}`} /> : null}
                  {gear.manaMult ? <BonusRow label="💧 Макс. мана" value={`+${gear.manaMult}%`} /> : null}
                  {total === 0 && <div style={{ fontSize: 12, color: "var(--text-dim)", fontStyle: "italic" }}>—</div>}
                </>
              );
            })()}
          </div>
        </div>

        <div className="hero-main">
          <h3 style={{ color: "var(--gold)", margin: "0 0 8px" }}>Армия</h3>
          <div className="hero-army">
            {Array.from({ length: 7 }).map((_, slot) => {
              const stack = hero.army[slot];
              const isSel = selected?.kind === "army" && selected.slot === slot;
              if (!stack)
                return (
                  <div key={slot} className={`army-slot empty ${isSel ? "sel" : ""}`} onClick={() => clickArmy(slot)}>
                    —
                  </div>
                );
              const u = UNITS[stack.unitId];
              return (
                <div
                  key={slot}
                  className={`army-slot ${isSel ? "sel" : ""}`}
                  onClick={() => clickArmy(slot)}
                  title={`${u.name}: атк ${u.attack + bonus.attack}, защ ${u.defense + bonus.defense}, HP ${u.hp + bonus.hpBonus}, скор ${u.speed + bonus.speed}`}
                >
                  <span className="icon">{u.icon}</span>
                  <span>{stack.count}</span>
                </div>
              );
            })}
          </div>

          <h3 style={{ color: "var(--gold)", margin: "20px 0 8px" }}>Экипировка</h3>
          <div className="equipped-grid">
            {ARTIFACT_SLOT_ORDER.map(slot => {
              const artId = hero.artifacts.equipped[slot];
              const def = artId ? ARTIFACTS[artId] : null;
              const isSel = selected?.kind === "equipped" && selected.slot === slot;
              return (
                <div
                  key={slot}
                  className={`equip-slot ${def ? "filled" : "empty"} ${isSel ? "sel" : ""}`}
                  style={def ? { borderColor: RARITY_COLOR[def.rarity] } : undefined}
                  onClick={() => clickEquipped(slot)}
                  title={def ? `${def.name} — ${def.description}` : `${SLOT_LABEL[slot]} (пусто)`}
                >
                  <span className="slot-icon">{def ? def.icon : SLOT_ICON[slot]}</span>
                  <span className="slot-label">{SLOT_LABEL[slot]}</span>
                </div>
              );
            })}
          </div>

          <h3 style={{ color: "var(--gold)", margin: "20px 0 8px" }}>Рюкзак ({hero.artifacts.backpack.length})</h3>
          <div className="backpack-grid">
            {hero.artifacts.backpack.length === 0 && (
              <div style={{ color: "var(--text-dim)", fontSize: 12, padding: "8px 0" }}>Пусто</div>
            )}
            {hero.artifacts.backpack.map((aid, idx) => {
              const def = ARTIFACTS[aid];
              const isSel = selected?.kind === "backpack" && selected.idx === idx;
              return (
                <div
                  key={idx}
                  className={`artifact-slot ${isSel ? "sel" : ""}`}
                  style={{ borderColor: RARITY_COLOR[def.rarity] }}
                  onClick={() => clickBackpack(idx)}
                  title={`${def.name} — ${def.description}`}
                >
                  <span style={{ fontSize: 24 }}>{def.icon}</span>
                  <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{def.name}</span>
                </div>
              );
            })}
          </div>

          <h3 style={{ color: "var(--gold)", margin: "20px 0 8px" }}>
            Заклинания ({hero.spells.length}){" "}
            <span style={{ color: "var(--text-dim)", fontSize: 12, fontWeight: "normal" }}>
              · мана {hero.mana} / {effMaxMana} · сила {effSpellPower}
            </span>
          </h3>
          <div className="spellbook-grid">
            {hero.spells.length === 0 && (
              <div style={{ color: "var(--text-dim)", fontSize: 12, padding: "8px 0" }}>
                Нет заклинаний — постройте гильдию магов и зайдите в город.
              </div>
            )}
            {hero.spells.map(sid => {
              const sp = getSpell(sid);
              if (!sp) return null;
              return (
                <div key={sid} className="spell-slot" title={`${sp.name} (ур. ${sp.level}) — ${sp.description}`}>
                  <span style={{ fontSize: 22 }}>{sp.icon}</span>
                  <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{sp.name}</span>
                  <span style={{ fontSize: 10, color: "var(--accent)" }}>💧 {sp.manaCost}</span>
                </div>
              );
            })}
          </div>

          <div className="hero-hint">
            {selected
              ? "Клик на пустой слот того же типа — экипировать; клик в рюкзак — снять."
              : "Клик по слоту — выбрать. Армия меняется внутри героя."}
          </div>
        </div>
      </div>
    </div>
  );
}

function BonusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-row" style={{ color: "var(--good)" }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
