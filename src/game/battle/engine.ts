import { EMPTY_BONUS } from "../data/artifacts";
import { getSpell } from "../data/spells";
import { getUnit, UNITS } from "../data/units";
import type {
  BattleMagic,
  BattleObstacle,
  BattleStack,
  BattleState,
  Coord,
  Hero,
  HeroBonus,
  StackTempBonus,
  UnitStack,
} from "../types";
import { getHeroBonus } from "../utils/heroBonus";
import { makeId } from "../utils/id";

// Поле боя 15x11 — близко к HoMM3. Простая квадратная сетка с 8-связностью.
export const BATTLE_W = 15;
export const BATTLE_H = 11;

interface StartArgs {
  attackerHero: Hero;
  defenderHero: Hero | null;
  defenderObjectId: string | null;
  defenderArmy?: UnitStack[];
  // Дополнительные бонусы для сторон — например, буф ИИ на высокой сложности.
  attackerExtraBonus?: Partial<HeroBonus>;
  defenderExtraBonus?: Partial<HeroBonus>;
}

const EMPTY_TEMP: StackTempBonus = { attack: 0, defense: 0, speed: 0, minDmg: 0 };

const EMPTY_MAGIC: BattleMagic = {
  mana: 0,
  spellPower: 0,
  knowledge: 0,
  spells: [],
  lastCastRound: 0,
};

function magicFromHero(h: Hero | null): BattleMagic {
  if (!h) return { ...EMPTY_MAGIC };
  return {
    mana: h.mana,
    spellPower: h.spellPower,
    knowledge: h.knowledge,
    spells: [...h.spells],
    lastCastRound: 0,
  };
}

export function startBattle(args: StartArgs): BattleState {
  const stacks: BattleStack[] = [];
  const attackerBonus = mergeBonus(getHeroBonus(args.attackerHero), args.attackerExtraBonus);
  const defenderBonus = mergeBonus(
    args.defenderHero ? getHeroBonus(args.defenderHero) : EMPTY_BONUS,
    args.defenderExtraBonus,
  );

  // Атакующий — слева, столбец 0.
  args.attackerHero.army.forEach((u, idx) => {
    const def = getUnit(u.unitId);
    const y = positionForSlot(args.attackerHero.army.length, idx);
    stacks.push({
      id: makeId("bs"),
      unitId: u.unitId,
      count: u.count,
      hp: def.hp + attackerBonus.hpBonus,
      side: "attacker",
      pos: { x: 0, y },
      hasActed: false,
      hasRetaliated: false,
      shots: def.shots ?? 0,
      tempBonus: { ...EMPTY_TEMP },
    });
  });

  // Защитник — столбец 14.
  const defArmy = args.defenderHero?.army ?? args.defenderArmy ?? [];
  defArmy.forEach((u, idx) => {
    const def = getUnit(u.unitId);
    const y = positionForSlot(defArmy.length, idx);
    stacks.push({
      id: makeId("bs"),
      unitId: u.unitId,
      count: u.count,
      hp: def.hp + defenderBonus.hpBonus,
      side: "defender",
      pos: { x: BATTLE_W - 1, y },
      hasActed: false,
      hasRetaliated: false,
      shots: def.shots ?? 0,
      tempBonus: { ...EMPTY_TEMP },
    });
  });

  const turnOrder = computeTurnOrder(stacks, { attackerBonus, defenderBonus });
  // XP за бой = суммарный HP всех вражеских юнитов.
  const xpReward = defArmy.reduce((acc, u) => acc + (UNITS[u.unitId]?.hp ?? 0) * u.count, 0);
  const obstacles = generateObstacles(stacks);
  return {
    attackerHeroId: args.attackerHero.id,
    defenderHeroId: args.defenderHero?.id ?? null,
    defenderObjectId: args.defenderObjectId,
    defenderArmy: args.defenderArmy,
    attackerBonus,
    defenderBonus,
    attackerMagic: magicFromHero(args.attackerHero),
    defenderMagic: magicFromHero(args.defenderHero),
    xpReward,
    obstacles,
    stacks,
    turnOrder,
    activeStackIdx: 0,
    round: 1,
    winner: null,
    log: [battleLine(1, "Бой начался!")],
  };
}

