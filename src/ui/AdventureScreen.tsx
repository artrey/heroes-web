import { useEffect, useMemo, useRef, useState } from "react";

import { ARTIFACTS as ARTIFACTS_LOCAL } from "../game/data/artifacts";
import { FACTION_META } from "../game/data/factions";
import { UNITS as UNITS_LOCAL } from "../game/data/units";
import { useGame } from "../game/store";
import type { Coord, GameMap, Hero, Player, ResourceBag, Town } from "../game/types";
import {
  getEffectiveKnowledge,
  getEffectiveMaxMana,
  getEffectiveSpellPower,
  getHeroBonus,
} from "../game/utils/heroBonus";
import { dailyIncomeFor } from "../game/utils/income";
import { findPath, pathCost } from "../game/utils/pathfind";
import { RESOURCE_ICONS, RESOURCE_NAMES } from "../game/utils/resources";
import { computeVisibleTiles } from "../game/utils/visibility";
import { computeDanger } from "../game/utils/zoc";
import { useNet } from "../net/netStore";
import { AnimSpeedToggle } from "./AnimSpeedToggle";
import { EDGE_PADDING_TILES, TILE_SIZE } from "./canvas/constants";
import { drawMap } from "./canvas/drawMap";
import { getMinimapBounds } from "./canvas/minimapLayer";
import { useAnimationLoop } from "./hooks/useAnimationLoop";
import { useCamera } from "./hooks/useCamera";
import { ANIM_SPEED_SCALE, useSettings } from "./settingsStore";

