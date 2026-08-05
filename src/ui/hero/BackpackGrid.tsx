import { ARTIFACTS, RARITY_COLOR } from "../../game/data/artifacts";
import { ArtifactIcon } from "../gameArt";

// Список артефактов в рюкзаке. Пустой рюкзак рисует «Пусто»-плашку.
export function BackpackGrid({
  backpack,
  isSelected,
  onSlotClick,
}: {
  backpack: string[];
  isSelected?: (idx: number) => boolean;
  onSlotClick: (idx: number) => void;
}) {
  return (
    <div className="backpack-grid">
      {backpack.length === 0 && <div style={{ color: "var(--text-dim)", fontSize: 12, padding: "8px 0" }}>Пусто</div>}
      {backpack.map((id, idx) => {
        const def = ARTIFACTS[id];
        const sel = isSelected?.(idx) ?? false;
        return (
          <div
            key={idx}
            className={`artifact-slot ${sel ? "sel" : ""}`}
            style={{ borderColor: RARITY_COLOR[def.rarity] }}
            onClick={() => onSlotClick(idx)}
            title={`${def.name} — ${def.description}`}
          >
            <ArtifactIcon id={def.id} size={38} />
            <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{def.name}</span>
          </div>
        );
      })}
    </div>
  );
}
