// Простые light/dark манипуляции с HEX-цветами — без зависимостей на color-libs.
// Используются для отрисовки токенов героев и плашек городов/шахт.

export function lighten(hex: string, amount: number): string {
  return mixHex(hex, "#ffffff", amount);
}

export function darken(hex: string, amount: number): string {
  return mixHex(hex, "#000000", amount);
}

function mixHex(a: string, b: string, t: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  const r = Math.round(pa[0] * (1 - t) + pb[0] * t);
  const g = Math.round(pa[1] * (1 - t) + pb[1] * t);
  const bl = Math.round(pa[2] * (1 - t) + pb[2] * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

function parseHex(s: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(s);
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  }
  return [128, 128, 128];
}
