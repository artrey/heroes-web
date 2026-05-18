import { isBattleOver, startBattle, stepBattleAI } from "../src/game/battle/engine.ts";
import { UNITS } from "../src/game/data/units.ts";
import { generateMap } from "../src/game/map/generate.ts";
import type { Hero } from "../src/game/types.ts";

console.log("=== Smoke test ===");

// 1. Map generation.
const out = generateMap({
  templateId: "jebus",
  width: 36,
  height: 36,
  seed: 12345,
  playerCount: 3,
  factions: ["castle", "rampart", "castle"],
});
console.log(`Map: ${out.map.width}x${out.map.height}, objects: ${Object.keys(out.map.objects).length}`);
console.log(`Player starts: ${out.playerStarts.length}`);
const counts: Record<string, number> = {};
for (const obj of Object.values(out.map.objects)) {
  counts[obj.kind] = (counts[obj.kind] ?? 0) + 1;
}
console.log("Objects by kind:", counts);

// 2. Battle simulation.
const attacker: Hero = {
  id: "h1",
  ownerId: "p1",
  name: "Атакующий",
  faction: "castle",
  pos: { x: 0, y: 0 },
  movePoints: 1500,
  maxMovePoints: 1500,
  army: [
    { unitId: "pikeman", count: 30 },
    { unitId: "archer", count: 12 },
    { unitId: "griffin", count: 5 },
  ],
  artifacts: { equipped: {}, backpack: [] },
  level: 1,
  xp: 0,
  statBonus: { attack: 0, defense: 0, spellPower: 0, knowledge: 0 },
  attack: 0,
  defense: 0,
  spellPower: 1,
  knowledge: 1,
  mana: 10,
  maxMana: 10,
  spells: [],
  icon: "🤴",
};
const defender: Hero = {
  ...attacker,
  id: "h2",
  ownerId: "p2",
  name: "Защитник",
  faction: "rampart",
  army: [
    { unitId: "centaur", count: 25 },
    { unitId: "dwarf", count: 8 },
    { unitId: "woodElf", count: 6 },
  ],
};
let battle = startBattle({ attackerHero: attacker, defenderHero: defender, defenderObjectId: null });
console.log(`Battle start: ${battle.stacks.length} stacks`);
let i = 0;
let result: "attacker" | "defender" | null = null;
while (!result && i < 300) {
  const r = stepBattleAI(battle);
  battle = r.battle;
  result = isBattleOver(battle);
  i++;
}
console.log(`Battle finished after ${i} actions, winner: ${result}, round: ${battle.round}`);
console.log(
  "Attacker remaining:",
  battle.stacks.filter(s => s.side === "attacker").map(s => `${UNITS[s.unitId].name}=${s.count}`),
);
console.log(
  "Defender remaining:",
  battle.stacks.filter(s => s.side === "defender").map(s => `${UNITS[s.unitId].name}=${s.count}`),
);
console.log("Last 5 log lines:", battle.log.slice(-5));

// 3. Бонусы артефактов: повторяем тот же бой с надетым "Мечом Гогнара" у атакующего.
const attackerBuffed: Hero = {
  ...attacker,
  artifacts: { equipped: { weapon: "sword_judgement" }, backpack: [] },
};
let battle2 = startBattle({ attackerHero: attackerBuffed, defenderHero: defender, defenderObjectId: null });
let i2 = 0;
let res2: "attacker" | "defender" | null = null;
while (!res2 && i2 < 300) {
  battle2 = stepBattleAI(battle2).battle;
  res2 = isBattleOver(battle2);
  i2++;
}
console.log(`With +12 atk artifact: ${i2} actions, winner: ${res2}, round: ${battle2.round}`);
console.log(
  "Attacker remaining:",
  battle2.stacks.filter(s => s.side === "attacker").map(s => `${UNITS[s.unitId].name}=${s.count}`),
);

// 4. Store integration. Прогоняем стор через несколько ходов: startGame →
//    endTurn × N → moveHeroTo. Цель — поймать регрессии в slices (lifecycle /
//    adventure / town / battle), которые движок battle/engine не покрывает.
//
//    Особенности окружения:
//      - В Node нет localStorage, а zustand persist его дёргает. Мокаем
//        пустой Storage перед dynamic import store.
//      - runAiTurn — async и опирается на settingsStore.animSpeed для пауз.
//        Ставим "instant", чтобы тест не висел секундами.
//      - Импорт через `await import(...)` — нужен, чтобы мок встал ДО того,
//        как сам store будет инициализирован (top-level ESM imports hoisted).

(globalThis as { localStorage?: Storage }).localStorage = {
  length: 0,
  key: () => null,
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
} as Storage;

const { useGame } = await import("../src/game/store.ts");
const { useSettings } = await import("../src/ui/settingsStore.ts");
useSettings.getState().setAnimSpeed("instant");

useGame.getState().startGame({
  templateId: "jebus",
  mapWidth: 30,
  mapHeight: 30,
  opponentCount: 1,
  playerFaction: "castle",
  playerName: "Тест",
  seed: 777,
  difficulty: "normal",
});
const s0 = useGame.getState();
console.log("After startGame:", {
  phase: s0.phase,
  players: Object.keys(s0.players).length,
  heroes: Object.keys(s0.heroes).length,
  towns: Object.keys(s0.towns).length,
  map: s0.map ? `${s0.map.width}x${s0.map.height}` : "null",
});

// Полайн до возврата хода к человеку. AI ходит через setTimeout(0), поэтому
// после endTurn нужно дать event loop'у прокрутиться.
async function waitForHumanTurn(maxMs = 5000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const s = useGame.getState();
    const active = s.players[s.activePlayerId];
    if (active?.isHuman) return true;
    if (s.battle || s.winnerId) return true;
    await new Promise(r => setTimeout(r, 10));
  }
  return false;
}

// 5 ходов: каждый раз сдаём ход → ждём пока ИИ отыграет и передаст обратно.
for (let i = 0; i < 5; i++) {
  useGame.getState().endTurn();
  const ok = await waitForHumanTurn();
  if (!ok) {
    console.log(`Turn ${i + 1}: AI didn't yield in time`);
    break;
  }
}
const s1 = useGame.getState();
console.log("After 5 endTurn:", {
  day: s1.day,
  week: s1.week,
  activePlayer: s1.activePlayerId,
  log: s1.log.length,
  winnerId: s1.winnerId,
});

// Попробуем построить что-то в первом городе и нанять одного юнита, если ИИ
// нам что-то оставил. Без assertions — просто чтобы пайплайн action'ов отыграл.
const sNow = useGame.getState();
const humanPlayer = Object.values(sNow.players).find(p => p.isHuman);
const myTown = humanPlayer ? sNow.towns[humanPlayer.townIds[0]] : null;
if (myTown && !myTown.builtToday) {
  // Попробуем самое дешёвое из доступных.
  const builtSet = new Set(myTown.built);
  // marketplace обычно дешёвый и без prereq.
  const ok = useGame.getState().buildBuilding(myTown.id, "marketplace");
  console.log(
    `buildBuilding(marketplace) → ${ok}, town.built=${myTown.built.length} → ${useGame.getState().towns[myTown.id].built.length}`,
  );
  void builtSet;
}

console.log("=== OK ===");
