import type { BattleState, BattleStack, Coord, Hero, UnitStack } from '../types';
import { UNITS, getUnit } from '../data/units';
import { makeId } from '../utils/id';

// Поле боя 15x11 — близко к HoMM3. Простая квадратная сетка с 8-связностью.
export const BATTLE_W = 15;
export const BATTLE_H = 11;

interface StartArgs {
  attackerHero: Hero;
  defenderHero: Hero | null;
  defenderObjectId: string | null;
  defenderArmy?: UnitStack[];
}

export function startBattle(args: StartArgs): BattleState {
  const stacks: BattleStack[] = [];

  // Атакующий — слева, столбец 0.
  args.attackerHero.army.forEach((u, idx) => {
    const def = getUnit(u.unitId);
    const y = positionForSlot(args.attackerHero.army.length, idx);
    stacks.push({
      id: makeId('bs'),
      unitId: u.unitId,
      count: u.count,
      hp: def.hp,
      side: 'attacker',
      pos: { x: 0, y },
      hasActed: false,
      hasRetaliated: false,
      shots: def.shots ?? 0,
    });
  });

  // Защитник — столбец 14.
  const defArmy = args.defenderHero?.army ?? args.defenderArmy ?? [];
  defArmy.forEach((u, idx) => {
    const def = getUnit(u.unitId);
    const y = positionForSlot(defArmy.length, idx);
    stacks.push({
      id: makeId('bs'),
      unitId: u.unitId,
      count: u.count,
      hp: def.hp,
      side: 'defender',
      pos: { x: BATTLE_W - 1, y },
      hasActed: false,
      hasRetaliated: false,
      shots: def.shots ?? 0,
    });
  });

  const turnOrder = computeTurnOrder(stacks);
  return {
    attackerHeroId: args.attackerHero.id,
    defenderHeroId: args.defenderHero?.id ?? null,
    defenderObjectId: args.defenderObjectId,
    defenderArmy: args.defenderArmy,
    stacks,
    turnOrder,
    activeStackIdx: 0,
    round: 1,
    winner: null,
    log: ['Бой начался!'],
  };
}

function positionForSlot(total: number, idx: number): number {
  // Равномерное расположение по 11 клеткам в столбце.
  const spacing = Math.max(1, Math.floor(BATTLE_H / (total + 1)));
  return Math.min(BATTLE_H - 1, spacing * (idx + 1));
}

function computeTurnOrder(stacks: BattleStack[]): string[] {
  return stacks
    .filter((s) => s.count > 0)
    .map((s) => ({ s, ini: UNITS[s.unitId].initiative + UNITS[s.unitId].speed * 0.01 }))
    .sort((a, b) => b.ini - a.ini)
    .map((x) => x.s.id);
}

export function activeStack(b: BattleState): BattleStack | null {
  const id = b.turnOrder[b.activeStackIdx];
  return b.stacks.find((s) => s.id === id) ?? null;
}

export function isBattleOver(b: BattleState): 'attacker' | 'defender' | null {
  const attAlive = b.stacks.some((s) => s.side === 'attacker' && s.count > 0);
  const defAlive = b.stacks.some((s) => s.side === 'defender' && s.count > 0);
  if (!attAlive) return 'defender';
  if (!defAlive) return 'attacker';
  return null;
}

export function chebyshev(a: Coord, b: Coord): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

// BFS, чтобы получить достижимые клетки за speed ходов.
export function reachable(b: BattleState, stack: BattleStack): Map<string, number> {
  const def = UNITS[stack.unitId];
  const speed = def.speed;
  const dist = new Map<string, number>();
  const startKey = key(stack.pos);
  dist.set(startKey, 0);
  const queue: Array<{ pos: Coord; d: number }> = [{ pos: stack.pos, d: 0 }];
  const occupied = new Set(
    b.stacks.filter((s) => s.count > 0 && s.id !== stack.id).map((s) => key(s.pos))
  );
  while (queue.length) {
    const { pos, d } = queue.shift()!;
    if (d >= speed) continue;
    for (const n of neighbors(pos)) {
      const k = key(n);
      if (dist.has(k)) continue;
      if (occupied.has(k)) continue;
      dist.set(k, d + 1);
      queue.push({ pos: n, d: d + 1 });
    }
  }
  if (!def.flying) return dist;
  // Летающие — игнорируют препятствия в пути, но не цель.
  const flyDist = new Map<string, number>();
  flyDist.set(startKey, 0);
  for (let y = 0; y < BATTLE_H; y++) {
    for (let x = 0; x < BATTLE_W; x++) {
      const d = Math.max(Math.abs(x - stack.pos.x), Math.abs(y - stack.pos.y));
      if (d <= speed && !occupied.has(key({ x, y }))) flyDist.set(key({ x, y }), d);
    }
  }
  return flyDist;
}