const OBSTACLE_ICONS = ["🪨", "🌵", "🪵", "🌳", "🍄"];

// Случайные препятствия в средней зоне поля: x=2..12, y=0..10. Не накладываются
// на стартовые позиции стэков. 4–8 штук на бой.
function generateObstacles(stacks: BattleStack[]): BattleObstacle[] {
  const occupied = new Set(stacks.map(s => `${s.pos.x},${s.pos.y}`));
  const out: BattleObstacle[] = [];
  const count = 4 + Math.floor(Math.random() * 5);
  let safety = 0;
  while (out.length < count && safety < 100) {
    safety++;
    const x = 2 + Math.floor(Math.random() * (BATTLE_W - 4));
    const y = Math.floor(Math.random() * BATTLE_H);
    const k = `${x},${y}`;
    if (occupied.has(k)) continue;
    occupied.add(k);
    out.push({ pos: { x, y }, icon: OBSTACLE_ICONS[Math.floor(Math.random() * OBSTACLE_ICONS.length)] });
  }
  return out;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function clockTag(): string {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

// Префикс раунда + локальное время для записей лога боя.
function battleLine(round: number, text: string): string {
  return `[${clockTag()}] [Р${round}] ${text}`;
}

function bonusFor(b: BattleState, side: "attacker" | "defender"): HeroBonus {
  return side === "attacker" ? b.attackerBonus : b.defenderBonus;
}

function mergeBonus(base: HeroBonus, extra?: Partial<HeroBonus>): HeroBonus {
  if (!extra) return base;
  return {
    attack: base.attack + (extra.attack ?? 0),
    defense: base.defense + (extra.defense ?? 0),
    speed: base.speed + (extra.speed ?? 0),
    hpBonus: base.hpBonus + (extra.hpBonus ?? 0),
    movement: base.movement + (extra.movement ?? 0),
  };
}

function effectiveStats(stack: BattleStack, bonus: HeroBonus) {
  const def = UNITS[stack.unitId];
  const t = stack.tempBonus;
  return {
    attack: def.attack + bonus.attack + t.attack,
    defense: def.defense + bonus.defense + t.defense,
    speed: def.speed + bonus.speed + t.speed,
    hp: def.hp + bonus.hpBonus,
  };
}

function positionForSlot(total: number, idx: number): number {
  // Равномерное расположение по 11 клеткам в столбце.
  const spacing = Math.max(1, Math.floor(BATTLE_H / (total + 1)));
  return Math.min(BATTLE_H - 1, spacing * (idx + 1));
}

function computeTurnOrder(
  stacks: BattleStack[],
  bonuses: { attackerBonus: HeroBonus; defenderBonus: HeroBonus },
): string[] {
  return stacks
    .filter(s => s.count > 0)
    .map(s => {
      const bonus = s.side === "attacker" ? bonuses.attackerBonus : bonuses.defenderBonus;
      const speed = UNITS[s.unitId].speed + bonus.speed + s.tempBonus.speed;
      return { s, ini: UNITS[s.unitId].initiative + speed * 0.01 };
    })
    .sort((a, b) => b.ini - a.ini)
    .map(x => x.s.id);
}

export function activeStack(b: BattleState): BattleStack | null {
  const id = b.turnOrder[b.activeStackIdx];
  return b.stacks.find(s => s.id === id) ?? null;
}

export function isBattleOver(b: BattleState): "attacker" | "defender" | null {
  const attAlive = b.stacks.some(s => s.side === "attacker" && s.count > 0);
  const defAlive = b.stacks.some(s => s.side === "defender" && s.count > 0);
  if (!attAlive) return "defender";
  if (!defAlive) return "attacker";
  return null;
}

export function chebyshev(a: Coord, b: Coord): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

// Стоимость шага по полю боя. Прямая клетка — 1, диагональ — 1.5: speed=4 даёт
// либо ровно 4 клетки вдоль ряда, либо 2 диагонали (cost 3) + ещё одну прямую,
// зона достижимости получается ромбовидной, а не квадратной.
const STEP_ORTHO = 1;
const STEP_DIAG = 1.5;

// Dijkstra по 8 направлениям. Возвращает Map<"x,y", cost> для клеток, достижимых
// за speed очков движения. Для летающих учитываются только сами клетки (препятствия
// между не учитываются), но evklid в той же метрике, чтобы дальность была честной.
export function reachable(b: BattleState, stack: BattleStack): Map<string, number> {
  const def = UNITS[stack.unitId];
  const speed = def.speed + bonusFor(b, stack.side).speed;
  const occupied = new Set(b.stacks.filter(s => s.count > 0 && s.id !== stack.id).map(s => key(s.pos)));
  // Препятствия — тоже непроходимые клетки, для всех (включая летающих).
  for (const o of b.obstacles) occupied.add(key(o.pos));
  const dist = new Map<string, number>();
  const startKey = key(stack.pos);
  dist.set(startKey, 0);

  if (def.flying) {
    // Летающие: ходят на любую клетку, расстояние до которой ≤ speed по той же
    // octile-метрике; занятые клетки исключаются, препятствий на пути нет.
    for (let y = 0; y < BATTLE_H; y++) {
      for (let x = 0; x < BATTLE_W; x++) {
        const k = key({ x, y });
        if (k === startKey) continue;
        if (occupied.has(k)) continue;
        const dx = Math.abs(x - stack.pos.x);
        const dy = Math.abs(y - stack.pos.y);
        const cost = STEP_ORTHO * Math.max(dx, dy) + (STEP_DIAG - STEP_ORTHO) * Math.min(dx, dy);
        if (cost <= speed) dist.set(k, cost);
      }
    }
    return dist;
  }

  // Наземные: классический Dijkstra. Поле 15×11 = 165 клеток, простой линейный
  // pick минимума достаточно — heap не нужен.
  const open: Array<{ x: number; y: number; cost: number }> = [{ x: stack.pos.x, y: stack.pos.y, cost: 0 }];
  while (open.length) {
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) if (open[i].cost < open[bestIdx].cost) bestIdx = i;
    const cur = open.splice(bestIdx, 1)[0];
    if (cur.cost > (dist.get(key(cur)) ?? Infinity)) continue;
    for (const n of neighbors(cur)) {
      const k = key(n);
      if (occupied.has(k)) continue;
      const dx = Math.abs(n.x - cur.x);
      const dy = Math.abs(n.y - cur.y);
      const step = dx !== 0 && dy !== 0 ? STEP_DIAG : STEP_ORTHO;
      const newCost = cur.cost + step;
      if (newCost > speed) continue;
      if (newCost < (dist.get(k) ?? Infinity)) {
        dist.set(k, newCost);
        open.push({ x: n.x, y: n.y, cost: newCost });
      }
    }
  }
  return dist;
}

function key(c: Coord): string {
  return `${c.x},${c.y}`;
}

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
  const enemies = b.stacks.filter(s => s.side !== attacker.side && s.count > 0);
  return !enemies.some(e => chebyshev(attacker.pos, e.pos) === 1);
}

