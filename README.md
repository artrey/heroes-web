# Heroes Web — браузерный прототип в духе HoMM3 / HotA

Прототип пошаговой стратегии: процедурно генерируемая карта, 9 фракций, найм героев в таверне, пошаговый бой с магией и артефактами, ИИ-противники, hot-seat по PeerJS. Прогресс автоматически сохраняется в `localStorage`.

## Запуск

```bash
npm install
npm run dev
```

Откройте http://127.0.0.1:5173/.

Production-билд: `npm run build`, превью: `npm run preview`. Для локального билда под GitHub Pages — `BASE_PATH=/heroes-web/ npm run build`.

## Управление

**Главное меню → Новая игра**: выберите шаблон карты (8 пресетов + custom-размер), фракцию, число противников, сложность и seed. Можно зайти и в режим **Мультиплеер** (PeerJS, host/client).

**Карта приключений:**

- Клик по герою — выбрать; клик по карте — переместить выбранного героя по A\*-пути.
- Жёлтые точки пути — клетки, доступные за этот ход; красные — не хватает MP.
- Клик по своему городу — открыть город; повторный клик по выбранному герою — экран героя.
- `↵ Enter` — завершить ход. Стрелки/drag — прокрутка карты. Колесо — зум.

**Город:** левая часть — постройки (не более 1 в день), правая — найм юнитов из жилищ, гарнизон и обмен с героем. Отдельные модалки: Таверна (найм героев), Рынок (обмен ресурсов), Гильдия магов (изучение заклинаний).

**Экран героя:** инвентарь артефактов (7 слотов экипировки + рюкзак), 7 слотов армии. Drag-and-drop между слотами и экраном встречи героев.

**Бой:** активный стек подсвечен. Клик по врагу — атаковать (поддержана стрельба); клик по пустой клетке — переместиться. Кнопки «Ждать», «Защита», «Автобой», «Заклинания» (если выучены и хватает маны).

## Tech stack

- Vite + React 18 + TypeScript
- Zustand 4 c middleware `persist` (key `heroes-web-save`) + миграции при изменении формата
- Canvas 2D для карты и боя; React — для UI-экранов
- PeerJS для P2P-мультиплеера (host + клиенты)
- Без внешних UI-библиотек, без графики/звука (placeholder-эмодзи и цветные плашки)

## Структура

```
src/
  game/
    types.ts             все типы игровой модели (MapObject — discriminated union)
    store.ts             zustand-store, тонкая композиция slice'ов
    state/
      actions.ts         интерфейс Actions (полный список action'ов)
      initial.ts         initialState + константы
      persist.ts         persist-конфиг + version + migrate
      helpers/           чистые функции: log, gate, army, economy, ai, levelUp, interactions
      slices/            реализация Actions по доменам: menu, lifecycle, selection,
                         adventure, town, army, battle
      ai/runTurn.ts      ход ИИ на карте (async, с паузами под анимацию UI)
    data/                справочники: units, buildings, heroes, spells, templates,
                         artifacts, factions, difficulty, marketRates
    utils/               чистые помощники: rng, A* (pathfind), ресурсы, id, visibility,
                         zoc, heroBonus, leveling, army, income
    map/generate.ts      процедурная генерация карты (биомы, города 3×2, объекты, шахты)
    battle/engine.ts     пошаговый бой (поле 15×11, инициатива, заклинания, ИИ)
  ui/                    React-экраны и подкомпоненты
    AdventureScreen / BattleScreen / TownScreen / HeroScreen / HeroMeetingScreen /
    MainMenu / NewGameScreen / MultiplayerScreen / GameOverScreen
    canvas/              слои рендера карты (terrain/objects/heroes/path/hover/minimap)
    battleCanvas/        слои рендера боя (field/highlight/obstacles/stacks)
    hero/                ArmyGrid, EquippedGrid, BackpackGrid
    town/                BuildingsGrid, RecruitCard, Tavern/Market/MageGuild
    hooks/               useAnimationLoop (rAF), useCamera (карта)
  net/
    netStore.ts          состояние сетевой роли (sp/host/client)
    peer.ts              PeerJS-обёртка (host/client transport)
    sync.ts              маршрутизатор: broadcast state ↔ handle incoming
    registry.ts          LOCAL_STATE_FIELDS + автоматический snapshotGameState
```

## Что есть

- 9 фракций HotA (Castle, Rampart, Tower, Inferno, Necropolis, Dungeon, Stronghold, Fortress, Conflux) — по 7 уровней юнитов, жилища, форт/цитадель/замок, ратуши, рынок, таверна, гильдия магов
- генерация карты по 8 шаблонам + custom-размер (24…96), 7 типов ресурсов, шахты, сундуки, артефакты, нейтральные монстры, деревья и горы как препятствия
- герой: до 7 слотов армии, 7 слотов экипировки артефактов + рюкзак, движение по карте, A\*-pathfinding с учётом ZoC и видимости
- 24 артефакта 3 редкостей, бонусы к атаке/защите/SP/MP/movement
- система прокачки героя (level-up, бонусы статов)
- пошаговый бой с инициативой, контратакой, стрельбой, ожиданием/защитой/автобоем
- 10 заклинаний (3 уровня) — Гильдия магов даёт случайный набор; в бою — мана, школы, баффы/дебаффы, урон, лечение
- ИИ карты: постройки, найм, движение к ресурсам/городам, нападение на героев
- автосохранение в localStorage + миграции при обновлении формата
- мультиплеер по PeerJS (host + клиенты, лобби, синхронизация состояния)
- настройка скорости анимации боя

## Чего нет

- навыков героев и вторичных умений (только базовые статы и SP/Knowledge)
- кампаний и сюжета
- остальных артефактов и заклинаний из HotA (есть подмножество)
- реальных спрайтов и звука — placeholder-эмодзи и цветные плашки

## Сохранения

Сохранение лежит в `localStorage` под ключом `heroes-web-save`. Игра в релизе, поэтому **любое изменение формата `GameState`** должно сопровождаться миграцией в `src/game/state/persist.ts` (поднять `version`, добавить ветку в `migrate`). Не ронять сохранения игроков.

Стереть сохранение: «Удалить сохранение» в главном меню или `localStorage.removeItem('heroes-web-save')` в консоли.

## CI / GitHub Pages

`.github/workflows/ci.yml` на каждый push / PR в `main` гоняет `format:check` → `typecheck` → `build`. На push в `main` ещё деплоит `dist/` на GitHub Pages.

Для работы Pages один раз в репозитории: **Settings → Pages → Source: GitHub Actions**.

## Definition of done

Любая задача считается выполненной, только если все три команды проходят без ошибок:

1. `npx tsc --noEmit`
2. `npm run format:check` (или `npm run format` для починки)
3. `npm run build`

Прекоммит-хук (`husky` + `lint-staged`) автоматически гонит `prettier --write` по изменённым файлам и `tsc --noEmit` на всём проекте. Не обходить через `--no-verify`.

## Smoke-test

`scripts/smoke.ts` — головная логика без React: генерация карты + автобой + прогон store. Запуск:

```bash
npx esbuild scripts/smoke.ts --bundle --platform=node --format=esm \
  --outfile=./.smoke.mjs --external:zustand --external:zustand/middleware \
  --external:peerjs --external:react --external:react-dom \
  && node ./.smoke.mjs
```

Прогонять при изменениях в движке боя, генерации карты или slices store.
