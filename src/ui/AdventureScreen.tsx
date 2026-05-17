import { useEffect, useMemo, useRef, useState } from "react";

// Локальный импорт для удобства.
import { ARTIFACTS as ARTIFACTS_LOCAL } from "../game/data/artifacts";
import { FACTION_META } from "../game/data/factions";
import { UNITS as UNITS_LOCAL } from "../game/data/units";
import { useGame } from "../game/store";
import type { Coord, Hero, ResourceBag, Tile } from "../game/types";
import {
  getEffectiveKnowledge,
  getEffectiveMaxMana,
  getEffectiveSpellPower,
  getHeroBonus,
} from "../game/utils/heroBonus";
import { dailyIncomeFor } from "../game/utils/income";
import { findPath, isPassable, pathCost, stepCost } from "../game/utils/pathfind";
import { RESOURCE_ICONS, RESOURCE_NAMES } from "../game/utils/resources";
import { computeVisibleTiles } from "../game/utils/visibility";
import { computeDanger } from "../game/utils/zoc";
import { getTerrainBaseColor, getTerrainTile } from "./terrainPatterns";

const TILE_SIZE = 32;
// Сколько клеток «воздуха» можно прокрутить за реальные границы карты,
// чтобы содержимое не упиралось в края экрана и боковую панель.
const EDGE_PADDING_TILES = 5;

const TERRAIN_COLOR: Record<string, string> = {
  grass: "#3a5a2a",
  dirt: "#6b4a2a",
  sand: "#c8a86a",
  snow: "#d8d8e0",
  forest: "#1a3a1a",
  mountain: "#5a4a3a",
  water: "#2a4a8a",
  lava: "#a02a10",
  rough: "#7a6a4a",
};