function rollDamage(
  b: BattleState,
  attacker: BattleStack,
  defender: BattleStack,
  ranged: boolean,
): { dmg: number; killed: number; remainingHp: number; newCount: number } {
  const aDef = UNITS[attacker.unitId];
  const minD = aDef.minDmg + attacker.tempBonus.minDmg;
  const maxD = aDef.maxDmg + attacker.tempBonus.minDmg;
  // Бросок урона на каждый юнит в стеке — как в HoMM3.
  // При minDmg === maxDmg рандом пропускаем (оптимизация для больших стеков).
  const spread = maxD - minD;
  let raw: number;
  if (spread === 0) {
    raw = minD * attacker.count;
  } else {
    raw = 0;
    for (let i = 0; i < attacker.count; i++) {
      raw += minD + Math.floor(Math.random() * (spread + 1));
    }
  }
  const totalDmg = applyDmgModifiers(b, attacker, defender, ranged, raw);
  return applyDamageToStack(b, defender, totalDmg);
}

function applyDmgModifiers(
  b: BattleState,
  attacker: BattleStack,
  defender: BattleStack,
  ranged: boolean,
  rawDmg: number,
): number {
  const aStats = effectiveStats(attacker, bonusFor(b, attacker.side));
  const dStats = effectiveStats(defender, bonusFor(b, defender.side));
  let dmg = rawDmg;
  const diff = aStats.attack - dStats.defense;
  if (diff > 0) dmg *= 1 + Math.min(diff, 60) * 0.05;
  else if (diff < 0) dmg *= 1 / (1 + Math.min(-diff, 28) * 0.025);
  if (ranged && chebyshev(attacker.pos, defender.pos) > 5) dmg *= 0.5;
  return Math.max(1, Math.floor(dmg));
}

