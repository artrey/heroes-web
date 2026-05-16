// Игровые типы. Терминология близка к HoMM3 / HotA.

export type Faction = "castle" | "rampart";

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
  statBonus: { attack: number; defense: number };
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

export type Phase = "menu" | "newGame" | "adventure" | "town" | "battle" | "heroMeeting" | "hero" | "gameOver";

export interface BattleStack {
  id: string;
  unitId: string;
  count: number;
  hp: number; // hp текущего верхнего юнита (для подсчёта потерь)
  side: "attacker" | "defender";
  pos: Coord; // позиция на гекс-поле (двойные координаты)
  hasActed: boolean;
  hasRetaliated: boolean;
  shots: number;
}

export interface BattleState {
  attackerHeroId: string;
  defenderHeroId: string | null; // null = нейтральные
  defenderObjectId: string | null; // id монстра на карте
  defenderArmy?: UnitStack[]; // если нет героя
  attackerBonus: HeroBonus;
  defenderBonus: HeroBonus;
  xpReward: number; // опыт атакеру за победу
  stacks: BattleStack[];
  turnOrder: string[]; // id stacks по инициативе
  activeStackIdx: number;
  round: number;
  winner: "attacker" | "defender" | null;
  log: string[];
}

export interface NewGameOptions {
  templateId: string;
  mapWidth: number;
  mapHeight: number;
  opponentCount: number;
  playerFaction: Faction;
  playerName: string;
  seed: number;
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
  options: NewGameOptions | null;
  log: string[];
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
