import { ARTIFACTS, RARITY_COLOR, SLOT_ICON, SLOT_LABEL } from "../../game/data/artifacts";
import type { ArtifactSlot, HeroArtifacts } from "../../game/types";
import { ARTIFACT_SLOT_ORDER } from "../../game/types";

// Grid из 7 слотов экипировки. Цвет рамки зависит от rarity артефакта.
// Выбор/действия — снаружи (HeroScreen / HeroMeetingScreen).
export function EquippedGrid({
  artifacts,
  isSelected,
  onSlotClick,
}: {
  artifacts: HeroArtifacts;
  isSelected?: (slot: ArtifactSlot) => boolean;
  onSlotClick: (slot: ArtifactSlot) => void;
}) {
  return (
    <div className="equipped-grid">
      {ARTIFACT_SLOT_ORDER.map(slot => {
        const artId = artifacts.equipped[slot];
        const def = artId ? ARTIFACTS[artId] : null;
        const sel = isSelected?.(slot) ?? false;
        return (
          <div
            key={slot}
            className={`equip-slot ${def ? "filled" : "empty"} ${sel ? "sel" : ""}`}
            style={def ? { borderColor: RARITY_COLOR[def.rarity] } : undefined}
            onClick={() => onSlotClick(slot)}
            title={def ? `${def.name} — ${def.description}` : `${SLOT_LABEL[slot]} (пусто)`}
          >
            <span className="slot-icon">{def ? def.icon : SLOT_ICON[slot]}</span>
            <span className="slot-label">{SLOT_LABEL[slot]}</span>
          </div>
        );
      })}
    </div>
  );
}