function applyDamageToStack(
  b: BattleState,
  defender: BattleStack,
  dmg: number,
): { dmg: number; killed: number; remainingHp: number; newCount: number } {
  const dStats = effectiveStats(defender, bonusFor(b, defender.side));
  const totalDefenderHp = (defender.count - 1) * dStats.hp + defender.hp;
  const newHpTotal = Math.max(0, totalDefenderHp - dmg);
  const newCount = Math.ceil(newHpTotal / dStats.hp);
  const remainingHp = newCount === 0 ? 0 : newHpTotal - (newCount - 1) * dStats.hp;
  const killed = defender.count - newCount;
  return { dmg, killed, remainingHp, newCount };
}

// Превью урона, который НАНЁС бы attacker по defender — для тултипов и принятия решений.
// Считает диапазон minDmg…maxDmg и оценочные потери (минимум/максимум убитых).
export function previewDamage(
  b: BattleState,
  attackerId: string,
  defenderId: string,
): { ranged: boolean; minDmg: number; maxDmg: number; minKilled: number; maxKilled: number } | null {
  const attacker = b.stacks.find(s => s.id === attackerId);
  const defender = b.stacks.find(s => s.id === defenderId);
  if (!attacker || !defender || attacker.count <= 0 || defender.count <= 0) return null;
  const aDef = UNITS[attacker.unitId];
  const ranged = canShoot(b, attacker);
  const minRaw = (aDef.minDmg + attacker.tempBonus.minDmg) * attacker.count;
  const maxRaw = (aDef.maxDmg + attacker.tempBonus.minDmg) * attacker.count;
  const minDmg = applyDmgModifiers(b, attacker, defender, ranged, minRaw);
  const maxDmg = applyDmgModifiers(b, attacker, defender, ranged, maxRaw);
  const lo = applyDamageToStack(b, defender, minDmg); // меньше урона — больше выживших
  const hi = applyDamageToStack(b, defender, maxDmg);
  return { ranged, minDmg, maxDmg, minKilled: lo.killed, maxKilled: hi.killed };
}

// Сколько HP в стеке всего (с учётом текущих HP верхнего юнита и бонусов).
export function stackTotalHp(b: BattleState, stack: BattleStack): { current: number; max: number } {
  const stats = effectiveStats(stack, bonusFor(b, stack.side));
  const max = stats.hp * stack.count;
  const current = (stack.count - 1) * stats.hp + stack.hp;
  return { current, max };
}

