import { FACTION_BUILDINGS } from "../../data/buildings";
import { getPreset } from "../../data/difficulty";
import { UNITS } from "../../data/units";
import type { GameState, Player, ResourceBag, Town } from "../../types";
import { add } from "../../utils/resources";

// Дневной доход: золото от ратуш + сырьё от шахт. Возвращает новые players
// (мутации не делаем). Побеждённых пропускаем.
export function applyDailyIncome(s: GameState): Record<string, Player> {
  const players: Record<string, Player> = { ...s.players };
  for (const pid of Object.keys(players)) {
    const p = players[pid];
    if (p.defeated) continue;
    let res = { ...p.resources };
    // Города.
    for (const tid of p.townIds) {
      const t = s.towns[tid];
      if (!t) continue;
      for (const bId of t.built) {
        const def = FACTION_BUILDINGS[t.faction].find(b => b.id === bId);
        if (def?.givesGoldPerDay) res.gold += def.givesGoldPerDay;
      }
    }
    // Шахты — посмотреть все объекты карты, принадлежащие игроку.
    if (s.map) {
      for (const obj of Object.values(s.map.objects)) {
        if (obj.kind === "mine" && obj.ownerId === pid && obj.mineResource && obj.mineYield) {
          res = add(res, { [obj.mineResource]: obj.mineYield } as Partial<ResourceBag>);
        }
      }
    }
    players[pid] = { ...p, resources: res };
  }
  return players;
}

// Еженедельный прирост юнитов в городах. С учётом ИИ-множителя сложности и
// бонуса форта (+50% к приросту).
export function applyWeeklyGrowth(state: GameState): Record<string, Town> {
  const out: Record<string, Town> = {};
  const preset = state.options ? getPreset(state.options.difficulty) : null;
  for (const [id, t] of Object.entries(state.towns)) {
    const newAvail = { ...t.availableUnits };
    const owner = t.ownerId ? state.players[t.ownerId] : null;
    const aiMult = owner && !owner.isHuman && preset ? preset.aiGrowthMult : 1;
    const fortMult = t.built.includes("fort") ? 1.5 : 1;
    const mult = aiMult * fortMult;
    for (const bId of t.built) {
      const def = FACTION_BUILDINGS[t.faction].find(b => b.id === bId);
      if (def?.produces) {
        const unit = UNITS[def.produces];
        const inc = Math.max(1, Math.round(unit.growth * mult));
        newAvail[def.produces] = (newAvail[def.produces] ?? 0) + inc;
      }
    }
    out[id] = { ...t, availableUnits: newAvail };
  }
  return out;
}
