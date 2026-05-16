import type { UnitDef } from '../types';

// Castle и Rampart, 7 уровней без апгрейдов — для простоты MVP.
// Цифры приближены к HoMM3, но округлены.

export const UNITS: Record<string, UnitDef> = {
  // ===== CASTLE =====
  pikeman: {
    id: 'pikeman', faction: 'castle', name: 'Копейщик', tier: 1, upgraded: false,
    attack: 4, defense: 5, minDmg: 1, maxDmg: 3, hp: 10, speed: 4, initiative: 4,
    ranged: false, flying: false, cost: { gold: 60 }, growth: 14, icon: '🛡️', color: '#c4a572',
  },
  archer: {
    id: 'archer', faction: 'castle', name: 'Лучник', tier: 2, upgraded: false,
    attack: 6, defense: 3, minDmg: 2, maxDmg: 3, hp: 10, speed: 4, initiative: 5,
    shots: 12, ranged: true, flying: false, cost: { gold: 100 }, growth: 9, icon: '🏹', color: '#b5895c',
  },
  griffin: {
    id: 'griffin', faction: 'castle', name: 'Грифон', tier: 3, upgraded: false,
    attack: 8, defense: 8, minDmg: 3, maxDmg: 6, hp: 25, speed: 6, initiative: 7,
    ranged: false, flying: true, cost: { gold: 200 }, growth: 7, icon: '🦅', color: '#d4b483',
  },
  swordsman: {
    id: 'swordsman', faction: 'castle', name: 'Мечник', tier: 4, upgraded: false,
    attack: 10, defense: 12, minDmg: 6, maxDmg: 9, hp: 35, speed: 5, initiative: 5,
    ranged: false, flying: false, cost: { gold: 300 }, growth: 4, icon: '⚔️', color: '#a87854',
  },
  monk: {
    id: 'monk', faction: 'castle', name: 'Монах', tier: 5, upgraded: false,
    attack: 12, defense: 7, minDmg: 10, maxDmg: 12, hp: 30, speed: 5, initiative: 6,
    shots: 12, ranged: true, flying: false, cost: { gold: 400 }, growth: 3, icon: '🙏', color: '#e6d5a8',
  },
  cavalier: {
    id: 'cavalier', faction: 'castle', name: 'Кавалер', tier: 6, upgraded: false,
    attack: 15, defense: 15, minDmg: 15, maxDmg: 25, hp: 100, speed: 7, initiative: 7,
    ranged: false, flying: false, cost: { gold: 1000 }, growth: 2, icon: '🐎', color: '#8b6f47',
  },
  angel: {
    id: 'angel', faction: 'castle', name: 'Ангел', tier: 7, upgraded: false,
    attack: 20, defense: 20, minDmg: 50, maxDmg: 50, hp: 200, speed: 12, initiative: 9,
    ranged: false, flying: true, cost: { gold: 3000, crystal: 1 }, growth: 1, icon: '👼', color: '#f5e6c8',
  },

  // ===== RAMPART =====
  centaur: {
    id: 'centaur', faction: 'rampart', name: 'Кентавр', tier: 1, upgraded: false,
    attack: 5, defense: 3, minDmg: 2, maxDmg: 3, hp: 8, speed: 6, initiative: 5,
    ranged: false, flying: false, cost: { gold: 70 }, growth: 14, icon: '🏹', color: '#7a9c4a',
  },
  dwarf: {
    id: 'dwarf', faction: 'rampart', name: 'Гном', tier: 2, upgraded: false,
    attack: 6, defense: 7, minDmg: 2, maxDmg: 4, hp: 20, speed: 3, initiative: 4,
    ranged: false, flying: false, cost: { gold: 120 }, growth: 8, icon: '⛏️', color: '#8a7a4a',
  },
  woodElf: {
    id: 'woodElf', faction: 'rampart', name: 'Лесной эльф', tier: 3, upgraded: false,
    attack: 9, defense: 5, minDmg: 3, maxDmg: 5, hp: 15, speed: 6, initiative: 6,
    shots: 24, ranged: true, flying: false, cost: { gold: 200 }, growth: 7, icon: '🧝', color: '#5b8a3c',
  },
  pegasus: {
    id: 'pegasus', faction: 'rampart', name: 'Пегас', tier: 4, upgraded: false,
    attack: 9, defense: 8, minDmg: 5, maxDmg: 9, hp: 30, speed: 8, initiative: 7,
    ranged: false, flying: true, cost: { gold: 250 }, growth: 4, icon: '🦄', color: '#a8c8d8',
  },
  dendroid: {
    id: 'dendroid', faction: 'rampart', name: 'Дендроид', tier: 5, upgraded: false,
    attack: 9, defense: 12, minDmg: 10, maxDmg: 14, hp: 55, speed: 3, initiative: 4,
    ranged: false, flying: false, cost: { gold: 350 }, growth: 3, icon: '🌳', color: '#4a6a2a',
  },
  unicorn: {
    id: 'unicorn', faction: 'rampart', name: 'Единорог', tier: 6, upgraded: false,
    attack: 15, defense: 14, minDmg: 18, maxDmg: 22, hp: 90, speed: 7, initiative: 7,
    ranged: false, flying: false, cost: { gold: 850 }, growth: 2, icon: '🦄', color: '#e8e0d0',
  },
  dragon: {
    id: 'dragon', faction: 'rampart', name: 'Зелёный дракон', tier: 7, upgraded: false,
    attack: 18, defense: 18, minDmg: 40, maxDmg: 50, hp: 180, speed: 10, initiative: 8,
    ranged: false, flying: true, cost: { gold: 2400, crystal: 1 }, growth: 1, icon: '🐉', color: '#2f6e2f',
  },
};

export const FACTION_UNIT_ORDER: Record<'castle' | 'rampart', string[]> = {
  castle: ['pikeman', 'archer', 'griffin', 'swordsman', 'monk', 'cavalier', 'angel'],
  rampart: ['centaur', 'dwarf', 'woodElf', 'pegasus', 'dendroid', 'unicorn', 'dragon'],
};

export function getUnit(id: string) {
  const u = UNITS[id];
  if (!u) throw new Error(`Unknown unit: ${id}`);
  return u;
}