// Прошлые позиции героев живут на уровне модуля, а не в useRef. AdventureScreen
// размонтируется на время боя (App.tsx показывает BattleScreen поверх), и если
// бы prev хранился в ref, после боя он был бы пустым — и следующий ход ИИ
// рендерился мгновенно, без анимации. Module-scope сохраняет базу сравнения.
const prevHeroPosRegistry: Record<string, Coord> = {};

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
  const pendingInteraction = useGame(s => s.pendingInteraction);

  const animSpeed = useSettings(s => s.animSpeed);

  const [hoverPath, setHoverPath] = useState<Coord[] | null>(null);
  const [hoverTile, setHoverTile] = useState<Coord | null>(null);
  // Камера, drag-pan, скролл, стрелочки, clamp по краям + центрирование на клетке.
  const { camera, setCamera, clampCamera, centerCameraOnTile, panMouseDown, panMouseMove, panMouseUp } = useCamera({
    canvasRef,
    map,
    tileSize: TILE_SIZE,
    edgePaddingTiles: EDGE_PADDING_TILES,
  });

  // Локальная анимация движения героя по карте. В state хранится только финальная
  // позиция, а пройденный путь восстанавливаем через findPath между prev и current —
  // плюс используем плановый путь, если он есть после клика. Анимация — чисто UI-слой,
  // на стор не пишем, миграции не нужны.
  const heroAnimRef = useRef<{
    heroId: string;
    path: Coord[]; // включая старт и финал
    startTs: number;
    durationMs: number;
  } | null>(null);
  // Плановый путь, если игрок только что кликнул куда-то — нужен, чтобы анимация
  // шла именно по тому маршруту, который выбрал A* (с учётом объектов/danger).
  const plannedPathRef = useRef<{ heroId: string; from: Coord; path: Coord[] } | null>(null);

  // Общий rAF-цикл для канваса. onFrame решает, осталось ли что-то показывать
  // (по дедлайну анимации героя). tick — счётчик кадров, форсит drawMap.
  const { ensureRunning: ensureAnimRaf, tick: animTick } = useAnimationLoop(() => {
    const a = heroAnimRef.current;
    if (!a) return false;
    if (performance.now() >= a.startTs + a.durationMs) {
      heroAnimRef.current = null;
      return false;
    }
    return true;
  });

  const activePlayer = players[activePlayerId];
  // В мультиплеере «мой игрок» — это playerId, назначенный хостом. Берём:
  //   1) net.myPlayerId (приходит в assign);
  //   2) если пусто — ищем себя в лобби по peerId и читаем playerId оттуда (этот
  //      путь спасает, когда отдельное assign-сообщение потерялось);
  //   3) для SP — единственный human.
  const myPlayerNetId = useNet(s => s.myPlayerId);
  const myPeerId = useNet(s => s.myPeerId);
  const lobby = useNet(s => s.lobby);
  const role = useNet(s => s.role);
  const fallbackFromLobby = (myPeerId && lobby.find(p => p.peerId === myPeerId)?.playerId) || null;
  const resolvedMyPlayerId = myPlayerNetId ?? fallbackFromLobby;
  const myPlayer =
    role === "sp"
      ? (Object.values(players).find(p => p.isHuman) ?? activePlayer)
      : resolvedMyPlayerId
        ? players[resolvedMyPlayerId]
        : activePlayer;
  const isMyTurn = myPlayer ? activePlayer?.id === myPlayer.id : !!activePlayer?.isHuman;
  // Туман войны рисуем с точки зрения «моего» игрока — иначе на ход соседа
  // у клиента карта перепрыгивает в чужой обзор.
  const humanId = myPlayer?.id ?? Object.values(players).find(p => p.isHuman)?.id ?? activePlayerId;
  const humanPlayer = players[humanId];
  const revealed = humanPlayer?.revealed ?? {};
  const income = useMemo(
    () => (myPlayer ? dailyIncomeFor(useGame.getState(), myPlayer.id) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [myPlayer, towns, players],
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

  // Запускаем анимацию: смотрим, у кого из героев позиция изменилась с прошлого рендера.
  useEffect(() => {
    if (!map) return;
    const prev = prevHeroPosRegistry;
    const scale = ANIM_SPEED_SCALE[animSpeed];
    let started: typeof heroAnimRef.current = null;
    for (const h of Object.values(heroes)) {
      const p = prev[h.id];
      if (p && (p.x !== h.pos.x || p.y !== h.pos.y) && scale > 0) {
        // Пробуем взять плановый путь, который положил handleClick перед moveHeroTo.
        let segments: Coord[] | null = null;
        const planned = plannedPathRef.current;
        if (planned && planned.heroId === h.id && planned.from.x === p.x && planned.from.y === p.y) {
          // Берём префикс планового пути до фактической финальной позиции героя.
          const idx = planned.path.findIndex(c => c.x === h.pos.x && c.y === h.pos.y);
          if (idx >= 0) segments = planned.path.slice(0, idx + 1);
        }
        plannedPathRef.current = null;
        if (!segments) {
          // Фолбэк: восстановить путь через findPath (полезно для чужих героев / ИИ).
          // Без danger/revealed, иначе путь может не найтись.
          const path = findPath(map, p, h.pos);
          segments = path && path.length > 0 ? path : [h.pos];
        }
        const fullPath: Coord[] = [p, ...segments];
        const steps = Math.max(1, fullPath.length - 1);
        started = {
          heroId: h.id,
          path: fullPath,
          startTs: performance.now(),
          durationMs: Math.min(900, 120 * steps) * scale,
        };
      }
      prev[h.id] = h.pos;
    }
    // Подчищаем prev от удалённых героев, чтобы Map не разрастался.
    for (const id of Object.keys(prev)) {
      if (!heroes[id]) delete prev[id];
    }
    if (started) {
      heroAnimRef.current = started;
      ensureAnimRaf();
    } else if (scale === 0) {
      // Если выключили анимацию по ходу — сбрасываем активную, чтобы не доигрывалась.
      plannedPathRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroes, map, animSpeed]);

  // Сбрасываем активную анимацию героя при размонтировании, иначе ref может
  // указывать на «зависшего» героя при возврате с экрана боя.
  useEffect(() => {
    return () => {
      heroAnimRef.current = null;
    };
  }, []);

  // Сброс реестра предыдущих позиций при смене карты (новая игра / загрузка):
  // иначе старые координаты погибших героев останутся в module-scope.
  useEffect(() => {
    if (!map) {
      for (const id of Object.keys(prevHeroPosRegistry)) delete prevHeroPosRegistry[id];
    }
  }, [map]);

  // Закоммитить отложенную интеракцию, когда анимация перемещения героя
  // завершилась. Если анимаций нет вовсе (скорость «мгновенно») — коммитим
  // сразу же, чтобы поведение совпадало со старым.
  useEffect(() => {
    if (!pendingInteraction) return;
    if (heroAnimRef.current && heroAnimRef.current.heroId === pendingInteraction.heroId) {
      // Подождём — rAF-цикл сам пере-вызовет этот эффект через animTick.
      return;
    }
    useGame.getState().commitInteraction();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingInteraction, animTick]);

  // Текущие визуальные (sub-tile) позиции героев на основе активной анимации.
  function computeHeroVisualPos(): Record<string, Coord> {
    const a = heroAnimRef.current;
    if (!a) return {};
    const segs = a.path.length - 1;
    if (segs <= 0) return {};
    const now = performance.now();
    const elapsed = Math.max(0, Math.min(a.durationMs, now - a.startTs));
    const progress = a.durationMs > 0 ? elapsed / a.durationMs : 1;
    const totalSegProg = progress * segs;
    const i = Math.min(segs - 1, Math.floor(totalSegProg));
    const t = totalSegProg - i;
    const aP = a.path[i];
    const bP = a.path[i + 1];
    return { [a.heroId]: { x: aP.x + (bP.x - aP.x) * t, y: aP.y + (bP.y - aP.y) * t } };
  }

  // Рендер карты — собираем параметры и зовём orchestrator из canvas/.
  useEffect(() => {
    if (!map || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    drawMap(ctx, {
      map,
      heroes,
      towns,
      players,
      camera,
      revealed,
      visible,
      hoverPath,
      hoverTile,
      selectedHeroId,
      danger,
      heroVisualPos: computeHeroVisualPos(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, heroes, towns, players, camera, hoverPath, hoverTile, selectedHeroId, revealed, visible, danger, animTick]);

  // Автоскролл лога вниз при появлении новых записей.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  // Размер canvas + перерисовать на resize.
  useEffect(() => {
    function fit() {
      const c = canvasRef.current;
      const cont = containerRef.current;
      if (!c || !cont) return;
      c.width = cont.clientWidth;
      c.height = cont.clientHeight;
      if (map) {
        const ctx = c.getContext("2d");
        if (ctx)
          drawMap(ctx, {
            map,
            heroes,
            towns,
            players,
            camera,
            revealed,
            visible,
            hoverPath,
            hoverTile,
            selectedHeroId,
            danger,
            heroVisualPos: computeHeroVisualPos(),
          });
      }
    }
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  function handleMouseMove(ev: React.MouseEvent) {
    // Drag-панорамирование (средняя/правая кнопка) — useCamera обрабатывает сам.
    if (panMouseMove(ev)) return;
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
    if (!hero || hero.ownerId !== myPlayer?.id) {
      setHoverPath(null);
      return;
    }
    // Если hover пришёлся на не-entry клетку города — считаем путь до entry.
    // Сама клетка непроходима (passable=false), путь к ней бы не построился.
    let target = t;
    const hoverTileData = map!.tiles[t.y * map!.width + t.x];
    if (hoverTileData.objectId) {
      const obj = map!.objects[hoverTileData.objectId];
      if (obj?.kind === "dwelling") {
        target = obj.pos;
      }
    }
    const path = findPath(map!, hero.pos, target, {
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
    // Если есть незакоммиченная интеракция — сначала её закроем (повторный клик
    // не должен «съесть» отложенный подбор предмета). Возвращаемся: игрок увидит
    // результат и сделает следующий клик уже в актуальном состоянии.
    if (useGame.getState().pendingInteraction) {
      useGame.getState().commitInteraction();
      return;
    }
    const t = clickToTile(ev);
    if (!t) return;
    const tile = map!.tiles[t.y * map!.width + t.x];
    const selectedHero = selectedHeroId ? heroes[selectedHeroId] : null;
    // Двигать можно только своего героя в свой ход.
    const canMoveSelected = !!(selectedHero && selectedHero.ownerId === myPlayer?.id && isMyTurn);

    // Клик по герою на этой клетке — выбираем, если он МОЙ (в любой ход — это просто UI).
    const heroHere = Object.values(heroes).find(h => h.pos.x === t.x && h.pos.y === t.y);
    if (heroHere && heroHere.ownerId === myPlayer?.id) {
      // Свой союзный герой и выбран другой свой смежный герой — открыть meeting.
      if (selectedHero && selectedHero.id !== heroHere.id) {
        if (useGame.getState().openHeroMeeting(heroHere.id)) return;
      }
      selectHero(heroHere.id);
      return;
    }

    if (tile.objectId) {
      const obj = map!.objects[tile.objectId];
      // Город занимает 3×2 клетки — все 6 имеют objectId=townId. Любой клик по
      // городу резолвим в его entry-tile (центральная нижняя клетка): и для
      // своего города (зайти/подойти), и для чужого (штурм).
      if (obj?.kind === "dwelling") {
        const tw = towns[obj.id];
        if (tw) {
          const target = tw.pos;
          const heroOnTown = selectedHero && selectedHero.pos.x === target.x && selectedHero.pos.y === target.y;
          if (tw.ownerId === myPlayer?.id) {
            if (canMoveSelected && !heroOnTown) {
              if (selectedHeroId) {
                recordPlannedPath(selectedHeroId, target);
                moveHeroTo(target, selectedHeroId);
              }
              return;
            }
            openTown(tw.id);
            return;
          }
          // Чужой/нейтральный город — направляем героя к entry.
          if (canMoveSelected && selectedHeroId) {
            recordPlannedPath(selectedHeroId, target);
            moveHeroTo(target, selectedHeroId);
          }
          return;
        }
      }
    }
    // Любая другая клетка — двигаем выбранного героя.
    if (canMoveSelected && selectedHeroId) {
      recordPlannedPath(selectedHeroId, t);
      moveHeroTo(t, selectedHeroId);
    }
  }

  // Перед вызовом moveHeroTo запоминаем тот же путь, что и для подсветки. Используется
  // в анимации, чтобы перемещение шло именно по выбранному A*-маршруту (через те же
  // объекты/danger), а не по приблизительному пути от prev до new.
  function recordPlannedPath(heroId: string, target: Coord) {
    const hero = heroes[heroId];
    if (!hero || !map) return;
    const path = findPath(map, hero.pos, target, {
      revealed,
      dangerCells: danger.cells,
      dangerSources: danger.sources,
    });
    if (path && path.length > 0) {
      plannedPathRef.current = { heroId, from: { ...hero.pos }, path };
    } else {
      plannedPathRef.current = null;
    }
  }

  // Enter завершает ход. Стрелочки/wheel/drag-pan — внутри useCamera.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Enter") endTurn();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [endTurn]);

  // Боковая панель — всегда моё (а не активного игрока), даже когда ход чужой.
  const playerHeroes = myPlayer ? myPlayer.heroIds.map(id => heroes[id]).filter(Boolean) : [];
  const playerTowns = myPlayer ? myPlayer.townIds.map(id => towns[id]).filter(Boolean) : [];

  return (
    <div className="adventure">
      <div className="top-bar">
        <span className="day">
          📅 Месяц {month}, Неделя {((week - 1) % 4) + 1}, День {((day - 1) % 7) + 1}
        </span>
        <span style={{ color: activePlayer?.color }}>● {activePlayer?.name}</span>
        {activePlayer && !isMyTurn && (
          <span style={{ color: "var(--accent)" }}>
            {activePlayer.isHuman ? `(ход: ${activePlayer.name})` : "(ход ИИ…)"}
          </span>
        )}
        <div className="res-bar">
          {(Object.keys(myPlayer?.resources ?? {}) as Array<keyof ResourceBag>).map(k => {
            const inc = income?.[k] ?? 0;
            return (
              <div className="res-item" key={k} title={`${RESOURCE_NAMES[k]}${inc ? ` · +${inc}/день` : ""}`}>
                <span>{RESOURCE_ICONS[k]}</span>
                <span>{myPlayer!.resources[k]}</span>
                {inc > 0 && <span style={{ color: "var(--good)", fontSize: 11, marginLeft: 2 }}>(+{inc})</span>}
              </div>
            );
          })}
        </div>
        <AnimSpeedToggle compact />
        <button onClick={() => useGame.getState().goToMenu()}>Меню</button>
      </div>

      <div className="map-area" ref={containerRef}>
        <canvas
          ref={canvasRef}
          className="map-canvas"
          onClick={handleClick}
          onMouseMove={handleMouseMove}
          onMouseDown={panMouseDown}
          onMouseUp={panMouseUp}
          onMouseLeave={panMouseUp}
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
          {log
            // Показываем глобальные события + личные записи моего игрока,
            // чтобы не подсматривать ходы соперников.
            .filter(e => !e.playerId || e.playerId === myPlayer?.id)
            .map((l, i) => (
              <div key={i} className="entry">
                {l.text}
              </div>
            ))}
        </div>

        <button className="end-turn-btn" onClick={() => endTurn()} disabled={!isMyTurn}>
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
  map: GameMap;
  heroes: Record<string, Hero>;
  towns: Record<string, Town>;
  players: Record<string, Player>;
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
    if (obj.kind === "monster") {
      const u = UNITS_LOCAL[obj.unitId];
      lines.push({ title: `${u.icon} ${u.name}`, sub: countLabel(obj.unitCount) });
      lines.push({ title: "Бой!", sub: `Атк ${u.attack} / Защ ${u.defense} / HP ${u.hp}` });
    } else if (obj.kind === "dwelling") {
      const tw = towns[obj.id];
      const ow = tw?.ownerId ? players[tw.ownerId] : null;
      lines.push({ title: `${obj.icon} ${tw?.name ?? "Город"}`, sub: ow ? `Владелец: ${ow.name}` : "Нейтральный" });
    } else if (obj.kind === "resource") {
      lines.push({ title: `${RESOURCE_ICONS[obj.resource]} ${RESOURCE_NAMES[obj.resource]}`, sub: `+${obj.amount}` });
    } else if (obj.kind === "mine") {
      const ow = obj.ownerId ? players[obj.ownerId] : null;
      lines.push({
        title: `${obj.icon} Шахта (${RESOURCE_NAMES[obj.mineResource]})`,
        sub: ow ? `Владелец: ${ow.name}` : "Нейтральная",
      });
    } else if (obj.kind === "artifact") {
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
