// Игровые типы. Терминология близка к HoMM3 / HotA.

export type Faction =
  | "castle"
  | "rampart"
  | "tower"
  | "inferno"
  | "necropolis"
  | "dungeon"
  | "stronghold"
  | "fortress"
  | "conflux";

export type Resource = "gold" | "wood" | "ore" | "mercury" | "sulfur" | "crystal" | "gems";

export type ResourceBag = Record<Resource, number>;

export type Terrain = "grass" | "dirt" | "sand" | "snow" | "forest" | "mountain" | "water" | "lava" | "rough";

export interface Coord {
  x: number;
  y: number;
}

export interface UnitStack {
  unitId: string;
  count: number;
}

export interface UnitDef {
  id: string;
  faction: Faction;
  name: string;
  tier: number;
  upgraded: boolean;
  attack: number;
  defense: number;
  minDmg: number;
  maxDmg: number;
  hp: number;
  speed: number;
  initiative: number;
  shots?: number;
  ranged: boolean;
  flying: boolean;
  cost: Partial<ResourceBag>;
  growth: number;
  icon: string; // эмодзи / placeholder
  color: string;
}

export interface BuildingDef {
  id: string;
  name: string;
  description: string;
  cost: Partial<ResourceBag>;
  prereq?: string[]; // id других построек
  produces?: string; // unitId жилища
  givesGoldPerDay?: number;
  icon: string;
}

export type ArtifactSlot = "helm" | "neck" | "weapon" | "shield" | "armor" | "ring" | "feet";

export const ARTIFACT_SLOT_ORDER: ArtifactSlot[] = ["helm", "neck", "weapon", "shield", "armor", "ring", "feet"];

export interface HeroBonus {
  attack: number;
  defense: number;
  speed: number;
  hpBonus: number;
  movement: number;
  // Магические бонусы от артефактов.
  spellPower: number;
  knowledge: number;
  // Процентная прибавка к максимальной мане (умножается на mana от знаний),
  // например 50 = +50% к лимиту маны.
  manaMult: number;
}

export interface HeroArtifacts {
  equipped: Partial<Record<ArtifactSlot, string>>;
  backpack: string[];
}

export interface Hero {
  id: string;
  ownerId: string; // playerId
  name: string;
  faction: Faction;
  pos: Coord;
  movePoints: number;
  maxMovePoints: number; // base без бонусов от артефактов
  army: UnitStack[]; // до 7 слотов
  artifacts: HeroArtifacts;
  level: number;
  xp: number;
  // Прибавки от повышения уровней. Со временем сюда копятся +1 к одной из
  // четырёх характеристик за каждый уровень.
  statBonus: { attack: number; defense: number; spellPower: number; knowledge: number };
  // Базовые характеристики героя (раздаются по 8 очков, мин. 1 в каждой).
  // Эффективная атака/защита/SP/знания = база + statBonus + бонусы артефактов.
  attack: number;
  defense: number;
  spellPower: number;
  knowledge: number;
  // maxMana = knowledge * 10 (хранится для удобства, эффективная считается из totals).
  mana: number;
  maxMana: number;
  spells: string[]; // id выученных заклинаний
  icon: string;
}

export interface ArtifactDef {
  id: string;
  name: string;
  rarity: "treasure" | "minor" | "major" | "relic";
  slot: ArtifactSlot;
  bonus: Partial<HeroBonus>;
  icon: string;
  description: string;
}

export interface Town {
  id: string;
  ownerId: string | null;
  name: string;
  faction: Faction;
  pos: Coord;
  built: string[]; // id построенных зданий
  builtToday: boolean;
  garrison: UnitStack[]; // до 7 слотов
  availableUnits: Record<string, number>; // unitId -> сколько доступно к найму
  hasFort: boolean;
  // Уровень построенной гильдии магов (0 = нет; 1..3 = соответствующий уровень).
  mageGuildLevel: number;
  // Заклинания, доступные к изучению в этом городе. Заполняется при постройке очередного
  // уровня гильдии магов — обычно все заклинания текущего и предыдущих уровней.
  learnedSpells: string[];
}

export type ObjectKind =
  | "resource"
  | "mine"
  | "dwelling"
  | "monster"
  | "artifact"
  | "chest"
  | "sign"
  | "tree"
  | "mountain";

export interface MapObject {
  id: string;
  kind: ObjectKind;
  pos: Coord;
  ownerId?: string | null;
  // для resource
  resource?: Resource;
  amount?: number;
  // для mine
  mineResource?: Resource;
  mineYield?: number;
  // для monster
  unitId?: string;
  unitCount?: number;
  // для artifact / chest
  artifactId?: string;
  goldAmount?: number;
  visited?: string[]; // ids героев, которые уже посетили (для не-удаляемых объектов)
  blocking: boolean;
  passable: boolean; // можно ли встать на этот тайл (флаг, мост и т.д.)
  icon: string;
}

export interface Tile {
  terrain: Terrain;
  passable: boolean;
  objectId: string | null;
}

export interface GameMap {
  width: number;
  height: number;
  tiles: Tile[]; // row-major
  objects: Record<string, MapObject>;
}

export interface Player {
  id: string;
  name: string;
  color: string;
  faction: Faction;
  isHuman: boolean;
  defeated: boolean;
  resources: ResourceBag;
  heroIds: string[];
  townIds: string[];
  revealed: Record<string, true>; // ключ "x,y" — все тайлы, которые игрок когда-либо видел
}

export const VISION_RADIUS_HERO = 5;
export const VISION_RADIUS_TOWN = 6;

export type Phase =
  | "menu"
  | "newGame"
  | "multiplayer"
  | "adventure"
  | "town"
  | "battle"
  | "heroMeeting"
  | "hero"
  | "gameOver";