function key(c: Coord): string { return `${c.x},${c.y}`; }

function neighbors(c: Coord): Coord[] {
  const out: Coord[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const x = c.x + dx;
      const y = c.y + dy;
      if (x >= 0 && x < BATTLE_W && y >= 0 && y < BATTLE_H) out.push({ x, y });
    }
  }
  return out;
}

export function canShoot(b: BattleState, attacker: BattleStack): boolean {
  const def = UNITS[attacker.unitId];
  if (!def.ranged) return false;
  if (attacker.shots <= 0) return false;
  // Если рядом враг — стрелять нельзя.
  const enemies = b.stacks.filter((s) => s.side !== attacker.side && s.count > 0);
  return !enemies.some((e) => chebyshev(attacker.pos, e.pos) === 1);
}

function rollDamage(attacker: BattleStack, defender: BattleStack, ranged: boolean): { dmg: number; killed: number; remainingHp: number; newCount: number } {
  const aDef = UNITS[attacker.unitId];
  const dDef = UNITS[defender.unitId];
  // База: среднее урона * count.
  const baseDmgPerUnit = (aDef.minDmg + aDef.maxDmg) / 2;
  let totalDmg = baseDmgPerUnit * attacker.count;
  // Модификатор атака/защита.
  const diff = aDef.attack - dDef.defense;
  if (diff > 0) totalDmg *= 1 + Math.min(diff, 60) * 0.05;
  else if (diff < 0) totalDmg *= 1 / (1 + Math.min(-diff, 28) * 0.025);
  // Range penalty: если дистанция > 5, урон вдвое.
  if (ranged && chebyshev(attacker.pos, defender.pos) > 5) totalDmg *= 0.5;
  totalDmg = Math.max(1, Math.floor(totalDmg));

  // Применить к defender: учесть оставшиеся hp верхнего юнита.
  const totalDefenderHp = (defender.count - 1) * dDef.hp + defender.hp;
  const newHpTotal = Math.max(0, totalDefenderHp - totalDmg);
  const newCount = Math.ceil(newHpTotal / dDef.hp);
  const remainingHp = newCount === 0 ? 0 : newHpTotal - (newCount - 1) * dDef.hp;
  const killed = defender.count - newCount;
  return { dmg: totalDmg, killed, remainingHp, newCount };
}

export function doAttack(b: BattleState, attackerId: string, defenderId: string, approachTo?: Coord): BattleState {
  const attacker = b.stacks.find((s) => s.id === attackerId);
  const defender = b.stacks.find((s) => s.id === defenderId);
  if (!attacker || !defender) return b;
  const aDef = UNITS[attacker.unitId];
  const newB: BattleState = { ...b, stacks: b.stacks.map((s) => ({ ...s, pos: { ...s.pos } })), log: b.log.slice() };
  const a = newB.stacks.find((s) => s.id === attackerId)!;
  const d = newB.stacks.find((s) => s.id === defenderId)!;
  // Перемещение в approachTo, если задано.
  if (approachTo) a.pos = { ...approachTo };
  // Удар.
  const res = rollDamage(a, d, false);
  d.count = res.newCount;
  d.hp = res.remainingHp;
  newB.log.push(`${aDef.name} (${a.count}) бьёт ${UNITS[d.unitId].name}: -${res.killed}`);
  // Контратака.
  if (d.count > 0 && !d.hasRetaliated && !UNITS[d.unitId].ranged) {
    const ret = rollDamage(d, a, false);
    a.count = ret.newCount;
    a.hp = ret.remainingHp;
    d.hasRetaliated = true;
    newB.log.push(`${UNITS[d.unitId].name} (${d.count}) отвечает: -${ret.killed}`);
  }
  return finalizeTurn(newB, a.id);
}

export function doShoot(b: BattleState, attackerId: string, defenderId: string): BattleState {
  const newB: BattleState = { ...b, stacks: b.stacks.map((s) => ({ ...s, pos: { ...s.pos } })), log: b.log.slice() };
  const a = newB.stacks.find((s) => s.id === attackerId)!;
  const d = newB.stacks.find((s) => s.id === defenderId)!;
  if (!a || !d) return b;
  if (!canShoot(newB, a)) return b;
  a.shots -= 1;
  const res = rollDamage(a, d, true);
  d.count = res.newCount;
  d.hp = res.remainingHp;
  newB.log.push(`${UNITS[a.unitId].name} стреляет в ${UNITS[d.unitId].name}: -${res.killed}`);
  return finalizeTurn(newB, a.id);
}

