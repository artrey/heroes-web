import { UNITS } from "../../game/data/units";
import type { UnitDef, UnitStack } from "../../game/types";

// 7 слотов армии героя/гарнизона. Сам компонент только рендерит — выбор и
// действия делает вызывающий (передаёт isSelected/onSlotClick). Контейнерный
// className задаётся снаружи (".hero-army" / ".meeting-army" / town-стиль).
export function ArmyGrid({
  army,
  isSelected,
  onSlotClick,
  slotTitle,
  className,
}: {
  army: UnitStack[];
  isSelected?: (slot: number) => boolean;
  onSlotClick: (slot: number, ev: React.MouseEvent) => void;
  // По умолчанию title=имя юнита. HeroScreen перепроп'ивает на расширенную строку
  // с атк/защ/HP/ск, потому что у него есть место под подсказку.
  slotTitle?: (stack: UnitStack, unit: UnitDef) => string;
  className?: string;
}) {
  return (
    <div className={className}>
      {Array.from({ length: 7 }).map((_, slot) => {
        const stack = army[slot];
        const sel = isSelected?.(slot) ?? false;
        if (!stack) {
          return (
            <div key={slot} className={`army-slot empty ${sel ? "sel" : ""}`} onClick={ev => onSlotClick(slot, ev)}>
              —
            </div>
          );
        }
        const unit = UNITS[stack.unitId];
        const title = slotTitle ? slotTitle(stack, unit) : (unit?.name ?? stack.unitId);
        return (
          <div
            key={slot}
            className={`army-slot ${sel ? "sel" : ""}`}
            onClick={ev => onSlotClick(slot, ev)}
            title={title}
          >
            <span className="icon">{unit?.icon ?? "?"}</span>
            <span>{stack.count}</span>
          </div>
        );
      })}
    </div>
  );
}