// Временный бонус от заклинаний/баффов, действующий до конца боя.
export interface StackTempBonus {
  attack: number;
  defense: number;
  speed: number;
  minDmg: number; // прибавка к минимальному и максимальному урону на юнит
}

export interface BattleStack {
  id: string;
  unitId: string;
  count: number;
  hp: number; // hp текущего верхнего юнита (для подсчёта потерь)
  side: "attacker" | "defender";
  pos: Coord; // позиция на гекс-поле (двойные координаты)
  hasActed: boolean;
  hasRetaliated: boolean;
  // Стек воспользовался «ожиданием»: его ход переносится в конец раунда,
  // где waiters ходят в обратном порядке инициативы.
  hasWaited: boolean;
  // +N к защите от действия «Защита», действует до конца раунда (в новом — 0).
  defendDefenseBonus: number;
  shots: number;
  tempBonus: StackTempBonus;
}

export interface BattleObstacle {
  pos: Coord;
  icon: string;
}

// Магическая «сила сторон» в бою — берётся из соответствующего героя; 0 если героя нет.
export interface BattleMagic {
  mana: number;
  spellPower: number;
  knowledge: number;
  spells: string[];
  // В каком раунде в последний раз кастовали — чтобы разрешить 1 каст в раунд.
  lastCastRound: number;
}

export interface BattleState {
  attackerHeroId: string;
  defenderHeroId: string | null; // null = нейтральные
  defenderObjectId: string | null; // id монстра на карте
  defenderArmy?: UnitStack[]; // если нет героя
  attackerBonus: HeroBonus;
  defenderBonus: HeroBonus;
  attackerMagic: BattleMagic;
  defenderMagic: BattleMagic;
  xpReward: number; // опыт атакеру за победу
  obstacles: BattleObstacle[]; // случайные препятствия на поле — клетки заблокированы
  stacks: BattleStack[];
  turnOrder: string[]; // id stacks по инициативе
  activeStackIdx: number;
  round: number;
  winner: "attacker" | "defender" | null;
  log: string[];
}

// Заклинания.
export type SpellSchool = "fire" | "water" | "air" | "earth" | "light";
export type SpellTargetKind = "enemy" | "ally" | "any";
export type SpellEffectKind =
  | "damage"
  | "heal"
  | "buffAttack"
  | "buffDefense"
  | "buffSpeed"
  | "debuffAttack"
  | "debuffDefense"
  | "debuffSpeed";

export interface SpellDef {
  id: string;
  name: string;
  icon: string;
  level: 1 | 2 | 3;
  school: SpellSchool;
  target: SpellTargetKind;
  effect: SpellEffectKind;
  manaCost: number;
  // base — фиксированная часть, perPower — добавка за единицу spellPower.
  // Для урона: суммарный damage = base + perPower * SP.
  // Для бафа/дебафа speed/attack — на сколько изменить (perPower может быть 0).
  basePower: number;
  perPower: number;
  description: string;
}

export type Difficulty = "easy" | "normal" | "hard";

export interface NewGameOptions {
  templateId: string;
  mapWidth: number;
  mapHeight: number;
  opponentCount: number;
  playerFaction: Faction;
  playerName: string;
  seed: number;
  difficulty: Difficulty;
  // Сколько игроков-людей у нас в партии. В одиночке = 1. В MP host задаёт
  // нужное число; первые `numHumans` слотов считаются «живыми», остальные — ИИ.
  numHumans?: number;
  // Фракции человеческих слотов в порядке очерёдности (если задано, перекрывают
  // playerFaction). Используется host'ом в MP, чтобы каждый из живых игроков
  // получил свой выбранный город.
  humanFactions?: Faction[];
}

// Указатель на конкретный слот армии — у героя или в гарнизоне города. Используется
// действием splitStack, чтобы единообразно описать «откуда → куда» при разделении
// и слиянии отрядов.
export type ArmySlotRef =
  | { kind: "hero"; heroId: string; slot: number }
  | { kind: "garrison"; townId: string; slot: number };

// Запись в журнале приключений. playerId === undefined → запись «глобальная»
// (новый день, конец игры) и видна всем. Иначе UI показывает её только
// игроку с этим id — чтобы не «подсматривать» за чужими ходами.
export interface LogEntry {
  text: string;
  playerId?: string;
}

export interface GameState {
  phase: Phase;
  day: number;
  week: number;
  month: number;
  activePlayerId: string;
  players: Record<string, Player>;
  playerOrder: string[];
  heroes: Record<string, Hero>;
  towns: Record<string, Town>;
  map: GameMap | null;
  battle: BattleState | null;
  selectedHeroId: string | null;
  selectedTownId: string | null;
  meetingHeroIds: [string, string] | null;
  pendingObjectVisit: string | null;
  // Цель, к которой герой направлялся через бой со стражей: после победы движение продолжается.
  pendingMoveAfterCombat: { heroId: string; target: Coord } | null;
  // Отложенная интеракция с объектом: герой уже шагнул на/к объекту, но
  // визуально ещё идёт анимация перемещения. Сам взаимодействие (подбор предмета,
  // захват шахты, запуск боя с монстром) выполняется после её окончания через
  // commitInteraction — иначе игрок видит «кликнул → предмет исчез → герой едет
  // на пустую клетку».
  pendingInteraction: { objectId: string; heroId: string } | null;
  options: NewGameOptions | null;
  log: LogEntry[];
  winnerId: string | null;
}

export interface MapTemplate {
  id: string;
  name: string;
  description: string;
  defaultWidth: number;
  defaultHeight: number;
  recommendedOpponents: { min: number; max: number };
  resourceDensity: number; // 0..1
  monsterDensity: number;
  mineCount: number;
}
