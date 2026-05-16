import type { MapTemplate } from '../types';

export const TEMPLATES: MapTemplate[] = [
  {
    id: 'jebus',
    name: 'Jebus Cross',
    description: 'Классический шаблон HotA. Богатый центр, плотные монстры. Карта S.',
    defaultWidth: 36,
    defaultHeight: 36,
    recommendedOpponents: { min: 1, max: 3 },
    resourceDensity: 0.6,
    monsterDensity: 0.5,
    mineCount: 12,
  },
  {
    id: 'h3sw',
    name: '8MM6a',
    description: 'Сбалансированный шаблон для 2 игроков. Карта M.',
    defaultWidth: 48,
    defaultHeight: 48,
    recommendedOpponents: { min: 1, max: 3 },
    resourceDensity: 0.4,
    monsterDensity: 0.4,
    mineCount: 16,
  },
  {
    id: 'rich',
    name: 'Богатый край',
    description: 'Очень много ресурсов, мало монстров. Быстрое развитие.',
    defaultWidth: 36,
    defaultHeight: 36,
    recommendedOpponents: { min: 1, max: 5 },
    resourceDensity: 0.9,
    monsterDensity: 0.15,
    mineCount: 18,
  },
  {
    id: 'rookie',
    name: 'Новичок',
    description: 'Маленькая карта с лёгкими противниками. Для первой игры.',
    defaultWidth: 24,
    defaultHeight: 24,
    recommendedOpponents: { min: 1, max: 2 },
    resourceDensity: 0.5,
    monsterDensity: 0.1,
    mineCount: 8,
  },
];

export function getTemplate(id: string) {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}
