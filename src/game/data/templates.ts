import type { MapTemplate } from "../types";

export const CUSTOM_TEMPLATE_ID = "custom";

export const CUSTOM_SIZE_MIN = 24;
export const CUSTOM_SIZE_MAX = 96;

export const TEMPLATES: MapTemplate[] = [
  {
    id: "rookie",
    name: "Новичок",
    description: "Маленькая карта с лёгкими противниками. Для первой игры. Размер S.",
    defaultWidth: 24,
    defaultHeight: 24,
    recommendedOpponents: { min: 1, max: 2 },
    resourceDensity: 0.5,
    monsterDensity: 0.1,
    mineCount: 8,
  },
  {
    id: "duel",
    name: "Дуэль",
    description: "Маленькая, плотная карта 1×1. Мало места — быстрые столкновения. Размер S.",
    defaultWidth: 28,
    defaultHeight: 28,
    recommendedOpponents: { min: 1, max: 1 },
    resourceDensity: 0.45,
    monsterDensity: 0.55,
    mineCount: 8,
  },
  {
    id: "jebus",
    name: "Jebus Cross",
    description: "Классический шаблон HotA. Богатый центр, плотные монстры. Размер S.",
    defaultWidth: 36,
    defaultHeight: 36,
    recommendedOpponents: { min: 1, max: 3 },
    resourceDensity: 0.6,
    monsterDensity: 0.5,
    mineCount: 12,
  },
  {
    id: "rich",
    name: "Богатый край",
    description: "Очень много ресурсов, мало монстров. Быстрое развитие. Размер S.",
    defaultWidth: 36,
    defaultHeight: 36,
    recommendedOpponents: { min: 1, max: 5 },
    resourceDensity: 0.9,
    monsterDensity: 0.15,
    mineCount: 18,
  },
  {
    id: "h3sw",
    name: "8MM6a",
    description: "Сбалансированный шаблон. Просторно, средняя плотность. Размер M.",
    defaultWidth: 48,
    defaultHeight: 48,
    recommendedOpponents: { min: 1, max: 3 },
    resourceDensity: 0.4,
    monsterDensity: 0.4,
    mineCount: 16,
  },
  {
    id: "archipelago",
    name: "Архипелаг",
    description: "Много препятствий и обходных путей, средняя плотность. Размер M.",
    defaultWidth: 52,
    defaultHeight: 52,
    recommendedOpponents: { min: 1, max: 5 },
    resourceDensity: 0.55,
    monsterDensity: 0.45,
    mineCount: 18,
  },
  {
    id: "continent",
    name: "Континент",
    description: "Большая карта для долгой партии. Размер L.",
    defaultWidth: 64,
    defaultHeight: 64,
    recommendedOpponents: { min: 2, max: 6 },
    resourceDensity: 0.45,
    monsterDensity: 0.4,
    mineCount: 24,
  },
  {
    id: "frontier",
    name: "Бескрайние земли",
    description: "Гигантская карта на 4–7 игроков. Долгая партия, простор для героев. Размер XL.",
    defaultWidth: 80,
    defaultHeight: 80,
    recommendedOpponents: { min: 3, max: 7 },
    resourceDensity: 0.4,
    monsterDensity: 0.4,
    mineCount: 32,
  },
  {
    id: CUSTOM_TEMPLATE_ID,
    name: "Произвольная",
    description: `Вы сами задаёте ширину и высоту от ${CUSTOM_SIZE_MIN} до ${CUSTOM_SIZE_MAX} клеток.`,
    defaultWidth: 40,
    defaultHeight: 40,
    recommendedOpponents: { min: 1, max: 7 },
    resourceDensity: 0.5,
    monsterDensity: 0.4,
    mineCount: 16,
  },
];

export function getTemplate(id: string) {
  return TEMPLATES.find(t => t.id === id) ?? TEMPLATES[0];
}
