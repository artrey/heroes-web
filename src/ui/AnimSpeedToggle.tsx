import { ANIM_SPEED_ICON, ANIM_SPEED_LABEL, useSettings } from "./settingsStore";

// Кнопка-переключатель скорости анимаций. Клик циклически переключает
// 4 уровня: Медленно → Быстро → Очень быстро → Мгновенно → ...
export function AnimSpeedToggle({ compact = false }: { compact?: boolean }) {
  const speed = useSettings(s => s.animSpeed);
  const cycle = useSettings(s => s.cycleAnimSpeed);
  return (
    <button
      onClick={cycle}
      title={`Скорость анимаций: ${ANIM_SPEED_LABEL[speed]} — клик переключит`}
      style={{
        padding: compact ? "4px 8px" : "6px 10px",
        fontSize: compact ? 12 : 13,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <span style={{ fontSize: compact ? 14 : 16 }}>{ANIM_SPEED_ICON[speed]}</span>
      <span>{ANIM_SPEED_LABEL[speed]}</span>
    </button>
  );
}