export function doMove(b: BattleState, stackId: string, to: Coord): BattleState {
  const newB: BattleState = { ...b, stacks: b.stacks.map((s) => ({ ...s, pos: { ...s.pos } })), log: b.log.slice() };
  const s = newB.stacks.find((st) => st.id === stackId)!;
  s.pos = { ...to };
  newB.log.push(`${UNITS[s.unitId].name} перемещается.`);
  return finalizeTurn(newB, s.id);
}

export function doWait(b: BattleState, stackId: string): BattleState {
  const newB: BattleState = { ...b, stacks: b.stacks.map((s) => ({ ...s, pos: { ...s.pos } })), log: b.log.slice() };
  newB.log.push(`${UNITS[newB.stacks.find((s) => s.id === stackId)!.unitId].name} ждёт.`);
  return finalizeTurn(newB, stackId);
}

export function doDefend(b: BattleState, stackId: string): BattleState {
  const newB: BattleState = { ...b, stacks: b.stacks.map((s) => ({ ...s, pos: { ...s.pos } })), log: b.log.slice() };
  newB.log.push(`${UNITS[newB.stacks.find((s) => s.id === stackId)!.unitId].name} защищается.`);
  return finalizeTurn(newB, stackId);
}

function finalizeTurn(b: BattleState, justActedId: string): BattleState {
  const s = b.stacks.find((st) => st.id === justActedId);
  if (s) s.hasActed = true;
  // Перейти к следующему живому стеку в turnOrder.
  let idx = b.activeStackIdx;
  for (let i = 1; i <= b.turnOrder.length; i++) {
    const candIdx = (idx + i) % b.turnOrder.length;
    const cand = b.stacks.find((st) => st.id === b.turnOrder[candIdx]);
    if (cand && cand.count > 0 && !cand.hasActed) {
      return { ...b, activeStackIdx: candIdx };
    }
  }
  // Если все ходили — новый раунд.
  const newStacks = b.stacks.map((st) => ({ ...st, hasActed: false, hasRetaliated: false }));
  const newOrder = computeTurnOrder(newStacks);
  return { ...b, stacks: newStacks, turnOrder: newOrder, activeStackIdx: 0, round: b.round + 1 };
}

// Адъяцентные пустые клетки рядом с defender, отсортированные по расстоянию до attacker.
export function approachTiles(b: BattleState, attackerId: string, defenderId: string): Coord[] {
  const attacker = b.stacks.find((s) => s.id === attackerId);
  const defender = b.stacks.find((s) => s.id === defenderId);
  if (!attacker || !defender) return [];
  const reach = reachable(b, attacker);
  const occupied = new Set(b.stacks.filter((s) => s.count > 0 && s.id !== attacker.id).map((s) => key(s.pos)));
  const candidates: Coord[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const c: Coord = { x: defender.pos.x + dx, y: defender.pos.y + dy };
      if (c.x < 0 || c.x >= BATTLE_W || c.y < 0 || c.y >= BATTLE_H) continue;
      const k = key(c);
      if (occupied.has(k)) continue;
      if (k === key(attacker.pos) || reach.has(k)) candidates.push(c);
    }
  }
  return candidates.sort((a, b) => chebyshev(a, attacker.pos) - chebyshev(b, attacker.pos));
}

// ИИ боя: один ход активного стека. Используется и для нейтрального противника, и для ИИ-игрока.
export function stepBattleAI(b: BattleState): { battle: BattleState } {
  const act = activeStack(b);
  if (!act) return { battle: b };
  const enemies = b.stacks.filter((s) => s.side !== act.side && s.count > 0);
  if (enemies.length === 0) return { battle: b };
  // Если можно стрелять — стрелять по самому слабому.
  if (canShoot(b, act)) {
    const target = enemies.slice().sort((a, b) => a.count * UNITS[a.unitId].hp - b.count * UNITS[b.unitId].hp)[0];
    return { battle: doShoot(b, act.id, target.id) };
  }
  // Иначе подойти к ближайшему и атаковать.
  const target = enemies.slice().sort((a, b) => chebyshev(act.pos, a.pos) - chebyshev(act.pos, b.pos))[0];
  if (chebyshev(act.pos, target.pos) === 1) {
    return { battle: doAttack(b, act.id, target.id) };
  }
  const approach = approachTiles(b, act.id, target.id);
  if (approach.length > 0) {
    return { battle: doAttack(b, act.id, target.id, approach[0]) };
  }
  // Не можем достать — идём в сторону.
  const reach = reachable(b, act);
  let best: { c: Coord; d: number } | null = null;
  for (const [k, _d] of reach) {
    const [x, y] = k.split(',').map(Number);
    const dist = chebyshev({ x, y }, target.pos);
    if (!best || dist < best.d) best = { c: { x, y }, d: dist };
  }
  if (best) return { battle: doMove(b, act.id, best.c) };
  return { battle: doWait(b, act.id) };
}
