// Базовые константы карты приключений. Вынесены в отдельный модуль, чтобы
// слои-рендереры и контроллер ввода (AdventureScreen) разделяли одни значения.

// Размер тайла в пикселях. Сейчас фиксирован — масштаб карты не настраивается.
export const TILE_SIZE = 32;

// Сколько клеток «воздуха» можно прокрутить за реальные границы карты, чтобы
// содержимое не упиралось в края экрана и боковую панель.
export const EDGE_PADDING_TILES = 5;

// Fallback-цвет тайла, если в terrainPatterns нет готового спрайта для типа.
export const TERRAIN_COLOR: Record<string, string> = {
  grass: "#3a5a2a",
  dirt: "#6b4a2a",
  sand: "#c8a86a",
  snow: "#d8d8e0",
  forest: "#1a3a1a",
  mountain: "#5a4a3a",
  water: "#2a4a8a",
  lava: "#a02a10",
  rough: "#7a6a4a",
};
