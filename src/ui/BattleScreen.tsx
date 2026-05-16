import { useEffect, useRef, useState } from "react";

import {
  activeStack,
  approachTiles,
  BATTLE_H,
  BATTLE_W,
  canShoot,
  chebyshev,
  doAttack,
  doDefend,
  doMove,
  doShoot,
  doWait,
  isBattleOver,
  reachable,
  stepBattleAI,
} from "../game/battle/engine";
import { UNITS } from "../game/data/units";
import { useGame } from "../game/store";
import type { Coord } from "../game/types";

const HEX_W = 56;
const HEX_H = 48;
const FIELD_W = HEX_W * BATTLE_W + 40;
const FIELD_H = HEX_H * BATTLE_H + 40;

export function BattleScreen() {
  const battle = useGame(s => s.battle);
  const heroes = useGame(s => s.heroes);
  const players = useGame(s => s.players);
  const activePlayerId = useGame(s => s.activePlayerId);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoverCell, setHoverCell] = useState<Coord | null>(null);

  // Когда бой заканчивается — закрываем экран через действие store.
  useEffect(() => {
    if (!battle) return;
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
      const t = setTimeout(() => {
        const { battle: b2 } = stepBattleAI(useGame.getState().battle!);
        useGame.setState({ battle: b2 });
      }, 500);
      return () => clearTimeout(t);
    }
  }, [battle, heroes, players, activePlayerId]);

  // Рендер.
  useEffect(() => {
    if (!battle || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d")!;
    drawBattle(ctx, battle, hoverCell);
  }, [battle, hoverCell]);

  if (!battle) return null;
  const act = activeStack(battle);
  const winner = isBattleOver(battle);

  function handleClick(ev: React.MouseEvent) {
    if (!battle || !act) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = Math.floor((ev.clientX - rect.left - 20) / HEX_W);
    const y = Math.floor((ev.clientY - rect.top - 20) / HEX_H);
    if (x < 0 || x >= BATTLE_W || y < 0 || y >= BATTLE_H) return;
    // Если активный — ИИ, не реагируем.
    const attackerHero = heroes[battle.attackerHeroId];
    if (act.side === "attacker" && players[attackerHero.ownerId]?.isHuman === false) return;
    if (act.side === "defender") {
      if (!battle.defenderHeroId) return;
      const def = heroes[battle.defenderHeroId];
      if (players[def.ownerId]?.isHuman === false) return;
    }
    // Цель — враг?
    const target = battle.stacks.find(s => s.pos.x === x && s.pos.y === y && s.count > 0 && s.side !== act.side);
    if (target) {
      if (canShoot(battle, act)) {
        useGame.setState({ battle: doShoot(battle, act.id, target.id) });
        return;
      }
      // Подойти и ударить.
      if (chebyshev(act.pos, target.pos) === 1) {
        useGame.setState({ battle: doAttack(battle, act.id, target.id) });
        return;
      }
      const approach = approachTiles(battle, act.id, target.id);
      if (approach[0]) {
        useGame.setState({ battle: doAttack(battle, act.id, target.id, approach[0]) });
      }
      return;
    }
    // Иначе — переместиться.
    const reach = reachable(battle, act);
    if (reach.has(`${x},${y}`)) {
      useGame.setState({ battle: doMove(battle, act.id, { x, y }) });
    }
  }

  function handleMove(ev: React.MouseEvent) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = Math.floor((ev.clientX - rect.left - 20) / HEX_W);
    const y = Math.floor((ev.clientY - rect.top - 20) / HEX_H);
    if (x < 0 || x >= BATTLE_W || y < 0 || y >= BATTLE_H) setHoverCell(null);
    else setHoverCell({ x, y });
  }

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
          onMouseLeave={() => setHoverCell(null)}
        />
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
            </div>
            <button onClick={() => useGame.setState({ battle: doWait(battle, act.id) })}>Ждать (W)</button>
            <button onClick={() => useGame.setState({ battle: doDefend(battle, act.id) })}>Защита (D)</button>
            <div style={{ marginLeft: "auto" }}>
              <button
                onClick={() => {
                  // Авто-бой: гонять ИИ за обе стороны.
                  let b = battle;
                  let i = 0;
                  while (!isBattleOver(b) && i < 300) {
                    const { battle: nb } = stepBattleAI(b);
                    b = nb;
                    i++;
                  }
                  useGame.setState({ battle: b });
                }}
              >
                Автобой
              </button>
            </div>
          </>
        ) : null}
        <div className="battle-log">
          {battle.log.slice(-8).map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

function drawBattle(
  ctx: CanvasRenderingContext2D,
  battle: ReturnType<typeof useGame.getState>["battle"],
  hover: Coord | null,
) {
  if (!battle) return;
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  ctx.fillStyle = "#3a2e1a";
  ctx.fillRect(0, 0, cw, ch);
  // Сетка.
  for (let y = 0; y < BATTLE_H; y++) {
    for (let x = 0; x < BATTLE_W; x++) {
      const px = 20 + x * HEX_W;
      const py = 20 + y * HEX_H;
      ctx.fillStyle = (x + y) % 2 === 0 ? "#4a3a26" : "#3e3020";
      ctx.fillRect(px, py, HEX_W, HEX_H);
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.strokeRect(px + 0.5, py + 0.5, HEX_W - 1, HEX_H - 1);
    }
  }

  const act = activeStack(battle);

  // Подсветка доступных клеток для активного.
  if (act) {
    const reach = reachable(battle, act);
    ctx.fillStyle = act.side === "attacker" ? "rgba(95,168,80,0.18)" : "rgba(196,64,48,0.18)";
    for (const k of reach.keys()) {
      const [x, y] = k.split(",").map(Number);
      ctx.fillRect(20 + x * HEX_W, 20 + y * HEX_H, HEX_W, HEX_H);
    }
  }

  // Hover.
  if (hover) {
    ctx.strokeStyle = "#ffd966";
    ctx.lineWidth = 2;
    ctx.strokeRect(20 + hover.x * HEX_W + 1, 20 + hover.y * HEX_H + 1, HEX_W - 2, HEX_H - 2);
    ctx.lineWidth = 1;
  }

  // Стэки.
  for (const s of battle.stacks) {
    if (s.count <= 0) continue;
    const unit = UNITS[s.unitId];
    const px = 20 + s.pos.x * HEX_W;
    const py = 20 + s.pos.y * HEX_H;
    const cx = px + HEX_W / 2;
    const cy = py + HEX_H / 2;
    // Фоновый круг — цвет стороны.
    ctx.fillStyle = s.side === "attacker" ? "#3a7a30" : "#8a3020";
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.fill();
    // Подсветка активного.
    if (act && act.id === s.id) {
      ctx.strokeStyle = "#ffd966";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, 20, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    // Эмодзи.
    ctx.font = "24px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.fillText(unit.icon, cx, cy - 2);
    // Число.
    ctx.font = "bold 11px sans-serif";
    ctx.fillStyle = "#fff";
    const txt = String(s.count);
    const tw = ctx.measureText(txt).width;
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(cx - tw / 2 - 3, cy + 12, tw + 6, 12);
    ctx.fillStyle = "#fff";
    ctx.fillText(txt, cx, cy + 18);
  }
}
