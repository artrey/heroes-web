import type { ResourceBag } from '../types';

export const EMPTY_BAG: ResourceBag = {
  gold: 0, wood: 0, ore: 0, mercury: 0, sulfur: 0, crystal: 0, gems: 0,
};

export function emptyBag(): ResourceBag {
  return { ...EMPTY_BAG };
}

export function canAfford(have: ResourceBag, cost: Partial<ResourceBag>): boolean {
  for (const k in cost) {
    const key = k as keyof ResourceBag;
    if ((have[key] ?? 0) < (cost[key] ?? 0)) return false;
  }
  return true;
}

export function pay(have: ResourceBag, cost: Partial<ResourceBag>): ResourceBag {
  const out = { ...have };
  for (const k in cost) {
    const key = k as keyof ResourceBag;
    out[key] = (out[key] ?? 0) - (cost[key] ?? 0);
  }
  return out;
}

export function add(a: ResourceBag, b: Partial<ResourceBag>): ResourceBag {
  const out = { ...a };
  for (const k in b) {
    const key = k as keyof ResourceBag;
    out[key] = (out[key] ?? 0) + (b[key] ?? 0);
  }
  return out;
}

export const RESOURCE_ICONS: Record<keyof ResourceBag, string> = {
  gold: '🪙', wood: '🪵', ore: '⛏️', mercury: '🧪', sulfur: '🟡', crystal: '💎', gems: '💍',
};

export const RESOURCE_NAMES: Record<keyof ResourceBag, string> = {
  gold: 'Золото', wood: 'Дерево', ore: 'Руда', mercury: 'Ртуть',
  sulfur: 'Сера', crystal: 'Кристаллы', gems: 'Самоцветы',
};
