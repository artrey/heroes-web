import { useCallback, useEffect, useRef, useState } from "react";

import type { Coord } from "../../game/types";

interface UseCameraArgs {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  // Если null — карты ещё нет (главное меню/новая игра), хук работает в режиме
  // no-op: state хранится, но clampCamera ничего не клампит.
  map: { width: number; height: number } | null;
  tileSize: number;
  // Сколько клеток «воздуха» можно прокрутить за реальные границы карты, чтобы
  // содержимое не упиралось в края экрана и боковую панель.
  edgePaddingTiles: number;
  // Шаг arrow-keys и колеса без shift'а, в пикселях. Опционально.
  keyStep?: number;
}

interface PanState {
  startX: number;
  startY: number;
  camX: number;
  camY: number;
}

// Камера карты приключений — всё, что относится к перемещению вьюпорта:
// state, ограничения (clamp), drag-pan мышью, скролл колесом, перемещение
// стрелочками и явное центрирование на клетке (нужно minimap-drag'у и
// центрированию на выбранного героя).
//
// Hover/click по карте — НЕ часть камеры; они остаются в AdventureScreen.
// Если drag-pan активен в moment'е mouse-move, хук сам сдвигает камеру и
// возвращает `true` — компонент должен пропустить обычную hover-логику.
export function useCamera({ canvasRef, map, tileSize, edgePaddingTiles, keyStep = 64 }: UseCameraArgs): {
  camera: Coord;
  setCamera: React.Dispatch<React.SetStateAction<Coord>>;
  clampCamera: (cam: Coord) => Coord;
  centerCameraOnTile: (tx: number, ty: number) => void;
  panMouseDown: (ev: React.MouseEvent) => void;
  panMouseMove: (ev: React.MouseEvent) => boolean;
  panMouseUp: () => void;
} {
  const [camera, setCamera] = useState<Coord>({ x: 0, y: 0 });
  const panRef = useRef<PanState | null>(null);

  const clampCamera = useCallback(
    (cam: Coord): Coord => {
      const c = canvasRef.current;
      if (!c || !map) return cam;
      const pad = edgePaddingTiles * tileSize;
      const minX = -pad;
      const minY = -pad;
      const maxX = Math.max(minX, map.width * tileSize - c.width + pad);
      const maxY = Math.max(minY, map.height * tileSize - c.height + pad);
      return {
        x: Math.max(minX, Math.min(maxX, cam.x)),
        y: Math.max(minY, Math.min(maxY, cam.y)),
      };
    },
    [canvasRef, map, tileSize, edgePaddingTiles],
  );

  const centerCameraOnTile = useCallback(
    (tx: number, ty: number) => {
      const c = canvasRef.current;
      if (!c || !map) return;
      setCamera(clampCamera({ x: tx * tileSize - c.width / 2, y: ty * tileSize - c.height / 2 }));
    },
    [canvasRef, map, tileSize, clampCamera],
  );

  function panMouseDown(ev: React.MouseEvent): void {
    // Средняя или правая кнопка — начинаем drag-панорамирование.
    if (ev.button === 1 || ev.button === 2) {
      ev.preventDefault();
      panRef.current = {
        startX: ev.clientX,
        startY: ev.clientY,
        camX: camera.x,
        camY: camera.y,
      };
    }
  }

  function panMouseMove(ev: React.MouseEvent): boolean {
    if (!panRef.current || !map) return false;
    const dx = ev.clientX - panRef.current.startX;
    const dy = ev.clientY - panRef.current.startY;
    setCamera(clampCamera({ x: panRef.current.camX - dx, y: panRef.current.camY - dy }));
    return true;
  }

  function panMouseUp(): void {
    panRef.current = null;
  }

  // Прокрутка карты колесом. Используем нативный listener с passive: false,
  // чтобы preventDefault действительно блокировал прокрутку страницы.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !map) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      // Shift + вертикальное колесо → горизонтальный скролл (привычка из браузера/GIS).
      // Трекпад уже даёт обе оси сам, не трогаем.
      let dx: number;
      let dy: number;
      if (e.shiftKey && e.deltaX === 0) {
        dx = e.deltaY;
        dy = 0;
      } else {
        dx = e.deltaX;
        dy = e.deltaY;
      }
      setCamera(cam => clampCamera({ x: cam.x + dx, y: cam.y + dy }));
    }
    c.addEventListener("wheel", onWheel, { passive: false });
    return () => c.removeEventListener("wheel", onWheel);
  }, [canvasRef, map, clampCamera]);

  // Прокрутка стрелочками. Enter и другие клавиши — забота вызывающего
  // компонента (это уже не камера).
  useEffect(() => {
    if (!map) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") setCamera(c => clampCamera({ x: c.x - keyStep, y: c.y }));
      else if (e.key === "ArrowRight") setCamera(c => clampCamera({ x: c.x + keyStep, y: c.y }));
      else if (e.key === "ArrowUp") setCamera(c => clampCamera({ x: c.x, y: c.y - keyStep }));
      else if (e.key === "ArrowDown") setCamera(c => clampCamera({ x: c.x, y: c.y + keyStep }));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [map, clampCamera, keyStep]);

  return { camera, setCamera, clampCamera, centerCameraOnTile, panMouseDown, panMouseMove, panMouseUp };
}
