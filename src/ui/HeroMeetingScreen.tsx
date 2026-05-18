import { useState } from "react";

import { ARTIFACTS, RARITY_COLOR, SLOT_ICON, SLOT_LABEL } from "../game/data/artifacts";
import { FACTION_META } from "../game/data/factions";
import { UNITS } from "../game/data/units";
import { useGame } from "../game/store";
import { ARTIFACT_SLOT_ORDER } from "../game/types";
import type { ArmySlotRef, ArtifactSlot, Hero } from "../game/types";
import {
  getEffectiveKnowledge,
  getEffectiveMaxMana,
  getEffectiveSpellPower,
  getHeroBonus,
} from "../game/utils/heroBonus";
import { useMyPlayerId } from "../net/netStore";
import { findFirstEmptySlot } from "./HeroScreen";
import { SplitDialog } from "./SplitDialog";

type Selected =
  | { kind: "army"; heroId: string; slot: number }
  | { kind: "equipped"; heroId: string; slot: ArtifactSlot }
  | { kind: "backpack"; heroId: string; idx: number }
  | null;

export function HeroMeetingScreen() {
  const ids = useGame(s => s.meetingHeroIds);
  const a = useGame(s => (ids ? s.heroes[ids[0]] : null));
  const b = useGame(s => (ids ? s.heroes[ids[1]] : null));
  const swapArmySlots = useGame(s => s.swapArmySlots);
  const splitStack = useGame(s => s.splitStack);
  const equipFromBackpack = useGame(s => s.equipFromBackpack);
  const unequipToBackpack = useGame(s => s.unequipToBackpack);
  const transferArtifact = useGame(s => s.transferArtifact);
  const transferAllArmy = useGame(s => s.transferAllArmy);
  const transferAllArtifacts = useGame(s => s.transferAllArtifacts);
  const close = useGame(s => s.closeHeroMeeting);
  const activePlayerId = useGame(s => s.activePlayerId);
  const myPlayerId = useMyPlayerId();
  // Встреча только своих героев в свой ход.
  const ownerId = a?.ownerId ?? null;
  const canAct = myPlayerId ? ownerId === myPlayerId && activePlayerId === myPlayerId : ownerId === activePlayerId;

  const [selected, setSelected] = useState<Selected>(null);
  const [splitDialog, setSplitDialog] = useState<{ from: ArmySlotRef; to: ArmySlotRef } | null>(null);

  if (!a || !b) return null;

  function clickArmy(hero: Hero, slot: number, ev?: React.MouseEvent) {
    if (!canAct) return;
    // Shift+click — открыть split-dialog.
    if (ev?.shiftKey) {
      if (!selected) {
        const stack = hero.army[slot];
        if (!stack || stack.count < 2) return;
        // Цель по умолчанию — первый пустой слот другого героя (типичный обмен).
        const otherHero = hero.id === a!.id ? b! : a!;
        const empty = findFirstEmptySlot(otherHero.army);
        if (empty == null) return;
        setSplitDialog({
          from: { kind: "hero", heroId: hero.id, slot },
          to: { kind: "hero", heroId: otherHero.id, slot: empty },
        });
        return;
      }
      if (selected.kind === "army") {
        const srcHero = selected.heroId === a!.id ? a! : b!;
        const srcStack = srcHero.army[selected.slot];
        if (!srcStack) {
          setSelected(null);
          return;
        }
        setSplitDialog({
          from: { kind: "hero", heroId: srcHero.id, slot: selected.slot },
          to: { kind: "hero", heroId: hero.id, slot },
        });
        setSelected(null);
        return;
      }
    }
    if (!selected) {
      if (hero.army[slot]) setSelected({ kind: "army", heroId: hero.id, slot });
      return;
    }
    if (selected.kind !== "army") {
      setSelected(null);
      return;
    }
    swapArmySlots(selected.heroId, selected.slot, hero.id, slot);
    setSelected(null);
  }

  function clickEquipped(hero: Hero, slot: ArtifactSlot) {
    if (!canAct) return;
    const occupied = !!hero.artifacts.equipped[slot];
    if (!selected) {
      if (occupied) setSelected({ kind: "equipped", heroId: hero.id, slot });
      return;
    }
    // Перенос между героями.
    if (selected.heroId !== hero.id) {
      if (selected.kind === "equipped" || selected.kind === "backpack") {
        const source =
          selected.kind === "equipped"
            ? ({ kind: "equipped", slot: selected.slot } as const)
            : ({ kind: "backpack", idx: selected.idx } as const);
        transferArtifact(selected.heroId, source, hero.id);
      }
      setSelected(null);
      return;
    }
    // Тот же герой: backpack → equip slot.
    if (selected.kind === "backpack" && selected.heroId === hero.id) {
      const sourceArt = ARTIFACTS[hero.artifacts.backpack[selected.idx]!];
      if (sourceArt && sourceArt.slot === slot) {
        equipFromBackpack(hero.id, selected.idx);
      }
      setSelected(null);
      return;
    }
    // equipped → тот же equipped: ничего, просто отмена.
    setSelected(null);
  }

  function clickBackpack(hero: Hero, idx: number) {
    if (!canAct) return;
    if (!selected) {
      if (hero.artifacts.backpack[idx]) setSelected({ kind: "backpack", heroId: hero.id, idx });
      return;
    }
    // Перенос между героями: equipped/backpack → backpack другого.
    if (selected.heroId !== hero.id) {
      if (selected.kind === "equipped" || selected.kind === "backpack") {
        const source =
          selected.kind === "equipped"
            ? ({ kind: "equipped", slot: selected.slot } as const)
            : ({ kind: "backpack", idx: selected.idx } as const);
        transferArtifact(selected.heroId, source, hero.id);
      }
      setSelected(null);
      return;
    }
    // Тот же герой: equipped → backpack = unequip.
    if (selected.kind === "equipped" && selected.heroId === hero.id) {
      unequipToBackpack(hero.id, selected.slot);
    }
    setSelected(null);
  }

  return (
    <div className="hero-meeting">
      <div className="top-bar">
        <span className="day" style={{ color: "var(--gold)" }}>
          🤝 Встреча героев
        </span>
        <button style={{ marginLeft: "auto" }} onClick={close}>
          ← Закрыть
        </button>
      </div>

      <div className="meeting-body">
        <HeroPanel
          hero={a}
          selected={selected}
          onArmy={(s, ev) => clickArmy(a, s, ev)}
          onEquipped={s => clickEquipped(a, s)}
          onBackpack={i => clickBackpack(a, i)}
        />
        <div className="meeting-transfer">
          <div className="meeting-transfer-label">Передать всё</div>
          <button
            disabled={!canAct || a.army.length === 0}
            onClick={() => transferAllArmy(a.id, b.id)}
            title={canAct ? "Передать всю армию правому герою" : "Не ваш ход"}
          >
            👥 ⇒
          </button>
          <button
            disabled={!canAct || b.army.length === 0}
            onClick={() => transferAllArmy(b.id, a.id)}
            title={canAct ? "Передать всю армию левому герою" : "Не ваш ход"}
          >
            ⇐ 👥
          </button>
          <button
            disabled={!canAct || (Object.keys(a.artifacts.equipped).length === 0 && a.artifacts.backpack.length === 0)}
            onClick={() => transferAllArtifacts(a.id, b.id)}
            title={canAct ? "Передать все артефакты правому герою (в рюкзак)" : "Не ваш ход"}
          >
            💼 ⇒
          </button>
          <button
            disabled={!canAct || (Object.keys(b.artifacts.equipped).length === 0 && b.artifacts.backpack.length === 0)}
            onClick={() => transferAllArtifacts(b.id, a.id)}
            title={canAct ? "Передать все артефакты левому герою (в рюкзак)" : "Не ваш ход"}
          >
            ⇐ 💼
          </button>
        </div>
        <HeroPanel
          hero={b}
          selected={selected}
          onArmy={(s, ev) => clickArmy(b, s, ev)}
          onEquipped={s => clickEquipped(b, s)}
          onBackpack={i => clickBackpack(b, i)}
        />
      </div>

      <div className="meeting-hint">
        {selected
          ? "Кликните по слоту/рюкзаку: в своём герое — экипировать/снять; в другом — передать."
          : "Клик — выбрать. Shift+клик — разделить отряд."}
      </div>
      {splitDialog &&
        (() => {
          // В этом экране оба конца — только герои (гарнизон сюда не относится).
          if (splitDialog.from.kind !== "hero" || splitDialog.to.kind !== "hero") return null;
          const srcHero = splitDialog.from.heroId === a!.id ? a! : b!;
          const dstHero = splitDialog.to.heroId === a!.id ? a! : b!;
          const srcStack = srcHero.army[splitDialog.from.slot];
          if (!srcStack) return null;
          const dstStack = dstHero.army[splitDialog.to.slot] ?? null;
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

function HeroPanel({
  hero,
  selected,
  onArmy,
  onEquipped,
  onBackpack,
}: {
  hero: Hero;
  selected: Selected;
  onArmy: (slot: number, ev?: React.MouseEvent) => void;
  onEquipped: (slot: ArtifactSlot) => void;
  onBackpack: (idx: number) => void;
}) {
  const bonus = getHeroBonus(hero);
  const sp = getEffectiveSpellPower(hero);
  const know = getEffectiveKnowledge(hero);
  const maxMana = getEffectiveMaxMana(hero);
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
  return (
    <div className="meeting-hero">
      <div className="meeting-hero-header">
        <span style={{ fontSize: 48 }}>{hero.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, color: "var(--gold)" }}>{hero.name}</div>
          <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
            Уровень {hero.level} · {FACTION_META[hero.faction].name} · ⚡ {hero.movePoints} MP
          </div>
        </div>
      </div>

      <div className="meeting-stats" title="Сумма с учётом уровней и артефактов">
        <span>⚔️ {bonus.attack}</span>
        <span>🛡️ {bonus.defense}</span>
        <span>🔮 {sp}</span>
        <span>📚 {know}</span>
        <span>
          💧 {hero.mana}/{maxMana}
        </span>
      </div>
      <BonusBreakdown base={base} lvl={lvl} gear={gear} />

      <h4 style={{ color: "var(--gold)", margin: "16px 0 6px" }}>Армия</h4>
      <div className="meeting-army">
        {Array.from({ length: 7 }).map((_, slot) => {
          const stack = hero.army[slot];
          const isSel = selected?.kind === "army" && selected.heroId === hero.id && selected.slot === slot;
          if (!stack)
            return (
              <div key={slot} className={`army-slot empty ${isSel ? "sel" : ""}`} onClick={ev => onArmy(slot, ev)}>
                —
              </div>
            );
          const u = UNITS[stack.unitId];
          return (
            <div key={slot} className={`army-slot ${isSel ? "sel" : ""}`} onClick={ev => onArmy(slot, ev)}>
              <span className="icon">{u.icon}</span>
              <span>{stack.count}</span>
            </div>
          );
        })}
      </div>

      <h4 style={{ color: "var(--gold)", margin: "16px 0 6px" }}>Экипировка</h4>
      <div className="equipped-grid">
        {ARTIFACT_SLOT_ORDER.map(slot => {
          const artId = hero.artifacts.equipped[slot];
          const isSel = selected?.kind === "equipped" && selected.heroId === hero.id && selected.slot === slot;
          const def = artId ? ARTIFACTS[artId] : null;
          return (
            <div
              key={slot}
              className={`equip-slot ${def ? "filled" : "empty"} ${isSel ? "sel" : ""}`}
              style={def ? { borderColor: RARITY_COLOR[def.rarity] } : undefined}
              onClick={() => onEquipped(slot)}
              title={def ? `${def.name} — ${def.description}` : `${SLOT_LABEL[slot]} (пусто)`}
            >
              <span className="slot-icon">{def ? def.icon : SLOT_ICON[slot]}</span>
              <span className="slot-label">{SLOT_LABEL[slot]}</span>
            </div>
          );
        })}
      </div>

      <h4 style={{ color: "var(--gold)", margin: "16px 0 6px" }}>Рюкзак ({hero.artifacts.backpack.length})</h4>
      <div className="backpack-grid">
        {hero.artifacts.backpack.length === 0 && (
          <div style={{ color: "var(--text-dim)", fontSize: 12, padding: "8px 0" }}>Пусто</div>
        )}
        {hero.artifacts.backpack.map((id, idx) => {
          const def = ARTIFACTS[id];
          const isSel = selected?.kind === "backpack" && selected.heroId === hero.id && selected.idx === idx;
          return (
            <div
              key={idx}
              className={`artifact-slot ${isSel ? "sel" : ""}`}
              style={{ borderColor: RARITY_COLOR[def.rarity] }}
              onClick={() => onBackpack(idx)}
              title={`${def.name} — ${def.description}`}
            >
              <span style={{ fontSize: 24 }}>{def.icon}</span>
              <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{def.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Компактная разбивка бонусов: база героя, вклад уровней и вклад артефактов.
function BonusBreakdown({
  base,
  lvl,
  gear,
}: {
  base: { attack: number; defense: number; spellPower: number; knowledge: number };
  lvl: { attack: number; defense: number; spellPower: number; knowledge: number };
  gear: {
    attack: number;
    defense: number;
    speed: number;
    hpBonus: number;
    movement: number;
    spellPower: number;
    knowledge: number;
    manaMult: number;
  };
}) {
  const baseParts = [`⚔️ ${base.attack}`, `🛡️ ${base.defense}`, `🔮 ${base.spellPower}`, `📚 ${base.knowledge}`];
  const lvlParts: string[] = [];
  if (lvl.attack) lvlParts.push(`⚔️ +${lvl.attack}`);
  if (lvl.defense) lvlParts.push(`🛡️ +${lvl.defense}`);
  if (lvl.spellPower) lvlParts.push(`🔮 +${lvl.spellPower}`);
  if (lvl.knowledge) lvlParts.push(`📚 +${lvl.knowledge}`);
  const gearParts: string[] = [];
  if (gear.attack) gearParts.push(`⚔️ +${gear.attack}`);
  if (gear.defense) gearParts.push(`🛡️ +${gear.defense}`);
  if (gear.speed) gearParts.push(`🏃 +${gear.speed}`);
  if (gear.hpBonus) gearParts.push(`❤️ +${gear.hpBonus}`);
  if (gear.movement) gearParts.push(`🥾 +${gear.movement}`);
  if (gear.spellPower) gearParts.push(`🔮 +${gear.spellPower}`);
  if (gear.knowledge) gearParts.push(`📚 +${gear.knowledge}`);
  if (gear.manaMult) gearParts.push(`💧 +${gear.manaMult}%`);
  return (
    <div className="meeting-bonus-breakdown">
      <div>
        <span className="bb-label">База:</span> {baseParts.join(" · ")}
      </div>
      <div>
        <span className="bb-label">От уровней:</span>{" "}
        {lvlParts.length ? lvlParts.join(" · ") : <span className="bb-empty">—</span>}
      </div>
      <div>
        <span className="bb-label">От артефактов:</span>{" "}
        {gearParts.length ? gearParts.join(" · ") : <span className="bb-empty">—</span>}
      </div>
    </div>
  );
}
