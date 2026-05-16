import { FACTION_BUILDINGS } from "../data/buildings";
import type { GameState, ResourceBag } from "../types";
import { emptyBag } from "./resources";

// Дневной прирост ресурсов игрока: золото от ратуш и доход с захваченных шахт.
// Совпадает по логике с тем, что начисляется в endTurn (см. applyDailyIncome в store.ts).
export function dailyIncomeFor(state: GameState, playerId: string): ResourceBag {
  const out = emptyBag();
  const player = state.players[playerId];
  if (!player) return out;
  for (const tid of player.townIds) {
    const t = state.towns[tid];
    if (!t) continue;
    for (const bid of t.built) {
      const def = FACTION_BUILDINGS[t.faction].find(b => b.id === bid);
      if (def?.givesGoldPerDay) out.gold += def.givesGoldPerDay;
    }
  }
  if (state.map) {
    for (const obj of Object.values(state.map.objects)) {
      if (obj.kind === "mine" && obj.ownerId === playerId && obj.mineResource && obj.mineYield) {
        out[obj.mineResource] += obj.mineYield;
      }
    }
  }
  return out;
}
