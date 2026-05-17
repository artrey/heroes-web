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
  const logRef = useRef<HTMLDivElement>(null);
  const [hoverCell, setHoverCell] = useState<Coord | null>(null);
  const [hoverClient, setHoverClient] = useState<{ x: number; y: number } | null>(null);
  // Открытая модалка спеллбука и режим выбора цели для заклинания.
  const [showSpells, setShowSpells] = useState(false);
  const [castSpellId, setCastSpellId] = useState<string | null>(null);

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
      const t = setTimeout(() => useGame.getState().battleStepAi(), 500);
      return () => clearTimeout(t);
    }
  }, [battle, heroes, players, activePlayerId]);

  // Рендер.
  useEffect(() => {
    if (!battle || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d")!;
    drawBattle(ctx, battle, hoverCell);
  }, [battle, hoverCell]);

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
    const x = Math.floor((ev.clientX - rect.left - 20) / HEX_W);
    const y = Math.floor((ev.clientY - rect.top - 20) / HEX_H);
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
    const x = Math.floor((ev.clientX - rect.left - 20) / HEX_W);
    const y = Math.floor((ev.clientY - rect.top - 20) / HEX_H);
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
            <div style={{ marginLeft: "auto" }}>
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

function drawBattle(
  ctx: CanvasRenderingContext2D,
  battle: ReturnType<typeof useGame.getState>["battle"],
  hover: Coord | null,
) {
  if (!battle) return;
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  // Земляной фон с лёгким градиентом сверху вниз.
  const bgGrad = ctx.createLinearGradient(0, 0, 0, ch);
  bgGrad.addColorStop(0, "#403628");
  bgGrad.addColorStop(1, "#2c241a");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, cw, ch);
  // Мягкая шахматка через полупрозрачные оверлеи — заметно, но не рябит.
  for (let y = 0; y < BATTLE_H; y++) {
    for (let x = 0; x < BATTLE_W; x++) {
      const px = 20 + x * HEX_W;
      const py = 20 + y * HEX_H;
      const isEven = (x + y) % 2 === 0;
      ctx.fillStyle = isEven ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.06)";
      ctx.fillRect(px, py, HEX_W, HEX_H);
      ctx.strokeStyle = "rgba(0,0,0,0.22)";
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
  // Подсветка зоны hover-стека (если он не активный) — обводкой, чтобы не мешать.
  const hoverStack = hover ? battle.stacks.find(s => s.count > 0 && s.pos.x === hover.x && s.pos.y === hover.y) : null;
  if (hoverStack && hoverStack.id !== act?.id) {
    const reach = reachable(battle, hoverStack);
    ctx.strokeStyle = hoverStack.side === "attacker" ? "rgba(120,200,110,0.7)" : "rgba(220,110,90,0.7)";
    ctx.lineWidth = 1.5;
    for (const k of reach.keys()) {
      const [x, y] = k.split(",").map(Number);
      ctx.strokeRect(20 + x * HEX_W + 2, 20 + y * HEX_H + 2, HEX_W - 4, HEX_H - 4);
    }
    ctx.lineWidth = 1;
  }

  // Hover.
  if (hover) {
    ctx.strokeStyle = "#ffd966";
    ctx.lineWidth = 2;
    ctx.strokeRect(20 + hover.x * HEX_W + 1, 20 + hover.y * HEX_H + 1, HEX_W - 2, HEX_H - 2);
    ctx.lineWidth = 1;
  }

  // Препятствия. Рисуем под стэками, чтобы фигурки были поверх.
  for (const obs of battle.obstacles) {
    const px = 20 + obs.pos.x * HEX_W;
    const py = 20 + obs.pos.y * HEX_H;
    const cx = px + HEX_W / 2;
    const cy = py + HEX_H / 2;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 12, 18, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.font = "28px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.fillText(obs.icon, cx, cy);
  }

  // Стэки.
  for (const s of battle.stacks) {
    if (s.count <= 0) continue;
    const unit = UNITS[s.unitId];
    const px = 20 + s.pos.x * HEX_W;
    const py = 20 + s.pos.y * HEX_H;
    const cx = px + HEX_W / 2;
    const cy = py + HEX_H / 2;
    const baseColor = s.side === "attacker" ? "#3a7a30" : "#8a3020";
    // Тень под жетоном.
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 16, 17, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Фоновый круг — радиальный градиент по стороне.
    const tokenGrad = ctx.createRadialGradient(cx - 6, cy - 6, 0, cx, cy, 19);
    tokenGrad.addColorStop(0, battleLighten(baseColor, 0.35));
    tokenGrad.addColorStop(1, battleDarken(baseColor, 0.3));
    ctx.fillStyle = tokenGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = battleDarken(baseColor, 0.5);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Подсветка активного.
    if (act && act.id === s.id) {
      ctx.strokeStyle = "#ffd966";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, 20, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.lineWidth = 1;
    // HP-полоса — для верхнего юнита стека (а не всего стека), иначе на больших
    // стеках мощный удар почти не двигает полоску.
    const sideBonus = s.side === "attacker" ? battle.attackerBonus : battle.defenderBonus;
    const effUnitHp = Math.max(1, unit.hp + sideBonus.hpBonus);
    const hpPct = Math.max(0, Math.min(1, s.hp / effUnitHp));
    drawHpBar(ctx, cx - 16, cy - 22, 32, 4, hpPct);
    // Эмодзи.
    ctx.font = "24px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.fillText(unit.icon, cx, cy - 2);
    // Число существ.
    ctx.font = "bold 11px sans-serif";
    const txt = String(s.count);
    const tw = ctx.measureText(txt).width;
    ctx.fillStyle = "rgba(0,0,0,0.78)";
    ctx.fillRect(cx - tw / 2 - 4, cy + 11, tw + 8, 13);
    ctx.fillStyle = "#fff";
    ctx.fillText(txt, cx, cy + 18);
  }
}

function drawHpBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, pct: number) {
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = "#2a2018";
  ctx.fillRect(x, y, w, h);
  const color = pct > 0.6 ? "#5fa850" : pct > 0.3 ? "#d4a64a" : "#c44030";
  ctx.fillStyle = color;
  ctx.fillRect(x, y, Math.max(0, w * pct), h);
}

// Локальные helpers для манипуляции цветом в боевом канвасе.
function battleLighten(hex: string, t: number): string {
  return mixBattle(hex, [255, 255, 255], t);
}
function battleDarken(hex: string, t: number): string {
  return mixBattle(hex, [0, 0, 0], t);
}
function mixBattle(a: string, b: [number, number, number], t: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(a);
  let pa: [number, number, number] = [128, 128, 128];
  if (m) {
    const n = parseInt(m[1], 16);
    pa = [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  }
  const r = Math.round(pa[0] * (1 - t) + b[0] * t);
  const g = Math.round(pa[1] * (1 - t) + b[1] * t);
  const bl = Math.round(pa[2] * (1 - t) + b[2] * t);
  return `rgb(${r}, ${g}, ${bl})`;
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
