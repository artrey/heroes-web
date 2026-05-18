import { useEffect, useRef, useState } from "react";

import {
  activeStack,
  approachTiles,
  BATTLE_H,
  BATTLE_W,
  canCastThisRound,
  canShoot,
  chebyshev,
  getSideMagic,
  isBattleOver,
  isValidSpellTarget,
  previewDamage,
  previewSpell,
  reachable,
  stackTotalHp,
} from "../game/battle/engine";
import { getSpell } from "../game/data/spells";
import { UNITS } from "../game/data/units";
import { useGame } from "../game/store";
import type { BattleStack, BattleState, Coord } from "../game/types";
import { useNet } from "../net/netStore";
import { AnimSpeedToggle } from "./AnimSpeedToggle";
import { cellCenter, FIELD_H, FIELD_PAD, FIELD_W, HEX_H, HEX_W } from "./battleCanvas/constants";
import { drawBattle } from "./battleCanvas/drawBattle";
import { ANIM_SPEED_SCALE, useSettings } from "./settingsStore";

// Длительность анимации перемещения стека на одну клетку (octile-метрика).
const BATTLE_MOVE_MS_PER_TILE = 80;
// Длительность красного flash'а при получении урона.
const BATTLE_HIT_FLASH_MS = 260;
// Длительность «выпада» атакующего при ударе/выстреле.
const BATTLE_LUNGE_MS = 240;

interface BattleMoveAnim {
  stackId: string;
  from: Coord;
  to: Coord;
  startTs: number;
  durationMs: number;
}

interface BattleLungeAnim {
  stackId: string;
  // Куда направлен «выпад» (центр клетки цели), в координатах боевого канваса.
  toX: number;
  toY: number;
  startTs: number;
  durationMs: number;
}