export function doAttack(b: BattleState, attackerId: string, defenderId: string, approachTo?: Coord): BattleState {
  const attacker = b.stacks.find(s => s.id === attackerId);
  const defender = b.stacks.find(s => s.id === defenderId);
  if (!attacker || !defender) return b;
  const aDef = UNITS[attacker.unitId];
  const newB: BattleState = { ...b, stacks: b.stacks.map(s => ({ ...s, pos: { ...s.pos } })), log: b.log.slice() };
  const a = newB.stacks.find(s => s.id === attackerId)!;
  const d = newB.stacks.find(s => s.id === defenderId)!;
  // Перемещение в approachTo, если задано.
  if (approachTo) a.pos = { ...approachTo };
  // Удар.
  const res = rollDamage(newB, a, d, false);
  d.count = res.newCount;
  d.hp = res.remainingHp;
  newB.log.push(
    battleLine(
      newB.round,
      `${aDef.name} (${a.count}) бьёт ${UNITS[d.unitId].name}: ${res.dmg} урона, убито ${res.killed}`,
    ),
  );
  // Контратака.
  if (d.count > 0 && !d.hasRetaliated && !UNITS[d.unitId].ranged) {
    const ret = rollDamage(newB, d, a, false);
    a.count = ret.newCount;
    a.hp = ret.remainingHp;
    d.hasRetaliated = true;
    newB.log.push(
      battleLine(newB.round, `${UNITS[d.unitId].name} (${d.count}) отвечает: ${ret.dmg} урона, убито ${ret.killed}`),
    );
  }
  return finalizeTurn(newB, a.id);
}

export function doShoot(b: BattleState, attackerId: string, defenderId: string): BattleState {
  const newB: BattleState = { ...b, stacks: b.stacks.map(s => ({ ...s, pos: { ...s.pos } })), log: b.log.slice() };
  const a = newB.stacks.find(s => s.id === attackerId)!;
  const d = newB.stacks.find(s => s.id === defenderId)!;
  if (!a || !d) return b;
  if (!canShoot(newB, a)) return b;
  a.shots -= 1;
  const res = rollDamage(newB, a, d, true);
  d.count = res.newCount;
  d.hp = res.remainingHp;
  newB.log.push(
    battleLine(
      newB.round,
      `${UNITS[a.unitId].name} стреляет в ${UNITS[d.unitId].name}: ${res.dmg} урона, убито ${res.killed}`,
    ),
  );
  return finalizeTurn(newB, a.id);
}

export function doMove(b: BattleState, stackId: string, to: Coord): BattleState {
  const newB: BattleState = { ...b, stacks: b.stacks.map(s => ({ ...s, pos: { ...s.pos } })), log: b.log.slice() };
  const s = newB.stacks.find(st => st.id === stackId)!;
  s.pos = { ...to };
  newB.log.push(battleLine(newB.round, `${UNITS[s.unitId].name} перемещается.`));
  return finalizeTurn(newB, s.id);
}

export function doWait(b: BattleState, stackId: string): BattleState {
  const newB: BattleState = { ...b, stacks: b.stacks.map(s => ({ ...s, pos: { ...s.pos } })), log: b.log.slice() };
  newB.log.push(battleLine(newB.round, `${UNITS[newB.stacks.find(s => s.id === stackId)!.unitId].name} ждёт.`));
  return finalizeTurn(newB, stackId);
}

export function doDefend(b: BattleState, stackId: string): BattleState {
  const newB: BattleState = { ...b, stacks: b.stacks.map(s => ({ ...s, pos: { ...s.pos } })), log: b.log.slice() };
  newB.log.push(battleLine(newB.round, `${UNITS[newB.stacks.find(s => s.id === stackId)!.unitId].name} защищается.`));
  return finalizeTurn(newB, stackId);
}

function finalizeTurn(b: BattleState, justActedId: string): BattleState {
  const s = b.stacks.find(st => st.id === justActedId);
  if (s) s.hasActed = true;
  // Перейти к следующему живому стеку в turnOrder.
  let idx = b.activeStackIdx;
  for (let i = 1; i <= b.turnOrder.length; i++) {
    const candIdx = (idx + i) % b.turnOrder.length;
    const cand = b.stacks.find(st => st.id === b.turnOrder[candIdx]);
    if (cand && cand.count > 0 && !cand.hasActed) {
      return { ...b, activeStackIdx: candIdx };
    }
  }
  // Если все ходили — новый раунд.
  const newStacks = b.stacks.map(st => ({ ...st, hasActed: false, hasRetaliated: false }));
  const newOrder = computeTurnOrder(newStacks, { attackerBonus: b.attackerBonus, defenderBonus: b.defenderBonus });
  return { ...b, stacks: newStacks, turnOrder: newOrder, activeStackIdx: 0, round: b.round + 1 };
}

