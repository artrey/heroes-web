import { generateMap } from '../src/game/map/generate.ts';
import { startBattle, stepBattleAI, isBattleOver } from '../src/game/battle/engine.ts';
import { UNITS } from '../src/game/data/units.ts';
import type { Hero } from '../src/game/types.ts';

console.log('=== Smoke test ===');

// 1. Map generation.
const out = generateMap({
  templateId: 'jebus',
  width: 36, height: 36,
  seed: 12345,
  playerCount: 3,
  factions: ['castle', 'rampart', 'castle'],
});
console.log(`Map: ${out.map.width}x${out.map.height}, objects: ${Object.keys(out.map.objects).length}`);
console.log(`Player starts: ${out.playerStarts.length}`);
const counts: Record<string, number> = {};
for (const obj of Object.values(out.map.objects)) {
  counts[obj.kind] = (counts[obj.kind] ?? 0) + 1;
}
console.log('Objects by kind:', counts);

// 2. Battle simulation.
const attacker: Hero = {
  id: 'h1', ownerId: 'p1', name: 'Атакующий', faction: 'castle',
  pos: { x: 0, y: 0 }, movePoints: 1500, maxMovePoints: 1500,
  army: [
    { unitId: 'pikeman', count: 30 },
    { unitId: 'archer', count: 12 },
    { unitId: 'griffin', count: 5 },
  ],
  level: 1, xp: 0, icon: '🤴',
};
const defender: Hero = {
  ...attacker, id: 'h2', ownerId: 'p2', name: 'Защитник', faction: 'rampart',
  army: [
    { unitId: 'centaur', count: 25 },
    { unitId: 'dwarf', count: 8 },
    { unitId: 'woodElf', count: 6 },
  ],
};
let battle = startBattle({ attackerHero: attacker, defenderHero: defender, defenderObjectId: null });
console.log(`Battle start: ${battle.stacks.length} stacks`);
let i = 0;
let result: 'attacker' | 'defender' | null = null;
while (!result && i < 300) {
  const r = stepBattleAI(battle);
  battle = r.battle;
  result = isBattleOver(battle);
  i++;
}
console.log(`Battle finished after ${i} actions, winner: ${result}, round: ${battle.round}`);
console.log('Attacker remaining:', battle.stacks.filter(s => s.side === 'attacker').map(s => `${UNITS[s.unitId].name}=${s.count}`));
console.log('Defender remaining:', battle.stacks.filter(s => s.side === 'defender').map(s => `${UNITS[s.unitId].name}=${s.count}`));
console.log('Last 5 log lines:', battle.log.slice(-5));

console.log('=== OK ===');