export function AdventureScreen() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const map = useGame(s => s.map);
  const heroes = useGame(s => s.heroes);
  const towns = useGame(s => s.towns);
  const players = useGame(s => s.players);
  const activePlayerId = useGame(s => s.activePlayerId);
  const selectedHeroId = useGame(s => s.selectedHeroId);
  const day = useGame(s => s.day);
  const week = useGame(s => s.week);
  const month = useGame(s => s.month);
  const log = useGame(s => s.log);

  const moveHeroTo = useGame(s => s.moveHeroTo);
  const selectHero = useGame(s => s.selectHero);
  const endTurn = useGame(s => s.endTurn);
  const openTown = useGame(s => s.openTown);

  const [camera, setCamera] = useState<Coord>({ x: 0, y: 0 });
  const [hoverPath, setHoverPath] = useState<Coord[] | null>(null);
  const [hoverTile, setHoverTile] = useState<Coord | null>(null);
  // Drag-панорамирование средней/правой кнопкой. Храним в ref, чтобы не плодить ре-рендеры.
  const panRef = useRef<{ startX: number; startY: number; camX: number; camY: number } | null>(null);

  const activePlayer = players[activePlayerId];
  // Туман войны рисуем с точки зрения первого игрока-человека, чтобы при ходе ИИ
  // карта не «перепрыгивала» на чужие тайлы.
  const humanId = Object.values(players).find(p => p.isHuman)?.id ?? activePlayerId;
  const humanPlayer = players[humanId];
  const revealed = humanPlayer?.revealed ?? {};
  const income = useMemo(
    () => (activePlayer ? dailyIncomeFor(useGame.getState(), activePlayer.id) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activePlayer, towns, players],
  );
  const visible = useMemo(
    () => computeVisibleTiles(useGame.getState(), humanId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [heroes, towns, players, humanId],
  );
  const danger = useMemo(
    () => (map ? computeDanger(map, heroes, activePlayerId) : { cells: new Set<string>(), sources: new Set<string>() }),
    [map, heroes, activePlayerId],
  );

  // Границы камеры с учётом паддинга по краям. Возвращает [min, max] для оси.
  function cameraRange(axisSize: number, viewportSize: number): [number, number] {
    const pad = EDGE_PADDING_TILES * TILE_SIZE;
    const min = -pad;
    const max = Math.max(min, axisSize * TILE_SIZE - viewportSize + pad);
    return [min, max];
  }

  function clampCamera(cam: Coord): Coord {
    const c = canvasRef.current;
    if (!c || !map) return cam;
    const [minX, maxX] = cameraRange(map.width, c.width);
    const [minY, maxY] = cameraRange(map.height, c.height);
    return {
      x: Math.max(minX, Math.min(maxX, cam.x)),
      y: Math.max(minY, Math.min(maxY, cam.y)),
    };
  }

  // Центрируем камеру на выбранном герое при первом монтировании / смене героя.
  useEffect(() => {
    if (!map) return;
    const hero = selectedHeroId ? heroes[selectedHeroId] : null;
    if (hero && containerRef.current) {
      const ww = containerRef.current.clientWidth;
      const hh = containerRef.current.clientHeight;
      setCamera(clampCamera({ x: hero.pos.x * TILE_SIZE - ww / 2, y: hero.pos.y * TILE_SIZE - hh / 2 }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedHeroId, map]);

  // Рендер карты.
  useEffect(() => {
    if (!map || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    drawMap(
      ctx,
      map.tiles,
      map,
      heroes,
      towns,
      players,
      camera,
      hoverPath,
      hoverTile,
      selectedHeroId,
      revealed,
      visible,
      danger,
    );
  }, [map, heroes, towns, players, camera, hoverPath, hoverTile, selectedHeroId, revealed, visible, danger]);

  // Автоскролл лога вниз при появлении новых записей.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  // Размер canvas.
  useEffect(() => {
    function fit() {
      const c = canvasRef.current;
      const cont = containerRef.current;
      if (!c || !cont) return;
      c.width = cont.clientWidth;
      c.height = cont.clientHeight;
      // Перерисовать.
      if (map) {
        const ctx = c.getContext("2d");
        if (ctx)
          drawMap(
            ctx,
            map.tiles,
            map,
            heroes,
            towns,
            players,
            camera,
            hoverPath,
            hoverTile,
            selectedHeroId,
            revealed,
            visible,
            danger,
          );
      }
    }
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [map, heroes, towns, players, camera, hoverPath, hoverTile, selectedHeroId, revealed, visible, danger]);

  if (!map) return null;

  function clickToTile(ev: React.MouseEvent): Coord | null {
    const rect = canvasRef.current!.getBoundingClientRect();
    const cx = ev.clientX - rect.left + camera.x;
    const cy = ev.clientY - rect.top + camera.y;
    const x = Math.floor(cx / TILE_SIZE);
    const y = Math.floor(cy / TILE_SIZE);
    if (x < 0 || y < 0 || x >= map!.width || y >= map!.height) return null;
    return { x, y };
  }

  // Перевод курсора в координаты карты для минимапа, или null если вне зоны.
  function minimapTileAt(ev: React.MouseEvent): Coord | null {
    const c = canvasRef.current;
    if (!c || !map) return null;
    const rect = c.getBoundingClientRect();
    const cx = ev.clientX - rect.left;
    const cy = ev.clientY - rect.top;
    const mm = getMinimapBounds(map.width, map.height, c.width, c.height);
    if (cx < mm.ox || cx >= mm.ox + mm.mmW) return null;
    if (cy < mm.oy || cy >= mm.oy + mm.mmH) return null;
    return { x: (cx - mm.ox) / mm.px, y: (cy - mm.oy) / mm.px };
  }

  function centerCameraOnTile(tx: number, ty: number) {
    const c = canvasRef.current;
    if (!c || !map) return;
    setCamera(clampCamera({ x: tx * TILE_SIZE - c.width / 2, y: ty * TILE_SIZE - c.height / 2 }));
  }

  function handleMouseMove(ev: React.MouseEvent) {
    // Drag-панорамирование средней/правой кнопкой — двигаем камеру за курсором.
    if (panRef.current && map) {
      const dx = ev.clientX - panRef.current.startX;
      const dy = ev.clientY - panRef.current.startY;
      setCamera(clampCamera({ x: panRef.current.camX - dx, y: panRef.current.camY - dy }));
      return;
    }
    // Drag по минимапу с зажатой левой кнопкой.
    if (ev.buttons === 1) {
      const mm = minimapTileAt(ev);
      if (mm) {
        centerCameraOnTile(mm.x, mm.y);
        return;
      }
    }
    const t = clickToTile(ev);
    if (!t) return;
    setHoverTile(t);
    if (!selectedHeroId) {
      setHoverPath(null);
      return;
    }
    const hero = heroes[selectedHeroId];
    if (!hero || hero.ownerId !== activePlayerId) {
      setHoverPath(null);
      return;
    }
    const path = findPath(map!, hero.pos, t, {
      revealed,
      dangerCells: danger.cells,
      dangerSources: danger.sources,
    });
    setHoverPath(path);
  }

  function handleClick(ev: React.MouseEvent) {
    // Клик в зоне миникарты — просто центрирование, не трогаем выбор героя/город.
    const mm = minimapTileAt(ev);
    if (mm) {
      centerCameraOnTile(mm.x, mm.y);
      return;
    }
    const t = clickToTile(ev);
    if (!t) return;
    const tile = map!.tiles[t.y * map!.width + t.x];
    const selectedHero = selectedHeroId ? heroes[selectedHeroId] : null;
    const canMoveSelected = selectedHero && selectedHero.ownerId === activePlayerId;

    // Клик по герою на этой клетке (герои лежат не в map.objects, а в state.heroes).
    const heroHere = Object.values(heroes).find(h => h.pos.x === t.x && h.pos.y === t.y);
    if (heroHere && heroHere.ownerId === activePlayerId) {
      // Свой союзный герой и выбран другой свой смежный герой — открыть meeting.
      if (selectedHero && selectedHero.id !== heroHere.id) {
        if (useGame.getState().openHeroMeeting(heroHere.id)) return;
      }
      selectHero(heroHere.id);
      return;
    }

    if (tile.objectId) {
      // Клик по своему городу.
      const tw = towns[tile.objectId];
      if (tw && tw.ownerId === activePlayerId) {
        const heroOnTown = selectedHero && selectedHero.pos.x === tw.pos.x && selectedHero.pos.y === tw.pos.y;
        // Если выбран герой и он ещё не в этом городе — двигаемся к городу;
        // при входе на клетку UI откроется автоматически из interactWithObject.
        if (canMoveSelected && !heroOnTown) {
          moveHeroTo(t);
          return;
        }
        // Иначе (нет выбранного героя или он уже в городе) — открываем UI напрямую.
        openTown(tw.id);
        return;
      }
    }
    // Любая другая клетка — двигаем выбранного героя.
    if (canMoveSelected) moveHeroTo(t);
  }

  function handleMouseDown(ev: React.MouseEvent) {
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

  function handleMouseUp() {
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
  }, [map]);

  // Прокрутка карты клавишами.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const step = 64;
      if (e.key === "ArrowLeft") setCamera(c => clampCamera({ x: c.x - step, y: c.y }));
      if (e.key === "ArrowRight") setCamera(c => clampCamera({ x: c.x + step, y: c.y }));
      if (e.key === "ArrowUp") setCamera(c => clampCamera({ x: c.x, y: c.y - step }));
      if (e.key === "ArrowDown") setCamera(c => clampCamera({ x: c.x, y: c.y + step }));
      if (e.key === "Enter") endTurn();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [map]);

  const playerHeroes = activePlayer ? activePlayer.heroIds.map(id => heroes[id]).filter(Boolean) : [];
  const playerTowns = activePlayer ? activePlayer.townIds.map(id => towns[id]).filter(Boolean) : [];

  return (
    <div className="adventure">
      <div className="top-bar">
        <span className="day">
          📅 Месяц {month}, Неделя {((week - 1) % 4) + 1}, День {((day - 1) % 7) + 1}
        </span>
        <span style={{ color: activePlayer?.color }}>● {activePlayer?.name}</span>
        {activePlayer && !activePlayer.isHuman && <span style={{ color: "var(--accent)" }}>(ход ИИ…)</span>}
        <div className="res-bar">
          {(Object.keys(activePlayer?.resources ?? {}) as Array<keyof ResourceBag>).map(k => {
            const inc = income?.[k] ?? 0;
            return (
              <div className="res-item" key={k} title={`${RESOURCE_NAMES[k]}${inc ? ` · +${inc}/день` : ""}`}>
                <span>{RESOURCE_ICONS[k]}</span>
                <span>{activePlayer!.resources[k]}</span>
                {inc > 0 && <span style={{ color: "var(--good)", fontSize: 11, marginLeft: 2 }}>(+{inc})</span>}
              </div>
            );
          })}
        </div>
        <button onClick={() => useGame.getState().goToMenu()}>Меню</button>
      </div>

      <div className="map-area" ref={containerRef}>
        <canvas
          ref={canvasRef}
          className="map-canvas"
          onClick={handleClick}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onContextMenu={e => e.preventDefault()}
        />
        {hoverTile && revealed[`${hoverTile.x},${hoverTile.y}`] === true && (
          <MapTooltip
            tile={hoverTile}
            map={map}
            heroes={heroes}
            towns={towns}
            players={players}
            camera={camera}
            isVisibleNow={visible.has(`${hoverTile.x},${hoverTile.y}`)}
          />
        )}
        {hoverPath && hoverPath.length > 0 && selectedHeroId && heroes[selectedHeroId] && (
          <PathCostBadge
            total={pathCost(hoverPath, heroes[selectedHeroId].pos)}
            mp={heroes[selectedHeroId].movePoints}
          />
        )}
      </div>

      <div className="side-panel">
        <h3>🛡 ГЕРОИ ({playerHeroes.length})</h3>
        {playerHeroes.length === 0 && <div style={{ color: "var(--text-dim)", fontSize: 12 }}>Нет героев</div>}
        {playerHeroes.map(h => (
          <div
            key={h.id}
            className={`hero-card ${h.id === selectedHeroId ? "selected" : ""}`}
            onClick={() => selectHero(h.id)}
            onDoubleClick={() => useGame.getState().openHero(h.id)}
            title="Клик — выбрать, двойной клик — открыть"
          >
            <div className="row">
              <span className="icon">{h.icon}</span>
              <div style={{ flex: 1 }}>
                <div className="name">{h.name}</div>
                <div className="mp">
                  ⚡ {h.movePoints} MP · ⭐ ур. {h.level}
                </div>
              </div>
              <button
                onClick={e => {
                  e.stopPropagation();
                  useGame.getState().openHero(h.id);
                }}
                style={{ padding: "4px 8px", fontSize: 12 }}
                title="Открыть"
              >
                📜
              </button>
            </div>
            <HeroStatsLine hero={h} />
            <ArmyDisplay hero={h} />
          </div>
        ))}

        <h3 style={{ marginTop: 8 }}>🏰 ГОРОДА ({playerTowns.length})</h3>
        {playerTowns.length === 0 && <div style={{ color: "var(--text-dim)", fontSize: 12 }}>Нет городов</div>}
        {playerTowns.map(t => (
          <div
            key={t.id}
            className={`town-card ${t.builtToday ? "built-today" : "build-ready"}`}
            onClick={() => openTown(t.id)}
          >
            <div className="row">
              <span className="icon">{FACTION_META[t.faction].icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: "bold" }}>{t.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Построено: {t.built.length}</div>
              </div>
              <span className="town-build-flag" title={t.builtToday ? "Сегодня уже строили" : "Можно построить здание"}>
                {t.builtToday ? "🔒" : "🔨"}
              </span>
            </div>
          </div>
        ))}

        <div className="log-panel" ref={logRef}>
          {log.map((l, i) => (
            <div key={i} className="entry">
              {l}
            </div>
          ))}
        </div>

        <button className="end-turn-btn" onClick={() => endTurn()} disabled={!activePlayer?.isHuman}>
          Завершить ход (↵)
        </button>
      </div>
    </div>
  );
}

function HeroStatsLine({ hero }: { hero: Hero }) {
  const bonus = getHeroBonus(hero);
  const sp = getEffectiveSpellPower(hero);
  const know = getEffectiveKnowledge(hero);
  const maxMana = getEffectiveMaxMana(hero);
  return (
    <div
      style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4, display: "flex", gap: 10, flexWrap: "wrap" }}
      title="Атака / Защита / Сила магии / Знания · Мана (с учётом артефактов)"
    >
      <span>⚔️ {bonus.attack}</span>
      <span>🛡️ {bonus.defense}</span>
      <span>🔮 {sp}</span>
      <span>📚 {know}</span>
      <span>
        💧 {hero.mana}/{maxMana}
      </span>
    </div>
  );
}

function ArmyDisplay({ hero }: { hero: Hero }) {
  return (
    <div className="army-row">
      {Array.from({ length: 7 }).map((_, idx) => {
        const stack = hero.army[idx];
        if (!stack)
          return (
            <div key={idx} className="army-slot empty">
              —
            </div>
          );
        const unit = UNITS_LOCAL[stack.unitId];
        return (
          <div key={idx} className="army-slot" title={unit?.name ?? stack.unitId}>
            <span className="icon">{unit?.icon ?? "?"}</span>
            <span>{stack.count}</span>
          </div>
        );
      })}
    </div>
  );
}

function drawMap(
  ctx: CanvasRenderingContext2D,
  tiles: Tile[],
  map: NonNullable<ReturnType<typeof useGame.getState>["map"]>,
  heroes: Record<string, Hero>,
  towns: Record<string, ReturnType<typeof useGame.getState>["towns"][string]>,
  players: Record<string, ReturnType<typeof useGame.getState>["players"][string]>,
  camera: Coord,
  hoverPath: Coord[] | null,
  hoverTile: Coord | null,
  selectedHeroId: string | null,
  revealed: Record<string, true>,
  visible: Set<string>,
  danger: { cells: Set<string>; sources: Set<string> },
) {
  const W = map.width;
  const H = map.height;
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, cw, ch);

  const startX = Math.max(0, Math.floor(camera.x / TILE_SIZE));
  const endX = Math.min(W, Math.ceil((camera.x + cw) / TILE_SIZE));
  const startY = Math.max(0, Math.floor(camera.y / TILE_SIZE));
  const endY = Math.min(H, Math.ceil((camera.y + ch) / TILE_SIZE));

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const t = tiles[y * W + x];
      const sx = x * TILE_SIZE - camera.x;
      const sy = y * TILE_SIZE - camera.y;
      const key = `${x},${y}`;
      const isRevealed = revealed[key] === true;
      const isVisible = visible.has(key);
      if (!isRevealed) {
        // Тайл никогда не видели — оставляем чёрный фон.
        continue;
      }
      const tile = getTerrainTile(t.terrain);
      if (tile) {
        ctx.drawImage(tile, sx, sy, TILE_SIZE, TILE_SIZE);
      } else {
        ctx.fillStyle = TERRAIN_COLOR[t.terrain] ?? "#444";
        ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
      }
      ctx.strokeStyle = "rgba(0,0,0,0.18)";
      ctx.strokeRect(sx + 0.5, sy + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
      if (!isVisible) {
        // «Память» — затемнение поверх террейна.
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
      }
    }
  }

  // Объекты карты — только если тайл когда-либо видели.
  for (const obj of Object.values(map.objects)) {
    if (revealed[`${obj.pos.x},${obj.pos.y}`] !== true) continue;
    const sx = obj.pos.x * TILE_SIZE - camera.x;
    const sy = obj.pos.y * TILE_SIZE - camera.y;
    if (sx < -TILE_SIZE || sy < -TILE_SIZE || sx > cw || sy > ch) continue;
    const cx = sx + TILE_SIZE / 2;
    const cy = sy + TILE_SIZE / 2;
    if (obj.kind === "dwelling") {
      const tw = towns[obj.id];
      const ownerColor = tw?.ownerId ? (players[tw.ownerId]?.color ?? "#888") : "#888";
      drawBuildingPlaque(ctx, sx, sy, ownerColor);
      drawEmoji(ctx, obj.icon, cx, cy, 24);
      if (tw?.builtToday) drawBuiltTodayBadge(ctx, sx, sy);
    } else if (obj.kind === "mine") {
      if (obj.ownerId) {
        drawBuildingPlaque(ctx, sx, sy, players[obj.ownerId]?.color ?? "#888");
      } else {
        drawObjectShadow(ctx, cx, cy);
      }
      drawEmoji(ctx, obj.icon, cx, cy, 22);
    } else if (obj.kind === "resource" && obj.resource) {
      // Берём текущую иконку из общей таблицы — старые сейвы могут хранить устаревший emoji.
      drawObjectShadow(ctx, cx, cy);
      drawEmoji(ctx, RESOURCE_ICONS[obj.resource], cx, cy, 22);
    } else {
      drawObjectShadow(ctx, cx, cy);
      drawEmoji(ctx, obj.icon, cx, cy, 22);
    }
  }

  // Герои — только если стоят на видимой прямо сейчас клетке.
  for (const h of Object.values(heroes)) {
    if (!visible.has(`${h.pos.x},${h.pos.y}`)) continue;
    const sx = h.pos.x * TILE_SIZE - camera.x;
    const sy = h.pos.y * TILE_SIZE - camera.y;
    if (sx < -TILE_SIZE || sy < -TILE_SIZE || sx > cw || sy > ch) continue;
    const owner = players[h.ownerId];
    const color = owner?.color ?? "#888";
    const cx = sx + TILE_SIZE / 2;
    const cy = sy + TILE_SIZE / 2;
    drawHeroToken(ctx, cx, cy, color, h.id === selectedHeroId);
    drawEmoji(ctx, h.icon, cx, cy, 22);
  }

  // Путь.
  if (hoverPath && hoverPath.length > 0 && selectedHeroId) {
    const hero = heroes[selectedHeroId];
    if (hero) {
      let prev = hero.pos;
      let mp = hero.movePoints;
      for (const p of hoverPath) {
        const dx = Math.abs(p.x - prev.x);
        const dy = Math.abs(p.y - prev.y);
        const cost = stepCost(dx, dy);
        const reachable = mp >= cost;
        mp -= cost;
        const sx = p.x * TILE_SIZE - camera.x + TILE_SIZE / 2;
        const sy = p.y * TILE_SIZE - camera.y + TILE_SIZE / 2;
        ctx.fillStyle = reachable ? "rgba(255, 220, 80, 0.7)" : "rgba(255, 80, 80, 0.6)";
        ctx.beginPath();
        ctx.arc(sx, sy, 5, 0, Math.PI * 2);
        ctx.fill();
        prev = p;
      }
    }
  }

  if (hoverTile) {
    const sx = hoverTile.x * TILE_SIZE - camera.x;
    const sy = hoverTile.y * TILE_SIZE - camera.y;
    ctx.strokeStyle = "#ffd966";
    ctx.lineWidth = 2;
    ctx.strokeRect(sx + 1, sy + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    ctx.lineWidth = 1;
  }

  // Подсветка охраняющих юнитов:
  // - hover над danger-cell (под охраной) → красные обводки соседних source-тайлов;
  // - hover над самим source (монстр/вражеский герой) → подсветка всех его danger cells.
  if (hoverTile) {
    const hKey = `${hoverTile.x},${hoverTile.y}`;
    const guards: Coord[] = [];
    const guardedCells: Coord[] = [];
    if (danger.cells.has(hKey)) {
      for (const srcKey of danger.sources) {
        const [gx, gy] = srcKey.split(",").map(Number);
        if (Math.max(Math.abs(gx - hoverTile.x), Math.abs(gy - hoverTile.y)) === 1) {
          guards.push({ x: gx, y: gy });
        }
      }
    } else if (danger.sources.has(hKey)) {
      for (const cellKey of danger.cells) {
        const [cx, cy] = cellKey.split(",").map(Number);
        if (Math.max(Math.abs(cx - hoverTile.x), Math.abs(cy - hoverTile.y)) === 1) {
          guardedCells.push({ x: cx, y: cy });
        }
      }
      guards.push(hoverTile);
    }
    for (const c of guardedCells) {
      const sx = c.x * TILE_SIZE - camera.x;
      const sy = c.y * TILE_SIZE - camera.y;
      ctx.fillStyle = "rgba(220,60,40,0.18)";
      ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
    }
    for (const g of guards) {
      const sx = g.x * TILE_SIZE - camera.x;
      const sy = g.y * TILE_SIZE - camera.y;
      ctx.strokeStyle = "#ff5040";
      ctx.lineWidth = 2.5;
      ctx.strokeRect(sx + 1, sy + 1, TILE_SIZE - 2, TILE_SIZE - 2);
      ctx.lineWidth = 1;
    }
  }

  // Минимап в правом нижнем углу.
  drawMinimap(ctx, map, heroes, towns, players, camera, cw, ch, revealed, visible);
  // Подавим warning о неиспользованном isPassable.
  void isPassable;
}

// Жетон героя: тёмный круг под цветным фоном владельца с радиальным градиентом,
// тонкой обводкой, тенью под собой и пульсирующей подсветкой для выбранного.
function drawHeroToken(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string, isSelected: boolean) {
  const r = TILE_SIZE / 2 - 3;
  // Тень.
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + r - 2, r - 2, r / 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Основной круг — радиальный градиент.
  const grad = ctx.createRadialGradient(cx - r / 3, cy - r / 3, 0, cx, cy, r);
  grad.addColorStop(0, lighten(color, 0.35));
  grad.addColorStop(1, darken(color, 0.25));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  // Обводка.
  ctx.strokeStyle = darken(color, 0.5);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  if (isSelected) {
    ctx.strokeStyle = "#ffd966";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 1, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.lineWidth = 1;
}

// Подложка под город/шахту: чуть приподнятый квадрат с градиентом-«крышей»
// и тенью под собой.
function drawBuildingPlaque(ctx: CanvasRenderingContext2D, sx: number, sy: number, color: string) {
  const pad = 2;
  const grad = ctx.createLinearGradient(sx, sy, sx, sy + TILE_SIZE);
  grad.addColorStop(0, lighten(color, 0.25));
  grad.addColorStop(1, darken(color, 0.3));
  // Тень.
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(sx + pad + 1, sy + TILE_SIZE - 4, TILE_SIZE - 2 * pad - 2, 3);
  ctx.restore();
  // Корпус.
  ctx.fillStyle = grad;
  ctx.fillRect(sx + pad, sy + pad, TILE_SIZE - 2 * pad, TILE_SIZE - 2 * pad);
  ctx.strokeStyle = darken(color, 0.55);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(sx + pad + 0.5, sy + pad + 0.5, TILE_SIZE - 2 * pad - 1, TILE_SIZE - 2 * pad - 1);
  ctx.lineWidth = 1;
}

// Лёгкая овальная тень под объектом без подложки (ресурсы, артефакты, сундуки).
// Маркер «здание сегодня уже построено» — небольшой кружок в правом верхнем углу
// тайла города с «✓». Цель — на карте сразу видно, что сегодня тут больше нельзя строить.
function drawBuiltTodayBadge(ctx: CanvasRenderingContext2D, sx: number, sy: number) {
  const x = sx + TILE_SIZE - 6;
  const y = sy + 6;
  ctx.fillStyle = "rgba(0,0,0,0.85)";
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#5fa850";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.fillStyle = "#5fa850";
  ctx.font = "bold 9px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("✓", x, y + 1);
}

function drawObjectShadow(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + TILE_SIZE / 3, TILE_SIZE / 3, TILE_SIZE / 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Простые light/dark манипуляции с HEX — без зависимостей на color libs.
function lighten(hex: string, amount: number): string {
  return mixHex(hex, "#ffffff", amount);
}
function darken(hex: string, amount: number): string {
  return mixHex(hex, "#000000", amount);
}
function mixHex(a: string, b: string, t: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  const r = Math.round(pa[0] * (1 - t) + pb[0] * t);
  const g = Math.round(pa[1] * (1 - t) + pb[1] * t);
  const bl = Math.round(pa[2] * (1 - t) + pb[2] * t);
  return `rgb(${r}, ${g}, ${bl})`;
}
function parseHex(s: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(s);
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  }
  return [128, 128, 128];
}

function drawEmoji(ctx: CanvasRenderingContext2D, txt: string, cx: number, cy: number, size: number) {
  ctx.font = `${size}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";
  ctx.fillText(txt, cx, cy);
}

// Размеры/позиция минимапа — используются и при отрисовке, и при ловле кликов.
function getMinimapBounds(mapWidth: number, mapHeight: number, cw: number, ch: number) {
  const mmSize = 160;
  const px = Math.max(1, Math.floor(mmSize / Math.max(mapWidth, mapHeight)));
  const mmW = px * mapWidth;
  const mmH = px * mapHeight;
  const ox = cw - mmW - 12;
  const oy = ch - mmH - 12;
  return { px, mmW, mmH, ox, oy };
}

function drawMinimap(
  ctx: CanvasRenderingContext2D,
  map: NonNullable<ReturnType<typeof useGame.getState>["map"]>,
  heroes: Record<string, Hero>,
  towns: Record<string, ReturnType<typeof useGame.getState>["towns"][string]>,
  players: Record<string, ReturnType<typeof useGame.getState>["players"][string]>,
  camera: Coord,
  cw: number,
  ch: number,
  revealed: Record<string, true>,
  visible: Set<string>,
) {
  const { px, mmW, mmH, ox, oy } = getMinimapBounds(map.width, map.height, cw, ch);
  // Контейнер минимапа: подложка + золотая обводка, чтобы не сливалась с тёмным буфером карты.
  ctx.fillStyle = "rgba(0,0,0,0.78)";
  ctx.fillRect(ox - 6, oy - 6, mmW + 12, mmH + 12);
  ctx.strokeStyle = "#d4a64a";
  ctx.lineWidth = 2;
  ctx.strokeRect(ox - 6 + 0.5, oy - 6 + 0.5, mmW + 12 - 1, mmH + 12 - 1);
  ctx.lineWidth = 1;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const key = `${x},${y}`;
      if (revealed[key] !== true) {
        ctx.fillStyle = "#000";
        ctx.fillRect(ox + x * px, oy + y * px, px, px);
        continue;
      }
      const t = map.tiles[y * map.width + x];
      ctx.fillStyle = t.passable ? getTerrainBaseColor(t.terrain) : "#222";
      ctx.fillRect(ox + x * px, oy + y * px, px, px);
      if (!visible.has(key)) {
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(ox + x * px, oy + y * px, px, px);
      }
    }
  }
  // Города, шахты и герои на минимапе — с учётом тумана.
  for (const tw of Object.values(towns)) {
    if (revealed[`${tw.pos.x},${tw.pos.y}`] !== true) continue;
    const owner = tw.ownerId ? (players[tw.ownerId]?.color ?? "#fff") : "#999";
    ctx.fillStyle = owner;
    ctx.fillRect(ox + tw.pos.x * px - 1, oy + tw.pos.y * px - 1, px + 2, px + 2);
  }
  for (const obj of Object.values(map.objects)) {
    if (obj.kind !== "mine" || !obj.ownerId) continue;
    if (revealed[`${obj.pos.x},${obj.pos.y}`] !== true) continue;
    ctx.fillStyle = players[obj.ownerId]?.color ?? "#fff";
    ctx.fillRect(ox + obj.pos.x * px, oy + obj.pos.y * px, px, px);
  }
  for (const h of Object.values(heroes)) {
    if (!visible.has(`${h.pos.x},${h.pos.y}`)) continue;
    ctx.fillStyle = players[h.ownerId]?.color ?? "#fff";
    ctx.fillRect(ox + h.pos.x * px, oy + h.pos.y * px, px, px);
  }
  // Рамка вьюпорта — клипуем к границам карты, иначе из-за паддинга
  // рамка может выходить за пределы минимапа.
  const wx0 = Math.max(0, camera.x / TILE_SIZE);
  const wy0 = Math.max(0, camera.y / TILE_SIZE);
  const wx1 = Math.min(map.width, (camera.x + cw) / TILE_SIZE);
  const wy1 = Math.min(map.height, (camera.y + ch) / TILE_SIZE);
  if (wx1 > wx0 && wy1 > wy0) {
    ctx.strokeStyle = "#ffd966";
    ctx.strokeRect(ox + wx0 * px, oy + wy0 * px, (wx1 - wx0) * px, (wy1 - wy0) * px);
  }
}

function PathCostBadge({ total, mp }: { total: number; mp: number }) {
  const enough = total <= mp;
  return (
    <div className="path-cost-badge" style={{ color: enough ? "var(--gold)" : "var(--danger)" }}>
      Путь: {total} MP <span style={{ color: "var(--text-dim)" }}>(доступно {mp})</span>
    </div>
  );
}

function MapTooltip({
  tile,
  map,
  heroes,
  towns,
  players,
  camera,
  isVisibleNow,
}: {
  tile: Coord;
  map: NonNullable<ReturnType<typeof useGame.getState>["map"]>;
  heroes: Record<string, Hero>;
  towns: Record<string, ReturnType<typeof useGame.getState>["towns"][string]>;
  players: Record<string, ReturnType<typeof useGame.getState>["players"][string]>;
  camera: Coord;
  isVisibleNow: boolean;
}) {
  // Сначала ищем героя на этой клетке (только если клетка сейчас видна).
  const hero = isVisibleNow ? Object.values(heroes).find(h => h.pos.x === tile.x && h.pos.y === tile.y) : null;
  const t = map.tiles[tile.y * map.width + tile.x];
  const obj = t.objectId ? map.objects[t.objectId] : null;

  const lines: { title: string; sub?: string }[] = [];
  if (hero) {
    const ow = players[hero.ownerId];
    lines.push({ title: `${hero.icon} ${hero.name}`, sub: `${ow?.name ?? "—"} · ${hero.faction}` });
    const totalUnits = hero.army.reduce((acc, s) => acc + s.count, 0);
    lines.push({ title: "Армия", sub: `${totalUnits} существ` });
  } else if (obj) {
    if (obj.kind === "monster" && obj.unitId && obj.unitCount) {
      const u = UNITS_LOCAL[obj.unitId];
      lines.push({ title: `${u.icon} ${u.name}`, sub: countLabel(obj.unitCount) });
      lines.push({ title: "Бой!", sub: `Атк ${u.attack} / Защ ${u.defense} / HP ${u.hp}` });
    } else if (obj.kind === "dwelling") {
      const tw = towns[obj.id];
      const ow = tw?.ownerId ? players[tw.ownerId] : null;
      lines.push({ title: `${obj.icon} ${tw?.name ?? "Город"}`, sub: ow ? `Владелец: ${ow.name}` : "Нейтральный" });
    } else if (obj.kind === "resource" && obj.resource) {
      lines.push({ title: `${RESOURCE_ICONS[obj.resource]} ${RESOURCE_NAMES[obj.resource]}`, sub: `+${obj.amount}` });
    } else if (obj.kind === "mine" && obj.mineResource) {
      const ow = obj.ownerId ? players[obj.ownerId] : null;
      lines.push({
        title: `${obj.icon} Шахта (${RESOURCE_NAMES[obj.mineResource]})`,
        sub: ow ? `Владелец: ${ow.name}` : "Нейтральная",
      });
    } else if (obj.kind === "artifact" && obj.artifactId) {
      const a = ARTIFACTS_LOCAL[obj.artifactId];
      lines.push({ title: `${a.icon} ${a.name}`, sub: a.description });
    } else if (obj.kind === "chest") {
      lines.push({ title: "🎁 Сундук", sub: "Неизвестное содержимое" });
    } else if (obj.kind === "tree") {
      lines.push({ title: "🌲 Лес", sub: "Непроходимо" });
    } else if (obj.kind === "mountain") {
      lines.push({ title: "⛰️ Горы", sub: "Непроходимо" });
    }
  } else {
    lines.push({ title: `Поле (${t.terrain})` });
  }

  // Позиционирование: справа-снизу от курсора в координатах map-area.
  const left = Math.min(tile.x * TILE_SIZE - camera.x + TILE_SIZE + 8, 99999);
  const top = tile.y * TILE_SIZE - camera.y + TILE_SIZE / 2;

  return (
    <div className="map-tooltip" style={{ left, top }}>
      {lines.map((l, i) => (
        <div key={i}>
          <div className="tt-title">{l.title}</div>
          {l.sub && <div className="tt-sub">{l.sub}</div>}
        </div>
      ))}
    </div>
  );
}

// Грубая шкала количества — как в HoMM3, чтобы не выдавать точные числа,
// плюс диапазон в скобках для понимания «вилки».
function countLabel(n: number): string {
  if (n <= 4) return "Несколько (1–4)";
  if (n <= 9) return "Стая (5–9)";
  if (n <= 19) return "Толпа (10–19)";
  if (n <= 49) return "Орда (20–49)";
  if (n <= 99) return "Полчище (50–99)";
  return "Легион (100+)";
}
