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

## CI / GitHub Pages

`.github/workflows/ci.yml` на каждый push / PR в `main` гоняет `format:check` → `typecheck` → `build`. На push в `main` ещё деплоит `dist/` на GitHub Pages.

`vite.config.ts` читает `BASE_PATH` из env. В CI оно подставляется как `/<repo-name>/` (через `${{ github.event.repository.name }}`), локально пусто → `base = "/"`. Если делаете локальный билд под Pages — `BASE_PATH=/heroes-web/ npm run build`.

Чтобы Pages заработал, в репозитории один раз: **Settings → Pages → Source: GitHub Actions**.

## Pre-commit hook

Включён `husky` + `lint-staged`. При `git commit` автоматически:

1. `lint-staged` гонит `prettier --write` по изменённым файлам и реcтейджит их.
2. `npm run typecheck` (`tsc --noEmit`) — на всём проекте.

Если хук падает — чинить и коммитить заново. Не использовать `--no-verify` для обхода: если что-то поломалось, надо понять причину.

Хуки переустанавливаются автоматически при `npm install` через `prepare` скрипт.

## Стек

- Vite + React 18 + TypeScript
- Zustand 4 с middleware `persist` (ключ `heroes-web-save`)
- Canvas 2D для карты и боя; React — для UI-экранов
- Без внешних UI-библиотек, без графики/звука (placeholder-эмодзи)

## Сохранения и миграции

**Игра в релизе.** Любое изменение формата `GameState` или вложенных типов должно сопровождаться миграцией в `src/game/state/persist.ts`. Не бампать `version` без `migrate` — у игроков уже есть сохранения, ронять их при апдейте недопустимо.

Алгоритм при изменении формата:

1. Поднять `version` на 1 в `src/game/state/persist.ts`.
2. В функции `migrate(persisted, fromVersion)` добавить ветку `if (fromVersion < <newVersion>) { ... }`. В ней проставить дефолты для новых полей, переименовать/перестроить существующие.
3. Если поле/состояние объективно невозможно восстановить (например, активный бой при крупной правке `BattleState`) — допустимо обнулить только `battle`/`phase`, но не весь сейв.
4. Если новое поле UI-локальное (не должно идти по сети) — добавить его в `LOCAL_STATE_FIELDS` в `src/net/registry.ts`. Иначе оно автоматически попадёт в `snapshotGameState` и улетит клиентам по `broadcastState` — это «безопасный по умолчанию» контракт.

## Архитектура (`src/`)

```
game/
  types.ts            все типы игровой модели (включая MapObject — discriminated union по kind)
  store.ts            тонкая композиция slice'ов через zustand persist
  state/              состояние и действия:
    actions.ts        интерфейс Actions (полный список action'ов)
    initial.ts        initialState + константы (PLAYER_COLORS, HERO_HIRE_COST)
    persist.ts        persist-конфиг + версия + migrate-функция
    helpers/          чистые функции: log, gate, army, economy, ai, levelUp, interactions
    slices/           реализация Actions по доменам: menu, lifecycle, selection,
                      adventure, town, army, battle
    ai/runTurn.ts     ход ИИ на карте (async, с паузами под анимацию UI)
  data/               справочники: units, buildings, heroes, spells, templates, artifacts
  utils/              чистые помощники: rng, A* (pathfind), ресурсы, id, visibility, zoc, heroBonus, leveling, army
  map/generate.ts     процедурная генерация карты (биомы, города 3×2, объекты, шахты)
  battle/engine.ts    пошаговый бой (поле 15×11, инициатива, заклинания, ИИ)
ui/                   UI-слой:
  AdventureScreen.tsx — карта приключений (контроллер ввода + tooltip + sidebar)
  BattleScreen.tsx    — бой (контроллер ввода + tooltip + спеллбук)
  TownScreen.tsx      — город (постройки, найм, гарнизон)
  HeroScreen.tsx, HeroMeetingScreen.tsx — экран героя + встреча
  MainMenu / NewGame / Multiplayer / GameOver — простые экраны
  canvas/             слои рендера карты (terrain/objects/heroes/path/hover/minimap)
  battleCanvas/       слои рендера боя (field/highlight/obstacles/stacks)
  hero/               общие UI-компоненты (ArmyGrid, EquippedGrid, BackpackGrid)
  town/               BuildingsGrid + RecruitCard + 3 модалки (Tavern/Market/MageGuild)
  hooks/              useAnimationLoop (rAF), useCamera (карта)
  settingsStore.ts    zustand-store настроек UI (animSpeed); хранится отдельно от game state
net/
  netStore.ts         состояние сетевой роли (sp/host/client)
  peer.ts             PeerJS-обёртка (host/client transport)
  sync.ts             маршрутизатор: broadcast state ↔ handle incoming
  registry.ts         LOCAL_STATE_FIELDS + автоматический snapshotGameState
```

**Принципы**:

- Внешний API store (`useGame`) — единая точка для UI. Любой UI-компонент берёт нужный action через `useGame(s => s.someAction)`.
- Сетевые action'ы помечаются обёрткой `gate("name", fn)` из `state/helpers/gate.ts`. Само определение `gate` авто-регистрирует имя в `networkedActionNames` — отдельного whitelist'а в sync-слое держать не нужно.
- При добавлении нового вида объекта карты (`obelisk`/`portal`/...): добавить интерфейс в `types.ts` и включить в `MapObject` union. TS подсветит все `switch (obj.kind)`, где нужна новая ветка.
- При добавлении новой `Phase`: TS укажет на `PHASE_SCREENS` в `App.tsx` (Record exhaustive).

## Smoke-test

`scripts/smoke.ts` — головная логика без React: генерация карты + автобой + прогон
store (startGame / endTurn / buildBuilding). Запуск:

```bash
npx esbuild scripts/smoke.ts --bundle --platform=node --format=esm --outfile=./.smoke.mjs --external:zustand --external:zustand/middleware --external:peerjs --external:react --external:react-dom && node ./.smoke.mjs
```

Bundle лежит рядом с `node_modules` (а не в `/tmp`), потому что `zustand`/`peerjs`/`react`
оставлены external и Node резолвит их из проектных `node_modules` относительно файла.
В `/tmp` они бы не нашлись.

Если меняете движок боя, генерацию карты или slices store — прогоняйте этот скрипт.
