import { useEffect, useMemo, useRef, useState } from "react";

// Локальный импорт для удобства.
import { ARTIFACTS as ARTIFACTS_LOCAL } from "../game/data/artifacts";
import { UNITS as UNITS_LOCAL } from "../game/data/units";
import { useGame } from "../game/store";
import type { Coord, Hero, ResourceBag, Tile } from "../game/types";
import { findPath, isPassable } from "../game/utils/pathfind";
import { RESOURCE_ICONS, RESOURCE_NAMES } from "../game/utils/resources";
import { computeVisibleTiles } from "../game/utils/visibility";

const TILE_SIZE = 32;

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

  const activePlayer = players[activePlayerId];
  // Туман войны рисуем с точки зрения первого игрока-человека, чтобы при ходе ИИ
  // карта не «перепрыгивала» на чужие тайлы.
  const humanId = Object.values(players).find(p => p.isHuman)?.id ?? activePlayerId;
  const humanPlayer = players[humanId];
  const revealed = humanPlayer?.revealed ?? {};
  const visible = useMemo(
    () => computeVisibleTiles(useGame.getState(), humanId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [heroes, towns, players, humanId],
  );

  // Центрируем камеру на выбранном герое при первом монтировании / смене героя.
  useEffect(() => {
    if (!map) return;
    const hero = selectedHeroId ? heroes[selectedHeroId] : null;
    if (hero && containerRef.current) {
      const ww = containerRef.current.clientWidth;
      const hh = containerRef.current.clientHeight;
      setCamera({
        x: Math.max(0, Math.min(map.width * TILE_SIZE - ww, hero.pos.x * TILE_SIZE - ww / 2)),
        y: Math.max(0, Math.min(map.height * TILE_SIZE - hh, hero.pos.y * TILE_SIZE - hh / 2)),
      });
    }
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
    );
  }, [map, heroes, towns, players, camera, hoverPath, hoverTile, selectedHeroId, revealed, visible]);

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
          );
      }
    }
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [map, heroes, towns, players, camera, hoverPath, hoverTile, selectedHeroId, revealed, visible]);

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

  function handleMouseMove(ev: React.MouseEvent) {
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
    const path = findPath(map!, hero.pos, t);
    setHoverPath(path);
  }

  function handleClick(ev: React.MouseEvent) {
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

  // Прокрутка карты колесом / клавишами.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const step = 64;
      if (e.key === "ArrowLeft") setCamera(c => ({ ...c, x: Math.max(0, c.x - step) }));
      if (e.key === "ArrowRight" && map)
        setCamera(c => ({
          ...c,
          x: Math.min(map.width * TILE_SIZE - (containerRef.current?.clientWidth ?? 0), c.x + step),
        }));
      if (e.key === "ArrowUp") setCamera(c => ({ ...c, y: Math.max(0, c.y - step) }));
      if (e.key === "ArrowDown" && map)
        setCamera(c => ({
          ...c,
          y: Math.min(map.height * TILE_SIZE - (containerRef.current?.clientHeight ?? 0), c.y + step),
        }));
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
          📅 Месяц {month}, Неделя {week}, День {day}
        </span>
        <span style={{ color: activePlayer?.color }}>● {activePlayer?.name}</span>
        {activePlayer && !activePlayer.isHuman && <span style={{ color: "var(--accent)" }}>(ход ИИ…)</span>}
        <div className="res-bar">
          {(Object.keys(activePlayer?.resources ?? {}) as Array<keyof ResourceBag>).map(k => (
            <div className="res-item" key={k} title={RESOURCE_NAMES[k]}>
              <span>{RESOURCE_ICONS[k]}</span>
              <span>{activePlayer!.resources[k]}</span>
            </div>
          ))}
        </div>
        <button onClick={() => useGame.getState().goToMenu()}>Меню</button>
      </div>

      <div className="map-area" ref={containerRef}>
        <canvas ref={canvasRef} className="map-canvas" onClick={handleClick} onMouseMove={handleMouseMove} />
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
                <div className="mp">⚡ {Math.floor(h.movePoints / 100)} ходов</div>
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
            <ArmyDisplay hero={h} />
          </div>
        ))}

        <h3 style={{ marginTop: 8 }}>🏰 ГОРОДА ({playerTowns.length})</h3>
        {playerTowns.length === 0 && <div style={{ color: "var(--text-dim)", fontSize: 12 }}>Нет городов</div>}
        {playerTowns.map(t => (
          <div key={t.id} className="town-card" onClick={() => openTown(t.id)}>
            <div className="row">
              <span className="icon">{t.faction === "castle" ? "🏰" : "🏯"}</span>
              <div>
                <div style={{ fontWeight: "bold" }}>{t.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Построено: {t.built.length}</div>
              </div>
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
      ctx.fillStyle = TERRAIN_COLOR[t.terrain] ?? "#444";
      ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
      ctx.strokeStyle = "rgba(0,0,0,0.15)";
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
    if (obj.kind === "dwelling") {
      const tw = towns[obj.id];
      if (tw) {
        const ownerColor = tw.ownerId ? (players[tw.ownerId]?.color ?? "#888") : "#888";
        ctx.fillStyle = ownerColor;
        ctx.fillRect(sx + 2, sy + 2, TILE_SIZE - 4, TILE_SIZE - 4);
      }
      drawEmoji(ctx, obj.icon, sx + TILE_SIZE / 2, sy + TILE_SIZE / 2, 24);
    } else {
      drawEmoji(ctx, obj.icon, sx + TILE_SIZE / 2, sy + TILE_SIZE / 2, 22);
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
    // Фон-флажок.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(sx + TILE_SIZE / 2, sy + TILE_SIZE / 2, TILE_SIZE / 2 - 3, 0, Math.PI * 2);
    ctx.fill();
    // Подсветка выбранного.
    if (h.id === selectedHeroId) {
      ctx.strokeStyle = "#ffd966";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx + TILE_SIZE / 2, sy + TILE_SIZE / 2, TILE_SIZE / 2 - 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    drawEmoji(ctx, h.icon, sx + TILE_SIZE / 2, sy + TILE_SIZE / 2, 22);
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
        const cost = dx !== 0 && dy !== 0 ? 141 : 100;
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

  // Минимап в правом нижнем углу.
  drawMinimap(ctx, map, heroes, towns, players, camera, cw, ch, revealed, visible);
  // Подавим warning о неиспользованном isPassable.
  void isPassable;
}

function drawEmoji(ctx: CanvasRenderingContext2D, txt: string, cx: number, cy: number, size: number) {
  ctx.font = `${size}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";
  ctx.fillText(txt, cx, cy);
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
  const mmSize = 160;
  const px = Math.max(1, Math.floor(mmSize / Math.max(map.width, map.height)));
  const mmW = px * map.width;
  const mmH = px * map.height;
  const ox = cw - mmW - 12;
  const oy = ch - mmH - 12;
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(ox - 4, oy - 4, mmW + 8, mmH + 8);
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const key = `${x},${y}`;
      if (revealed[key] !== true) {
        ctx.fillStyle = "#000";
        ctx.fillRect(ox + x * px, oy + y * px, px, px);
        continue;
      }
      const t = map.tiles[y * map.width + x];
      ctx.fillStyle = t.passable ? (TERRAIN_COLOR[t.terrain] ?? "#444") : "#222";
      ctx.fillRect(ox + x * px, oy + y * px, px, px);
      if (!visible.has(key)) {
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(ox + x * px, oy + y * px, px, px);
      }
    }
  }
  // Города и герои на минимапе — с учётом тумана.
  for (const tw of Object.values(towns)) {
    if (revealed[`${tw.pos.x},${tw.pos.y}`] !== true) continue;
    const owner = tw.ownerId ? (players[tw.ownerId]?.color ?? "#fff") : "#999";
    ctx.fillStyle = owner;
    ctx.fillRect(ox + tw.pos.x * px - 1, oy + tw.pos.y * px - 1, px + 2, px + 2);
  }
  for (const h of Object.values(heroes)) {
    if (!visible.has(`${h.pos.x},${h.pos.y}`)) continue;
    ctx.fillStyle = players[h.ownerId]?.color ?? "#fff";
    ctx.fillRect(ox + h.pos.x * px, oy + h.pos.y * px, px, px);
  }
  // Рамка вьюпорта.
  const vx = ox + Math.floor((camera.x / TILE_SIZE) * px);
  const vy = oy + Math.floor((camera.y / TILE_SIZE) * px);
  const vw = Math.floor((cw / TILE_SIZE) * px);
  const vh = Math.floor((ch / TILE_SIZE) * px);
  ctx.strokeStyle = "#ffd966";
  ctx.strokeRect(vx, vy, Math.min(vw, mmW - (vx - ox)), Math.min(vh, mmH - (vy - oy)));
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
      lines.push({ title: `${obj.icon} ${RESOURCE_NAMES[obj.resource]}`, sub: `+${obj.amount}` });
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

// Грубая шкала количества — как в HoMM3, чтобы не выдавать точные числа.
function countLabel(n: number): string {
  if (n <= 4) return `Несколько (~${n})`;
  if (n <= 9) return "Стая";
  if (n <= 19) return "Толпа";
  if (n <= 49) return "Орда";
  if (n <= 99) return "Полчище";
  return "Легион";
}
