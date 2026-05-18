import { create } from "zustand";
import { persist } from "zustand/middleware";

// Скорость UI-анимаций (карта приключений + бой). Не часть GameState — это
// личная настройка клиента, не сетится и не сохраняется в сейв игры.
export type AnimSpeed = "slow" | "normal" | "fast" | "instant";

export const ANIM_SPEED_ORDER: AnimSpeed[] = ["slow", "normal", "fast", "instant"];

// Множитель длительности от базовой (slow = 1.0). instant = 0 означает «не
// запускать анимацию вовсе» — поведение, как было до анимаций.
export const ANIM_SPEED_SCALE: Record<AnimSpeed, number> = {
  slow: 1,
  normal: 0.55,
  fast: 0.25,
  instant: 0,
};

export const ANIM_SPEED_LABEL: Record<AnimSpeed, string> = {
  slow: "Медленно",
  normal: "Быстро",
  fast: "Очень быстро",
  instant: "Мгновенно",
};

export const ANIM_SPEED_ICON: Record<AnimSpeed, string> = {
  slow: "🐢",
  normal: "🚶",
  fast: "🏃",
  instant: "⚡",
};

interface SettingsState {
  animSpeed: AnimSpeed;
  setAnimSpeed: (s: AnimSpeed) => void;
  cycleAnimSpeed: () => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      animSpeed: "slow",
      setAnimSpeed: s => set({ animSpeed: s }),
      cycleAnimSpeed: () => {
        const idx = ANIM_SPEED_ORDER.indexOf(get().animSpeed);
        const next = ANIM_SPEED_ORDER[(idx + 1) % ANIM_SPEED_ORDER.length];
        set({ animSpeed: next });
      },
    }),
    {
      name: "heroes-web-settings",
      version: 1,
      migrate: (persisted, fromVersion) => {
        // На будущее. Пока пуст: формат настроек ещё не менялся.
        void fromVersion;
        return persisted as SettingsState;
      },
    },
  ),
);
