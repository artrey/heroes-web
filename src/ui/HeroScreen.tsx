import { useState } from "react";

import { ARTIFACTS } from "../game/data/artifacts";
import { FACTION_META } from "../game/data/factions";
import { getSpell } from "../game/data/spells";
import { useGame } from "../game/store";
import type { ArmySlotRef, ArtifactSlot } from "../game/types";
import { findFirstEmptySlot } from "../game/utils/army";
import {
  getEffectiveKnowledge,
  getEffectiveMaxMana,
  getEffectiveMaxMP,
  getEffectiveSpellPower,
  getHeroBonus,
} from "../game/utils/heroBonus";
import { xpToNextLevel } from "../game/utils/leveling";
import { useMyPlayerId } from "../net/netStore";
import { ArmyGrid } from "./hero/ArmyGrid";
import { BackpackGrid } from "./hero/BackpackGrid";
import { EquippedGrid } from "./hero/EquippedGrid";
import { SplitDialog } from "./SplitDialog";

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
  const splitStack = useGame(s => s.splitStack);
  const equipFromBackpack = useGame(s => s.equipFromBackpack);
  const unequipToBackpack = useGame(s => s.unequipToBackpack);
  const activePlayerId = useGame(s => s.activePlayerId);
  const myPlayerId = useMyPlayerId();
  // canAct: герой мой и сейчас мой ход. В SP myPlayerId=null — старая эвристика.
  const canAct = myPlayerId
    ? hero?.ownerId === myPlayerId && activePlayerId === myPlayerId
    : hero?.ownerId === activePlayerId;

  const [selected, setSelected] = useState<Selected>(null);
  const [splitDialog, setSplitDialog] = useState<{ from: ArmySlotRef; to: ArmySlotRef } | null>(null);

  if (!hero) return null;
  const bonus = getHeroBonus(hero);
  const effMaxMP = getEffectiveMaxMP(hero);
  const effSpellPower = getEffectiveSpellPower(hero);
  const effKnowledge = getEffectiveKnowledge(hero);
  const effMaxMana = getEffectiveMaxMana(hero);

  function clickArmy(slot: number, ev?: React.MouseEvent) {
    if (!hero || !canAct) return;
    // Shift+click — открыть диалог разделения. Если source ещё не выбран,
    // источником становится этот же слот, целью — первый пустой слот того же героя.
    if (ev?.shiftKey) {
      if (!selected) {
        const stack = hero.army[slot];
        if (!stack || stack.count < 2) return;
        const empty = findFirstEmptySlot(hero.army);
        if (empty == null) return;
        setSplitDialog({
          from: { kind: "hero", heroId: hero.id, slot },
          to: { kind: "hero", heroId: hero.id, slot: empty },
        });
        return;
      }
      if (selected.kind === "army") {
        const srcStack = hero.army[selected.slot];
        if (!srcStack) {
          setSelected(null);
          return;
        }
        setSplitDialog({
          from: { kind: "hero", heroId: hero.id, slot: selected.slot },
          to: { kind: "hero", heroId: hero.id, slot },
        });
        setSelected(null);
        return;
      }
    }
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
    if (!hero || !canAct) return;
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
    if (!hero || !canAct) return;
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
            <div className="stat-row" title="Сумма: уровни + артефакты">
              <span>⚔️ Атака</span>
              <span>{bonus.attack}</span>
            </div>
            <div className="stat-row" title="Сумма: уровни + артефакты">
              <span>🛡️ Защита</span>
              <span>{bonus.defense}</span>
            </div>
            <div className="stat-row" title="База + бонусы от артефактов">
              <span>🔮 Сила магии</span>
              <span>{effSpellPower}</span>
            </div>
            <div className="stat-row" title="База + бонусы от артефактов">
              <span>📚 Знания</span>
              <span>{effKnowledge}</span>
            </div>
            <div className="stat-row">
              <span>💧 Мана</span>
              <span>
                {hero.mana} / {effMaxMana}
              </span>
            </div>
            {(() => {
              const base = {
                attack: hero.attack,
                defense: hero.defense,
                spellPower: hero.spellPower,
                knowledge: hero.knowledge,
              };
              const lvl = hero.statBonus;
              const gear = {
                attack: bonus.attack - base.attack - lvl.attack,
                defense: bonus.defense - base.defense - lvl.defense,
                speed: bonus.speed,
                hpBonus: bonus.hpBonus,
                movement: bonus.movement,
                spellPower: bonus.spellPower - base.spellPower - lvl.spellPower,
                knowledge: bonus.knowledge - base.knowledge - lvl.knowledge,
                manaMult: bonus.manaMult,
              };
              const hasLvl = lvl.attack + lvl.defense + lvl.spellPower + lvl.knowledge > 0;
              const gearTotal =
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
                  <div
                    className="stat-row"
                    style={{ borderTop: "1px solid var(--border)", paddingTop: 8, marginTop: 8 }}
                  >
                    <span style={{ color: "var(--text-dim)" }}>База:</span>
                  </div>
                  <BonusRow label="⚔️ Атака" value={`${base.attack}`} />
                  <BonusRow label="🛡️ Защита" value={`${base.defense}`} />
                  <BonusRow label="🔮 Сила магии" value={`${base.spellPower}`} />
                  <BonusRow label="📚 Знания" value={`${base.knowledge}`} />
                  <div
                    className="stat-row"
                    style={{ borderTop: "1px solid var(--border)", paddingTop: 8, marginTop: 8 }}
                  >
                    <span style={{ color: "var(--text-dim)" }}>От уровней:</span>
                  </div>
                  {hasLvl ? (
                    <>
                      {lvl.attack ? <BonusRow label="⚔️ Атака" value={`+${lvl.attack}`} /> : null}
                      {lvl.defense ? <BonusRow label="🛡️ Защита" value={`+${lvl.defense}`} /> : null}
                      {lvl.spellPower ? <BonusRow label="🔮 Сила магии" value={`+${lvl.spellPower}`} /> : null}
                      {lvl.knowledge ? <BonusRow label="📚 Знания" value={`+${lvl.knowledge}`} /> : null}
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: "var(--text-dim)", fontStyle: "italic" }}>—</div>
                  )}
                  <div
                    className="stat-row"
                    style={{ borderTop: "1px solid var(--border)", paddingTop: 8, marginTop: 8 }}
                  >
                    <span style={{ color: "var(--text-dim)" }}>От артефактов:</span>
                  </div>
                  {gearTotal > 0 ? (
                    <>
                      {gear.attack ? <BonusRow label="⚔️ Атака" value={`+${gear.attack}`} /> : null}
                      {gear.defense ? <BonusRow label="🛡️ Защита" value={`+${gear.defense}`} /> : null}
                      {gear.speed ? <BonusRow label="🏃 Скорость" value={`+${gear.speed}`} /> : null}
                      {gear.hpBonus ? <BonusRow label="❤️ HP" value={`+${gear.hpBonus}`} /> : null}
                      {gear.movement ? <BonusRow label="🥾 Доп. MP" value={`+${gear.movement}`} /> : null}
                      {gear.spellPower ? <BonusRow label="🔮 Сила магии" value={`+${gear.spellPower}`} /> : null}
                      {gear.knowledge ? <BonusRow label="📚 Знания" value={`+${gear.knowledge}`} /> : null}
                      {gear.manaMult ? <BonusRow label="💧 Макс. мана" value={`+${gear.manaMult}%`} /> : null}
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: "var(--text-dim)", fontStyle: "italic" }}>—</div>
                  )}
                </>
              );
            })()}
          </div>
        </div>

        <div className="hero-main">
          <h3 style={{ color: "var(--gold)", margin: "0 0 8px" }}>Армия</h3>
          <ArmyGrid
            army={hero.army}
            className="hero-army"
            isSelected={slot => selected?.kind === "army" && selected.slot === slot}
            onSlotClick={(slot, ev) => clickArmy(slot, ev)}
            slotTitle={(_, u) =>
              `${u.name}: атк ${u.attack + bonus.attack}, защ ${u.defense + bonus.defense}, HP ${u.hp + bonus.hpBonus}, скор ${u.speed + bonus.speed}`
            }
          />

          <h3 style={{ color: "var(--gold)", margin: "20px 0 8px" }}>Экипировка</h3>
          <EquippedGrid
            artifacts={hero.artifacts}
            isSelected={slot => selected?.kind === "equipped" && selected.slot === slot}
            onSlotClick={slot => clickEquipped(slot)}
          />

          <h3 style={{ color: "var(--gold)", margin: "20px 0 8px" }}>Рюкзак ({hero.artifacts.backpack.length})</h3>
          <BackpackGrid
            backpack={hero.artifacts.backpack}
            isSelected={idx => selected?.kind === "backpack" && selected.idx === idx}
            onSlotClick={idx => clickBackpack(idx)}
          />

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
              : "Клик по слоту — выбрать. Shift+клик — разделить отряд."}
          </div>
        </div>
      </div>
      {splitDialog &&
        (() => {
          const srcStack = hero.army[splitDialog.from.slot];
          if (!srcStack) return null;
          const dstStack = hero.army[splitDialog.to.slot] ?? null;
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

function BonusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-row" style={{ color: "var(--good)" }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
