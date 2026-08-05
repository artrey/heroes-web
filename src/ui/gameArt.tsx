import type { CSSProperties, ReactNode } from "react";

import type { Faction, Resource } from "../game/types";

export interface SpriteRef {
  src: string;
  fallbackSrc?: string;
}

const BASE = (import.meta as ImportMeta & { env: { BASE_URL: string } }).env.BASE_URL;

type IconGroup = "creatures" | "interface" | "magic";

function iconPath(group: IconGroup, file: string): string {
  return `${BASE}assets/icons/${group}/${file}.webp?v=3`;
}

function iconSprite(group: IconGroup, file: string, fallbackFile?: string): SpriteRef {
  return {
    src: iconPath(group, file),
    fallbackSrc: fallbackFile ? iconPath(group, fallbackFile) : undefined,
  };
}

export const UI_SPRITE = {
  attack: "attack",
  defense: "defense",
  spellPower: "spell-power",
  knowledge: "knowledge",
  mana: "mana",
  movement: "movement",
  health: "health",
  luck: "luck",
  calendar: "calendar",
  map: "map",
  scroll: "scroll",
  spellbook: "spellbook",
  lock: "lock",
  build: "build",
  dice: "dice",
  multiplayer: "multiplayer",
  town: "town",
  tavern: "tavern",
  market: "market",
  mageGuild: "mage-guild",
  mine: "mine",
  treasury: "treasury",
  dwelling: "dwelling",
  treasure: "treasure",
  forest: "forest",
  mountain: "mountain",
  cactus: "cactus",
  mushroom: "mushroom",
  log: "log",
  rock: "rock",
  trophy: "trophy",
  backpack: "backpack",
  player: "player",
  party: "party",
  meeting: "meeting",
  crown: "crown",
  door: "door",
  slow: "slow",
  normal: "normal",
  fast: "fast",
  instant: "instant",
  clipboard: "clipboard",
  coin: "coin",
  victory: "victory",
  defeat: "defeat",
  unknown: "unknown",
  transfer: "transfer",
  construction: "construction",
} as const;

type UiSpriteName = keyof typeof UI_SPRITE;

export function unitSprite(id: string): SpriteRef {
  return iconSprite("creatures", id, "unknown");
}

export function factionSprite(faction: Faction): SpriteRef {
  return iconSprite("interface", `faction-${faction}`);
}

export function resourceSprite(resource: Resource): SpriteRef {
  return iconSprite("interface", `resource-${resource}`);
}

export function uiSprite(name: UiSpriteName): SpriteRef {
  return iconSprite("interface", `ui-${UI_SPRITE[name]}`);
}

export function artifactSprite(id: string): SpriteRef {
  return iconSprite("magic", `artifact-${id}`, "unknown");
}

export function spellSprite(id: string): SpriteRef {
  return iconSprite("magic", `spell-${id}`, "unknown");
}

export function slotSprite(slot: "helm" | "neck" | "weapon" | "shield" | "armor" | "ring" | "feet"): SpriteRef {
  return iconSprite("magic", `slot-${slot}`);
}

interface GameIconProps {
  sprite: SpriteRef;
  size?: number;
  className?: string;
  title?: string;
}

export function GameIcon({ sprite, size = 24, className = "", title }: GameIconProps): ReactNode {
  const style = {
    "--icon-size": `${size}px`,
  } as CSSProperties;

  return (
    <span aria-hidden="true" className={`game-icon ${className}`.trim()} style={style} title={title}>
      <img
        alt=""
        draggable={false}
        src={sprite.src}
        onError={event => {
          if (!sprite.fallbackSrc || event.currentTarget.dataset.fallback === "true") return;
          event.currentTarget.dataset.fallback = "true";
          event.currentTarget.src = sprite.fallbackSrc;
        }}
      />
    </span>
  );
}

export function UnitIcon({ id, ...props }: Omit<GameIconProps, "sprite"> & { id: string }): ReactNode {
  return <GameIcon sprite={unitSprite(id)} {...props} />;
}

export function FactionIcon({ faction, ...props }: Omit<GameIconProps, "sprite"> & { faction: Faction }): ReactNode {
  return <GameIcon sprite={factionSprite(faction)} {...props} />;
}

export function ResourceIcon({
  resource,
  ...props
}: Omit<GameIconProps, "sprite"> & { resource: Resource }): ReactNode {
  return <GameIcon sprite={resourceSprite(resource)} {...props} />;
}

export function UiIcon({ name, ...props }: Omit<GameIconProps, "sprite"> & { name: UiSpriteName }): ReactNode {
  return <GameIcon sprite={uiSprite(name)} {...props} />;
}

export function ArtifactIcon({ id, ...props }: Omit<GameIconProps, "sprite"> & { id: string }): ReactNode {
  return <GameIcon sprite={artifactSprite(id)} {...props} />;
}

export function SpellIcon({ id, ...props }: Omit<GameIconProps, "sprite"> & { id: string }): ReactNode {
  return <GameIcon sprite={spellSprite(id)} {...props} />;
}

const spriteImages = new Map<string, HTMLImageElement>();
const spriteLoadListeners = new Set<() => void>();
const pendingSpriteDraws = new Map<
  string,
  Array<{ ctx: CanvasRenderingContext2D; cx: number; cy: number; size: number }>
>();

export function subscribeToSpriteLoads(listener: () => void): () => void {
  spriteLoadListeners.add(listener);
  return () => spriteLoadListeners.delete(listener);
}

function notifySpriteLoaded(): void {
  spriteLoadListeners.forEach(listener => listener());
}

function flushPendingSpriteDraws(src: string, image: HTMLImageElement): void {
  const pending = pendingSpriteDraws.get(src);
  if (!pending) return;
  pendingSpriteDraws.delete(src);
  pending.forEach(({ ctx, cx, cy, size }) => {
    ctx.drawImage(image, cx - size / 2, cy - size / 2, size, size);
  });
}

function getSpriteImage(sprite: SpriteRef): HTMLImageElement | null {
  if (typeof Image === "undefined") return null;
  const existing = spriteImages.get(sprite.src);
  if (existing) return existing;
  const image = new Image();
  if (sprite.fallbackSrc) {
    let fallbackApplied = false;
    image.onerror = () => {
      if (fallbackApplied) return;
      fallbackApplied = true;
      image.src = sprite.fallbackSrc ?? "";
    };
  }
  image.onload = () => {
    flushPendingSpriteDraws(sprite.src, image);
    notifySpriteLoaded();
  };
  image.src = sprite.src;
  spriteImages.set(sprite.src, image);
  return image;
}

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: SpriteRef,
  cx: number,
  cy: number,
  size: number,
): void {
  const image = getSpriteImage(sprite);
  if (!image?.complete || !image.naturalWidth) {
    const pending = pendingSpriteDraws.get(sprite.src) ?? [];
    pending.push({ ctx, cx, cy, size });
    pendingSpriteDraws.set(sprite.src, pending);
    return;
  }
  ctx.drawImage(image, cx - size / 2, cy - size / 2, size, size);
}
