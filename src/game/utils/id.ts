let counter = 0;

export function makeId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter}_${Math.random().toString(36).slice(2, 7)}`;
}

export function resetIdCounter() {
  counter = 0;
}