// =================== ЗАКЛИНАНИЯ ===================

export function getSideMagic(b: BattleState, side: "attacker" | "defender"): BattleMagic {
  return side === "attacker" ? b.attackerMagic : b.defenderMagic;
}

// Может ли сторона кастовать прямо сейчас: есть ли вообще магия, не использовали ли в этом раунде.
export function canCastThisRound(b: BattleState, side: "attacker" | "defender"): boolean {
  const m = getSideMagic(b, side);
  if (m.spells.length === 0) return false;
  return m.lastCastRound !== b.round;
}

// Возможна ли цель для заклинания (по принадлежности к стороне).
export function isValidSpellTarget(
  b: BattleState,
  casterSide: "attacker" | "defender",
  spellId: string,
  targetId: string,
): boolean {
  const sp = getSpell(spellId);
  if (!sp) return false;
  const t = b.stacks.find(s => s.id === targetId);
  if (!t || t.count <= 0) return false;
  if (sp.target === "enemy") return t.side !== casterSide;
  if (sp.target === "ally") return t.side === casterSide;
  return true;
}

export function doCastSpell(
  b: BattleState,
  casterSide: "attacker" | "defender",
  spellId: string,
  targetStackId: string,
): BattleState {
  const sp = getSpell(spellId);
  if (!sp) return b;
  if (!canCastThisRound(b, casterSide)) return b;
  const magic = getSideMagic(b, casterSide);
  if (!magic.spells.includes(spellId)) return b;
  if (magic.mana < sp.manaCost) return b;
  if (!isValidSpellTarget(b, casterSide, spellId, targetStackId)) return b;

  const newB: BattleState = {
    ...b,
    stacks: b.stacks.map(s => ({ ...s, pos: { ...s.pos }, tempBonus: { ...s.tempBonus } })),
    log: b.log.slice(),
    attackerMagic: { ...b.attackerMagic, spells: [...b.attackerMagic.spells] },
    defenderMagic: { ...b.defenderMagic, spells: [...b.defenderMagic.spells] },
  };
  const newMagic = casterSide === "attacker" ? newB.attackerMagic : newB.defenderMagic;
  newMagic.mana -= sp.manaCost;
  newMagic.lastCastRound = newB.round;

  const target = newB.stacks.find(s => s.id === targetStackId)!;
  if (sp.effect === "damage") {
    const raw = sp.basePower + sp.perPower * magic.spellPower;
    const res = applyDamageToStack(newB, target, raw);
    target.count = res.newCount;
    target.hp = res.remainingHp;
    newB.log.push(
      battleLine(
        newB.round,
        `${sp.icon} ${sp.name}: ${res.dmg} урона по ${UNITS[target.unitId].name}, убито ${res.killed}`,
      ),
    );
  } else if (sp.effect === "buffAttack") {
    target.tempBonus.attack += sp.basePower;
    newB.log.push(
      battleLine(newB.round, `${sp.icon} ${sp.name}: +${sp.basePower} к атаке (${UNITS[target.unitId].name})`),
    );
  } else if (sp.effect === "buffSpeed") {
    target.tempBonus.speed += sp.basePower;
    newB.log.push(
      battleLine(newB.round, `${sp.icon} ${sp.name}: +${sp.basePower} к скорости (${UNITS[target.unitId].name})`),
    );
  } else if (sp.effect === "debuffSpeed") {
    target.tempBonus.speed -= sp.basePower;
    newB.log.push(
      battleLine(newB.round, `${sp.icon} ${sp.name}: −${sp.basePower} к скорости (${UNITS[target.unitId].name})`),
    );
  }

  // Эффекты на скорость могут влиять на дальнейший порядок ходов — пересчитаем
  // turnOrder, но только для ещё не сходивших стеков (текущему стеку очередь сохраняем).
  newB.turnOrder = computeTurnOrder(newB.stacks, {
    attackerBonus: newB.attackerBonus,
    defenderBonus: newB.defenderBonus,
  });
  // Восстановить корректный activeStackIdx по id текущего активного.
  const actId = b.turnOrder[b.activeStackIdx];
  const newIdx = newB.turnOrder.indexOf(actId);
  if (newIdx >= 0) newB.activeStackIdx = newIdx;
  return newB;
}

