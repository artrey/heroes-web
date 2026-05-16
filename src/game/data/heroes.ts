import type { Faction } from '../types';

interface HeroProto {
  name: string;
  faction: Faction;
  icon: string;
  startingArmy: { unitId: string; min: number; max: number }[];
}

export const HERO_PROTOS: HeroProto[] = [
  { name: 'Орин', faction: 'castle', icon: '🤴', startingArmy: [
    { unitId: 'pikeman', min: 20, max: 30 },
    { unitId: 'archer', min: 2, max: 5 },
  ]},
  { name: 'Валеска', faction: 'castle', icon: '👸', startingArmy: [
    { unitId: 'pikeman', min: 15, max: 25 },
    { unitId: 'archer', min: 5, max: 8 },
  ]},
  { name: 'Айвор', faction: 'rampart', icon: '🧝‍♂️', startingArmy: [
    { unitId: 'centaur', min: 15, max: 25 },
    { unitId: 'dwarf', min: 3, max: 6 },
  ]},
  { name: 'Кларансей', faction: 'rampart', icon: '🧝‍♀️', startingArmy: [
    { unitId: 'centaur', min: 10, max: 20 },
    { unitId: 'woodElf', min: 1, max: 3 },
  ]},
];

export function pickHeroProto(faction: Faction, rng: () => number) {
  const list = HERO_PROTOS.filter((h) => h.faction === faction);
  return list[Math.floor(rng() * list.length)];
}
