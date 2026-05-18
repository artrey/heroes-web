import { useCallback, useEffect, useRef, useState } from "react";

// Тонкий rAF-цикл для канвас-анимаций. UI-компонент даёт `onFrame`, который:
//   1) сам решает, не пора ли завершать какую-то анимацию (обнуляет refs);
//   2) возвращает true, если в следующем кадре ещё есть что показывать.
//
// Хук:
//   - Гарантирует один активный rAF на компонент.
//   - На каждый кадр инкрементирует `tick` — компонент его слушает и форсит
//     перерисовку канваса.
//   - Сам отменяет rAF при размонтировании.
//
// Использование:
//   const onFrame = useCallback(() => {
//     // обновить state анимаций, вернуть alive boolean
//   }, []);
//   const { ensureRunning, tick } = useAnimationLoop(onFrame);
//   // когда стартанули новую анимацию: ensureRunning();
//   // useEffect перерисовки канваса слушает tick в зависимостях.
export function useAnimationLoop(onFrame: () => boolean): { ensureRunning: () => void; tick: number } {
  const onFrameRef = useRef(onFrame);
  // Держим актуальную ссылку на callback — иначе loop вызывает старую closure.
  onFrameRef.current = onFrame;
  const rafRef = useRef<number | null>(null);
  const [tick, setTick] = useState(0);

  const ensureRunning = useCallback(() => {
    if (rafRef.current !== null) return;
    const loop = () => {
      const alive = onFrameRef.current();
      setTick(t => t + 1);
      if (alive) {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  // Останов rAF при размонтировании — иначе loop держит ref на закрытый
  // компонент и вызывает setTick после unmount (warning + утечка).
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, []);

  return { ensureRunning, tick };
}
