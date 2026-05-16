# CLAUDE.md

Инструкции для Claude Code и других агентов, работающих в этом репозитории.

## Definition of done

Любая задача считается выполненной только если выполнено всё:

1. `npx tsc --noEmit` — без ошибок
2. `npm run format:check` — без ошибок (или сначала `npm run format`, чтобы починить)
3. `npm run build` — успешный билд

Если в будущем появится ESLint / `npm test` — добавлять их в этот же список и проверять перед сдачей задачи.

## Форматирование

Стиль кода фиксирует `.prettierrc` (двойные кавычки, ширина 120, без скобок у одинарных аргументов arrow-функций, сортировка импортов через `@ianvs/prettier-plugin-sort-imports`). Не править форматирование руками — всегда через `npm run format`.

## Стек

- Vite + React 18 + TypeScript
- Zustand 4 с middleware `persist` (ключ `heroes-web-save`)
- Canvas 2D для карты и боя; React — для UI-экранов
- Без внешних UI-библиотек, без графики/звука (placeholder-эмодзи)

## Архитектура (`src/`)

```
game/
  types.ts            все типы игровой модели
  store.ts            zustand store + действия + ИИ карты
  data/               справочники: units, buildings, heroes, templates
  utils/              rng, A*, ресурсы, id
  map/generate.ts     процедурная генерация
  battle/engine.ts    пошаговый бой (поле 15×11, инициатива)
ui/                   React-экраны: MainMenu / NewGame / Adventure / Town / Battle / GameOver
```

## Smoke-test

`scripts/smoke.ts` — головная логика без React (генерация карты + автобой). Запуск:

```bash
npx esbuild scripts/smoke.ts --bundle --platform=node --format=esm --outfile=/tmp/smoke.mjs && node /tmp/smoke.mjs
```

Если меняете движок боя или генерацию карты — прогоняйте этот скрипт.