// Адъяцентные пустые клетки рядом с defender, отсортированные по расстоянию до attacker.
export function approachTiles(b: BattleState, attackerId: string, defenderId: string): Coord[] {
  const attacker = b.stacks.find(s => s.id === attackerId);
  const defender = b.stacks.find(s => s.id === defenderId);
  if (!attacker || !defender) return [];
  const reach = reachable(b, attacker);
  const occupied = new Set(b.stacks.filter(s => s.count > 0 && s.id !== attacker.id).map(s => key(s.pos)));
  for (const o of b.obstacles) occupied.add(key(o.pos));
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

// Простой ИИ-кастер: если сторона активного стека ещё не кастовала, есть мана и
// заклинания, выбирает первое атакующее заклинание, которое потянет, и кастует
// на самого живучего врага. Если есть только баффы — кастует на самый сильный свой стек.
function aiCastIfPossible(b: BattleState, side: "attacker" | "defender"): BattleState | null {
  if (!canCastThisRound(b, side)) return null;
  const magic = getSideMagic(b, side);
  const spells = magic.spells.map(getSpell).filter((s): s is NonNullable<ReturnType<typeof getSpell>> => !!s);
  // Атакующее заклинание — приоритет.
  const dmgSpell = spells
    .filter(s => s.effect === "damage" && s.manaCost <= magic.mana)
    .sort((a, b) => b.basePower + b.perPower - (a.basePower + a.perPower))[0];
  if (dmgSpell) {
    const enemies = b.stacks.filter(s => s.side !== side && s.count > 0);
    if (enemies.length === 0) return null;
    const target = enemies.slice().sort((a, b) => b.count * UNITS[b.unitId].hp - a.count * UNITS[a.unitId].hp)[0];
    return doCastSpell(b, side, dmgSpell.id, target.id);
  }
  // Иначе — буф на самый сильный свой стек.
  const buff = spells
    .filter(s => s.effect === "buffAttack" || s.effect === "buffSpeed")
    .find(s => s.manaCost <= magic.mana);
  if (buff) {
    const allies = b.stacks.filter(s => s.side === side && s.count > 0);
    const target = allies.slice().sort((a, b) => b.count * UNITS[b.unitId].hp - a.count * UNITS[a.unitId].hp)[0];
    if (target) return doCastSpell(b, side, buff.id, target.id);
  }
  return null;
}

// ИИ боя: один ход активного стека. Используется и для нейтрального противника, и для ИИ-игрока.
export function stepBattleAI(b: BattleState): { battle: BattleState } {
  const act = activeStack(b);
  if (!act) return { battle: b };
  const enemies = b.stacks.filter(s => s.side !== act.side && s.count > 0);
  if (enemies.length === 0) return { battle: b };
  // Сначала попробуем сколдовать заклинание — каст не расходует ход стека.
  const afterCast = aiCastIfPossible(b, act.side);
  if (afterCast) return { battle: afterCast };
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
    const [x, y] = k.split(",").map(Number);
    const dist = chebyshev({ x, y }, target.pos);
    if (!best || dist < best.d) best = { c: { x, y }, d: dist };
  }
  if (best) return { battle: doMove(b, act.id, best.c) };
  return { battle: doWait(b, act.id) };
}
