import { getSpell } from "../../game/data/spells";
import type { Faction } from "../../game/types";
import { FactionIcon, SpellIcon, UiIcon } from "../gameArt";

// Гильдия магов — каталог доступных заклинаний по уровням. Сам каст не делается
// отсюда: герой, заходящий в город, автоматически их изучит (applyMageGuildVisit
// в game/state/helpers/army). Окно — справочное.
export function MageGuildModal({
  level,
  spellIds,
  heroHere,
  onClose,
}: {
  level: number;
  spellIds: string[];
  heroHere: { name: string; faction: Faction; knownSpells: string[] } | null;
  onClose: () => void;
}) {
  // Группируем заклинания по уровню — порядок строк всегда 1 → 2 → 3.
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
        <h2 style={{ marginTop: 0, color: "var(--gold)" }}>
          <UiIcon name="mageGuild" size={28} /> Гильдия магов — уровень {level}
        </h2>
        <p style={{ color: "var(--text-dim)", marginTop: 0 }}>
          Здесь обучают магии. Герой, заходящий в город, автоматически изучает все доступные заклинания и пополняет
          ману.
        </p>
        {heroHere && (
          <div style={{ marginBottom: 8, fontSize: 13 }}>
            <FactionIcon faction={heroHere.faction} size={30} /> <b>{heroHere.name}</b> сейчас в городе и автоматически
            изучает все заклинания.
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
                        <SpellIcon id={sp.id} size={34} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: "bold", fontSize: 13 }}>{sp.name}</div>
                          <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                            <UiIcon name="mana" size={14} /> {sp.manaCost} · {has ? "уже изучено" : "будет изучено"}
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
