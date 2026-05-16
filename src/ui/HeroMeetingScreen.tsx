import { useState } from "react";

import { ARTIFACTS, RARITY_COLOR, SLOT_ICON, SLOT_LABEL } from "../game/data/artifacts";
import { FACTION_META } from "../game/data/factions";
import { UNITS } from "../game/data/units";
import { useGame } from "../game/store";
import { ARTIFACT_SLOT_ORDER } from "../game/types";
import type { ArtifactSlot, Hero } from "../game/types";
import { getHeroBonus } from "../game/utils/heroBonus";

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
  const equipFromBackpack = useGame(s => s.equipFromBackpack);
  const unequipToBackpack = useGame(s => s.unequipToBackpack);
  const transferArtifact = useGame(s => s.transferArtifact);
  const close = useGame(s => s.closeHeroMeeting);

  const [selected, setSelected] = useState<Selected>(null);

  if (!a || !b) return null;

  function clickArmy(hero: Hero, slot: number) {
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
          onArmy={s => clickArmy(a, s)}
          onEquipped={s => clickEquipped(a, s)}
          onBackpack={i => clickBackpack(a, i)}
        />
        <HeroPanel
          hero={b}
          selected={selected}
          onArmy={s => clickArmy(b, s)}
          onEquipped={s => clickEquipped(b, s)}
          onBackpack={i => clickBackpack(b, i)}
        />
      </div>

      <div className="meeting-hint">
        {selected
          ? "Кликните по слоту/рюкзаку: в своём герое — экипировать/снять; в другом — передать в его рюкзак."
          : "Кликните по существу или артефакту, чтобы выбрать для обмена."}
      </div>
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
  onArmy: (slot: number) => void;
  onEquipped: (slot: ArtifactSlot) => void;
  onBackpack: (idx: number) => void;
}) {
  const bonus = getHeroBonus(hero);
  return (
    <div className="meeting-hero">
      <div className="meeting-hero-header">
        <span style={{ fontSize: 48 }}>{hero.icon}</span>
        <div>
          <div style={{ fontSize: 20, color: "var(--gold)" }}>{hero.name}</div>
          <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
            Уровень {hero.level} · {FACTION_META[hero.faction].name} · ⚡ {hero.movePoints} MP
          </div>
          {(bonus.attack || bonus.defense || bonus.speed || bonus.hpBonus || bonus.movement) > 0 && (
            <div style={{ fontSize: 12, color: "var(--good)", marginTop: 4 }}>
              {bonus.attack ? `+${bonus.attack} атк ` : ""}
              {bonus.defense ? `+${bonus.defense} защ ` : ""}
              {bonus.speed ? `+${bonus.speed} ск ` : ""}
              {bonus.hpBonus ? `+${bonus.hpBonus} HP ` : ""}
              {bonus.movement ? `+${bonus.movement} MP` : ""}
            </div>
          )}
        </div>
      </div>

      <h4 style={{ color: "var(--gold)", margin: "12px 0 6px" }}>Армия</h4>
      <div className="meeting-army">
        {Array.from({ length: 7 }).map((_, slot) => {
          const stack = hero.army[slot];
          const isSel = selected?.kind === "army" && selected.heroId === hero.id && selected.slot === slot;
          if (!stack)
            return (
              <div key={slot} className={`army-slot empty ${isSel ? "sel" : ""}`} onClick={() => onArmy(slot)}>
                —
              </div>
            );
          const u = UNITS[stack.unitId];
          return (
            <div key={slot} className={`army-slot ${isSel ? "sel" : ""}`} onClick={() => onArmy(slot)}>
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