export function BattleScreen() {
  const battle = useGame(s => s.battle);
  const heroes = useGame(s => s.heroes);
  const players = useGame(s => s.players);
  const activePlayerId = useGame(s => s.activePlayerId);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const [hoverCell, setHoverCell] = useState<Coord | null>(null);
  const [hoverClient, setHoverClient] = useState<{ x: number; y: number } | null>(null);
  // Открытая модалка спеллбука и режим выбора цели для заклинания.
  const [showSpells, setShowSpells] = useState(false);
  const [castSpellId, setCastSpellId] = useState<string | null>(null);

  const animSpeed = useSettings(s => s.animSpeed);

  // ---- Анимации боя ----
  // Перемещение стека (один за раз — параллельных ходов в системе боя нет).
  const moveAnimRef = useRef<BattleMoveAnim | null>(null);
  // Короткий «выпад» атакующего к цели при ударе/выстреле.
  const lungeAnimRef = useRef<BattleLungeAnim | null>(null);
  // stackId -> момент окончания flash'а получения урона.
  const flashEndRef = useRef<Record<string, number>>({});
  // Снапшот предыдущего состояния стеков, чтобы по изменению pos/count/hp/shots понять,
  // какие анимации запускать.
  const prevStacksRef = useRef<Record<string, { pos: Coord; count: number; hp: number; shots: number }>>({});
  const animRafRef = useRef<number | null>(null);
  // Триггер force-redraw'а канваса в кадре rAF.
  const [animTick, setAnimTick] = useState(0);

  // Когда бой заканчивается — закрываем экран через действие store. В MP клиент
  // ничего не закрывает сам, ждёт state от хоста (иначе летят дубли-сообщений).
  useEffect(() => {
    if (!battle) return;
    if (useNet.getState().role === "client") return;
    const winner = isBattleOver(battle);
    if (winner) {
      const t = setTimeout(() => {
        if (winner === "attacker") useGame.getState().endBattleVictory();
        else useGame.getState().endBattleDefeat();
      }, 800);
      return () => clearTimeout(t);
    }
  }, [battle]);

  // Если ходит ИИ-стек (противник игрока или защитник нейтрал) — выполнить шаг сам.
  useEffect(() => {
    if (!battle) return;
    if (isBattleOver(battle)) return;
    const act = activeStack(battle);
    if (!act) return;
    const attackerHero = heroes[battle.attackerHeroId];
    const attackerOwner = attackerHero ? players[attackerHero.ownerId] : null;
    // Стек противника, если: side === defender и (нет defender hero или его игрок — ИИ);
    //                       или side === attacker и игрок-атакующий — ИИ.
    let isAi = false;
    if (act.side === "defender") {
      if (!battle.defenderHeroId)
        isAi = true; // нейтрал
      else {
        const defenderHero = heroes[battle.defenderHeroId];
        const defOwner = defenderHero ? players[defenderHero.ownerId] : null;
        isAi = defOwner?.isHuman === false;
      }
    } else {
      isAi = attackerOwner?.isHuman === false;
    }
    if (isAi) {
      // ИИ-шаг гоняет только host (или sp). Клиент ждёт state от хоста.
      if (useNet.getState().role === "client") return;
      // Дадим анимации доиграться до конца, а при instant — минимальная пауза,
      // чтобы прогон боя не сливался в одну вспышку.
      const scale = ANIM_SPEED_SCALE[animSpeed];
      const delay = Math.max(100, 500 * scale);
      const t = setTimeout(() => useGame.getState().battleStepAi(), delay);
      return () => clearTimeout(t);
    }
  }, [battle, heroes, players, activePlayerId, animSpeed]);

  // Запуск анимаций на изменение состояния боя.
  useEffect(() => {
    if (!battle) {
      // Бой закончился/закрыт — обнулим всё.
      moveAnimRef.current = null;
      lungeAnimRef.current = null;
      flashEndRef.current = {};
      prevStacksRef.current = {};
      return;
    }
    const prev = prevStacksRef.current;
    const now = performance.now();
    const scale = ANIM_SPEED_SCALE[animSpeed];
    // Перемещение: ищем стек, у которого изменилась pos.
    let move: BattleMoveAnim | null = null;
    let moveEndTs = now;
    if (scale > 0) {
      for (const s of battle.stacks) {
        const p = prev[s.id];
        if (!p || s.count <= 0) continue;
        if (p.pos.x !== s.pos.x || p.pos.y !== s.pos.y) {
          const dx = Math.abs(s.pos.x - p.pos.x);
          const dy = Math.abs(s.pos.y - p.pos.y);
          const dist = Math.max(dx, dy);
          const durationMs = Math.max(120, BATTLE_MOVE_MS_PER_TILE * dist) * scale;
          move = {
            stackId: s.id,
            from: { ...p.pos },
            to: { ...s.pos },
            startTs: now,
            durationMs,
          };
          moveEndTs = now + durationMs;
          break;
        }
      }
    }
    if (move) moveAnimRef.current = move;

    // Урон: у кого упал count или (count тот же, hp упал) — flash.
    // Если в этом же тике кто-то двигался, откладываем flash до конца движения,
    // чтобы атакующий «доходил» до цели до начала вспышки.
    if (scale > 0) {
      for (const s of battle.stacks) {
        const p = prev[s.id];
        if (!p) continue;
        const tookDamage = s.count < p.count || (s.count === p.count && s.hp < p.hp);
        if (tookDamage) {
          flashEndRef.current[s.id] = moveEndTs + BATTLE_HIT_FLASH_MS * scale;
        }
      }
    }

    // «Выпад» атакующего: эвристика. Берём активный стек и ищем жертву — соседа,
    // у которого упало hp/count, либо любую жертву с упавшим hp при уменьшении
    // shots у активного (это значит — был выстрел).
    if (scale > 0) {
      const actId = battle.turnOrder[battle.activeStackIdx];
      const act = battle.stacks.find(st => st.id === actId);
      const prevAct = act ? prev[act.id] : null;
      if (act && prevAct && act.count > 0) {
        const didShoot = act.shots < prevAct.shots;
        const victim = battle.stacks.find(s => {
          if (s.id === act.id) return false;
          const p = prev[s.id];
          if (!p) return false;
          return s.count < p.count || (s.count === p.count && s.hp < p.hp);
        });
        if (victim) {
          const adjacent = Math.max(Math.abs(victim.pos.x - act.pos.x), Math.abs(victim.pos.y - act.pos.y)) === 1;
          if (adjacent || didShoot) {
            const target = cellCenter(victim.pos.x, victim.pos.y);
            lungeAnimRef.current = {
              stackId: act.id,
              toX: target.cx,
              toY: target.cy,
              startTs: moveEndTs,
              durationMs: BATTLE_LUNGE_MS * scale,
            };
          }
        }
      }
    }

    // Сохранить новый снапшот для следующего тика.
    const snapshot: Record<string, { pos: Coord; count: number; hp: number; shots: number }> = {};
    for (const s of battle.stacks) {
      snapshot[s.id] = { pos: { ...s.pos }, count: s.count, hp: s.hp, shots: s.shots };
    }
    prevStacksRef.current = snapshot;

    if (scale === 0) {
      // На «мгновенно» очистим всё активное, чтобы канвас сразу прыгнул в свежее состояние.
      moveAnimRef.current = null;
      lungeAnimRef.current = null;
      flashEndRef.current = {};
      setAnimTick(t => t + 1);
    } else if (move || lungeAnimRef.current || Object.keys(flashEndRef.current).length > 0) {
      ensureAnimRaf();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battle, animSpeed]);

  function ensureAnimRaf() {
    if (animRafRef.current !== null) return;
    const loop = () => {
      const now = performance.now();
      let alive = false;
      const move = moveAnimRef.current;
      if (move) {
        if (now >= move.startTs + move.durationMs) moveAnimRef.current = null;
        else alive = true;
      }
      const lunge = lungeAnimRef.current;
      if (lunge) {
        if (now >= lunge.startTs + lunge.durationMs) lungeAnimRef.current = null;
        else alive = true;
      }
      for (const id of Object.keys(flashEndRef.current)) {
        if (now >= flashEndRef.current[id]) delete flashEndRef.current[id];
        else alive = true;
      }
      setAnimTick(t => t + 1);
      if (alive) {
        animRafRef.current = requestAnimationFrame(loop);
      } else {
        animRafRef.current = null;
      }
    };
    animRafRef.current = requestAnimationFrame(loop);
  }

  useEffect(() => {
    return () => {
      if (animRafRef.current !== null) cancelAnimationFrame(animRafRef.current);
      animRafRef.current = null;
    };
  }, []);

  function computeStackVisual(): {
    pos: Record<string, Coord>;
    flash: Record<string, number>;
    lunge: { stackId: string; offX: number; offY: number } | null;
  } {
    const result: ReturnType<typeof computeStackVisual> = { pos: {}, flash: {}, lunge: null };
    const now = performance.now();
    const move = moveAnimRef.current;
    if (move) {
      const elapsed = Math.max(0, Math.min(move.durationMs, now - move.startTs));
      const t = move.durationMs > 0 ? elapsed / move.durationMs : 1;
      // ease-out, чтобы перемещение было «бодрым» на старте и плавно тормозило к финалу.
      const eased = 1 - Math.pow(1 - t, 2);
      result.pos[move.stackId] = {
        x: move.from.x + (move.to.x - move.from.x) * eased,
        y: move.from.y + (move.to.y - move.from.y) * eased,
      };
    }
    for (const [id, endTs] of Object.entries(flashEndRef.current)) {
      const remaining = endTs - now;
      if (remaining <= 0) continue;
      const phase = Math.max(0, Math.min(1, remaining / BATTLE_HIT_FLASH_MS));
      result.flash[id] = phase;
    }
    const lunge = lungeAnimRef.current;
    if (lunge && now >= lunge.startTs) {
      const t = Math.max(0, Math.min(1, (now - lunge.startTs) / lunge.durationMs));
      // Треугольная функция: 0 → 1 → 0 за фазу.
      const k = t < 0.5 ? t * 2 : (1 - t) * 2;
      const stack = battle?.stacks.find(s => s.id === lunge.stackId);
      if (stack) {
        const base = cellCenter(stack.pos.x, stack.pos.y);
        // Подвинуть на 30% к цели на пике.
        const maxOff = 0.3;
        result.lunge = {
          stackId: lunge.stackId,
          offX: (lunge.toX - base.cx) * maxOff * k,
          offY: (lunge.toY - base.cy) * maxOff * k,
        };
      }
    }
    return result;
  }

  // Рендер.
  useEffect(() => {
    if (!battle || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d")!;
    drawBattle(ctx, battle, hoverCell, computeStackVisual());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battle, hoverCell, animTick]);

  // Автоскролл лога боя при появлении новых записей.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [battle?.log]);

  // ESC отменяет режим выбора цели для заклинания, чтобы не «зависнуть» в нём.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setCastSpellId(null);
        setShowSpells(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!battle) return null;
  const act = activeStack(battle);
  const winner = isBattleOver(battle);

  function handleClick(ev: React.MouseEvent) {
    if (!battle || !act) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = Math.floor((ev.clientX - rect.left - FIELD_PAD) / HEX_W);
    const y = Math.floor((ev.clientY - rect.top - FIELD_PAD) / HEX_H);
    if (x < 0 || x >= BATTLE_W || y < 0 || y >= BATTLE_H) return;
    // Только владелец активного стека (с учётом MP — мой playerId) ходит вручную.
    const myPlayerId = useNet.getState().myPlayerId;
    const attackerHero = heroes[battle.attackerHeroId];
    const sideOwner =
      act.side === "attacker"
        ? attackerHero && players[attackerHero.ownerId]
        : battle.defenderHeroId
          ? players[heroes[battle.defenderHeroId]?.ownerId ?? ""]
          : null;
    if (!sideOwner) return; // нейтральный — ИИ ходит сам
    const canAct = myPlayerId ? sideOwner.id === myPlayerId : !!sideOwner.isHuman;
    if (!canAct) return;
    // Режим выбора цели заклинания: клик по подходящему стеку — каст, по любому другому — отмена.
    if (castSpellId) {
      const clickedStack = battle.stacks.find(s => s.count > 0 && s.pos.x === x && s.pos.y === y);
      if (clickedStack && isValidSpellTarget(battle, act.side, castSpellId, clickedStack.id)) {
        useGame.getState().battleCastSpell(act.side, castSpellId, clickedStack.id);
      }
      setCastSpellId(null);
      return;
    }
    // Цель — враг?
    const target = battle.stacks.find(s => s.pos.x === x && s.pos.y === y && s.count > 0 && s.side !== act.side);
    if (target) {
      if (canShoot(battle, act)) {
        useGame.getState().battleShoot(act.id, target.id);
        return;
      }
      // Подойти и ударить.
      if (chebyshev(act.pos, target.pos) === 1) {
        useGame.getState().battleAttack(act.id, target.id);
        return;
      }
      const approach = approachTiles(battle, act.id, target.id);
      if (approach[0]) {
        useGame.getState().battleAttack(act.id, target.id, approach[0]);
      }
      return;
    }
    // Иначе — переместиться.
    const reach = reachable(battle, act);
    if (reach.has(`${x},${y}`)) {
      useGame.getState().battleMove(act.id, { x, y });
    }
  }

  function handleMove(ev: React.MouseEvent) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = Math.floor((ev.clientX - rect.left - FIELD_PAD) / HEX_W);
    const y = Math.floor((ev.clientY - rect.top - FIELD_PAD) / HEX_H);
    if (x < 0 || x >= BATTLE_W || y < 0 || y >= BATTLE_H) {
      setHoverCell(null);
      setHoverClient(null);
    } else {
      setHoverCell({ x, y });
      setHoverClient({ x: ev.clientX, y: ev.clientY });
    }
  }

  const hoverStack = hoverCell
    ? battle.stacks.find(s => s.count > 0 && s.pos.x === hoverCell.x && s.pos.y === hoverCell.y)
    : null;

  return (
    <div className="battle-screen">
      <div className="battle-field">
        <canvas
          ref={canvasRef}
          width={FIELD_W}
          height={FIELD_H}
          className="battle-canvas"
          onClick={handleClick}
          onMouseMove={handleMove}
          onMouseLeave={() => {
            setHoverCell(null);
            setHoverClient(null);
          }}
        />
        {hoverStack && hoverClient && (
          <BattleTooltip
            battle={battle}
            client={hoverClient}
            stack={hoverStack}
            activeStackId={act?.id ?? null}
            castSpellId={castSpellId}
            casterSide={act?.side ?? null}
          />
        )}
      </div>
      <div className="battle-controls">
        {winner ? (
          <div style={{ fontSize: 18, color: winner === "attacker" ? "var(--good)" : "var(--danger)" }}>
            {winner === "attacker" ? "🏆 Победа!" : "💀 Поражение!"}
          </div>
        ) : act ? (
          <>
            <div style={{ fontSize: 14 }}>
              <span style={{ color: act.side === "attacker" ? "#5fa850" : "#c44030" }}>●</span> Раунд {battle.round}:
              ход {UNITS[act.unitId].name} ({act.count})
              {(() => {
                const m = getSideMagic(battle, act.side);
                if (m.spells.length === 0) return null;
                return (
                  <span style={{ marginLeft: 12, color: "var(--text-dim)" }}>
                    💧 {m.mana} · 🔮 {m.spellPower}
                  </span>
                );
              })()}
            </div>
            <button
              disabled={act.hasWaited}
              title={act.hasWaited ? "Уже ждали в этом раунде" : "Перенести ход в конец раунда"}
              onClick={() => useGame.getState().battleWait(act.id)}
            >
              Ждать (W)
            </button>
            <button onClick={() => useGame.getState().battleDefend(act.id)}>Защита (D)</button>
            {(() => {
              const m = getSideMagic(battle, act.side);
              const canCast = m.spells.length > 0 && canCastThisRound(battle, act.side);
              if (m.spells.length === 0) return null;
              return (
                <button
                  disabled={!canCast}
                  onClick={() => setShowSpells(true)}
                  title={canCast ? "Открыть спеллбук" : "В этом раунде уже кастовали"}
                >
                  📖 Заклинание
                </button>
              );
            })()}
            {castSpellId && <span style={{ color: "var(--accent)", fontSize: 12 }}>Выберите цель… (ESC — отмена)</span>}
            <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
              <AnimSpeedToggle compact />
              <button onClick={() => useGame.getState().battleRunAuto()}>Автобой</button>
            </div>
          </>
        ) : null}
        <div className="battle-log" ref={logRef}>
          {battle.log.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      </div>
      {showSpells && act && (
        <SpellbookModal
          battle={battle}
          side={act.side}
          onClose={() => setShowSpells(false)}
          onPick={spellId => {
            setShowSpells(false);
            setCastSpellId(spellId);
          }}
        />
      )}
    </div>
  );
}

function SpellbookModal({
  battle,
  side,
  onClose,
  onPick,
}: {
  battle: BattleState;
  side: "attacker" | "defender";
  onClose: () => void;
  onPick: (spellId: string) => void;
}) {
  const magic = getSideMagic(battle, side);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ minWidth: 460 }}>
        <h2 style={{ marginTop: 0, color: "var(--gold)" }}>📖 Книга заклинаний</h2>
        <div style={{ color: "var(--text-dim)", fontSize: 13, marginBottom: 8 }}>
          💧 Мана: {magic.mana} · 🔮 Сила: {magic.spellPower}. 1 каст в раунд.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
          {magic.spells.map(id => {
            const sp = getSpell(id);
            if (!sp) return null;
            const affordable = magic.mana >= sp.manaCost;
            return (
              <button
                key={id}
                disabled={!affordable}
                onClick={() => onPick(id)}
                title={sp.description}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 2,
                  padding: 8,
                  textAlign: "left",
                }}
              >
                <span style={{ fontSize: 18 }}>
                  {sp.icon} {sp.name}
                </span>
                <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                  ур. {sp.level} · 💧 {sp.manaCost}
                </span>
                <span style={{ fontSize: 11 }}>{sp.description}</span>
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={onClose} style={{ flex: 1 }}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}

function BattleTooltip({
  battle,
  client,
  stack,
  activeStackId,
  castSpellId,
  casterSide,
}: {
  battle: BattleState;
  client: { x: number; y: number };
  stack: BattleStack;
  activeStackId: string | null;
  castSpellId: string | null;
  casterSide: "attacker" | "defender" | null;
}) {
  const def = UNITS[stack.unitId];
  const { current, max } = stackTotalHp(battle, stack);
  const hpPct = Math.max(0, Math.min(100, Math.round((current / max) * 100)));
  // HP верхнего юнита стека — это то, что бьют сейчас. Берём с учётом hpBonus стороны.
  const sideBonus = stack.side === "attacker" ? battle.attackerBonus : battle.defenderBonus;
  const topUnitMaxHp = Math.max(1, def.hp + sideBonus.hpBonus);
  const topUnitHp = Math.max(0, Math.min(topUnitMaxHp, stack.hp));

  // В режиме выбора цели для заклинания — показываем эффект спелла на эту цель,
  // а не урон от текущего стека.
  let spellPreview: ReturnType<typeof previewSpell> = null;
  let physPreview: ReturnType<typeof previewDamage> = null;
  if (castSpellId && casterSide) {
    spellPreview = previewSpell(battle, casterSide, castSpellId, stack.id);
  } else if (activeStackId && activeStackId !== stack.id) {
    const active = battle.stacks.find(s => s.id === activeStackId);
    if (active && active.side !== stack.side && active.count > 0) {
      physPreview = previewDamage(battle, active.id, stack.id);
    }
  }
  const spellDef = castSpellId ? getSpell(castSpellId) : null;

  // Позиционирование: рядом с курсором, в viewport-координатах.
  const TT_W = 260;
  const TT_H = 140;
  const offsetX = 14;
  const wantLeft = client.x + offsetX;
  const left = wantLeft + TT_W > window.innerWidth ? Math.max(8, client.x - TT_W - offsetX) : wantLeft;
  const top = Math.max(8, Math.min(window.innerHeight - TT_H - 8, client.y - TT_H / 2));
  return (
    <div className="battle-tooltip" style={{ left, top }}>
      <div className="tt-title">
        {def.icon} {def.name} × {stack.count}
      </div>
      <div className="tt-sub">
        HP: {topUnitHp} / {topUnitMaxHp}
      </div>
      <div className="tt-sub">
        HP стека: {current} / {max} ({hpPct}%)
      </div>
      <div className="tt-sub">
        Атк {def.attack} · Защ {def.defense} · HP {def.hp} · Ск {def.speed}
        {def.ranged ? ` · ⏵ ${stack.shots}` : ""}
      </div>
      {castSpellId && spellDef && (
        <div className="tt-pred">
          {spellDef.icon} {spellDef.name}:{" "}
          {spellPreview == null ? (
            <span style={{ color: "var(--danger)" }}>недопустимая цель</span>
          ) : spellPreview.kind === "damage" ? (
            <>
              {spellPreview.dmg} урона, убьёт {spellPreview.killed}
              {!spellPreview.canCast && <span style={{ color: "var(--danger)" }}> · нельзя кастовать</span>}
            </>
          ) : (
            <>
              {spellPreview.text}
              {!spellPreview.canCast && <span style={{ color: "var(--danger)" }}> · нельзя кастовать</span>}
            </>
          )}
        </div>
      )}
      {!castSpellId && physPreview && (
        <div className="tt-pred">
          {physPreview.ranged ? "⏵ Выстрел: " : "⚔️ Удар: "}
          {physPreview.minDmg === physPreview.maxDmg
            ? physPreview.minDmg
            : `${physPreview.minDmg}–${physPreview.maxDmg}`}{" "}
          урона,{" "}
          {physPreview.minKilled === physPreview.maxKilled
            ? `убьёт ${physPreview.minKilled}`
            : `убьёт ${physPreview.minKilled}–${physPreview.maxKilled}`}
        </div>
      )}
    </div>
  );
}
