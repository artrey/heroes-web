import type { LogEntry } from "../../types";

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function clockTag(): string {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

// Префикс игрового дня + локальное время. playerId — кому видна запись (UI
// фильтрует). undefined → глобальное событие.
export function logLine(day: number, text: string, playerId?: string): LogEntry {
  return { text: `[${clockTag()}] [Д${day}] ${text}`, playerId };
}

// Удобный шорткат: одна и та же запись для нескольких игроков (например, обе
// стороны боя должны видеть исход). Пустые/повторяющиеся id отбрасываются.
// Если ни одного валидного id — получаем одну глобальную запись.
export function logForPlayers(day: number, text: string, ...playerIds: Array<string | null | undefined>): LogEntry[] {
  const unique = Array.from(new Set(playerIds.filter((id): id is string => !!id)));
  if (unique.length === 0) return [logLine(day, text)];
  return unique.map(pid => logLine(day, text, pid));
}
