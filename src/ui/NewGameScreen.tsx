import { useState } from "react";

import { DIFFICULTY_PRESETS } from "../game/data/difficulty";
import { FACTION_LIST, FACTION_META } from "../game/data/factions";
import { CUSTOM_SIZE_MAX, CUSTOM_SIZE_MIN, CUSTOM_TEMPLATE_ID, TEMPLATES } from "../game/data/templates";
import { useGame } from "../game/store";
import type { Difficulty, Faction } from "../game/types";

const DIFFICULTY_ORDER: Difficulty[] = ["easy", "normal", "hard"];
const DIFFICULTY_ICON: Record<Difficulty, string> = { easy: "🟢", normal: "🟡", hard: "🔴" };

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function NewGameScreen() {
  const startGame = useGame(s => s.startGame);
  const goToMenu = useGame(s => s.goToMenu);

  const [templateId, setTemplateId] = useState(TEMPLATES[0].id);
  const [opponents, setOpponents] = useState(1);
  const [faction, setFaction] = useState<Faction>("castle");
  const [playerName, setPlayerName] = useState("Игрок");
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 0xfffffff));
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [customW, setCustomW] = useState(40);
  const [customH, setCustomH] = useState(40);

  const tmpl = TEMPLATES.find(t => t.id === templateId)!;
  const isCustom = templateId === CUSTOM_TEMPLATE_ID;
  const finalW = isCustom ? clamp(customW, CUSTOM_SIZE_MIN, CUSTOM_SIZE_MAX) : tmpl.defaultWidth;
  const finalH = isCustom ? clamp(customH, CUSTOM_SIZE_MIN, CUSTOM_SIZE_MAX) : tmpl.defaultHeight;

  return (
    <div className="new-game">
      <h2>Новая игра</h2>

      <div className="section">
        <h3>Шаблон карты</h3>
        <div className="template-grid">
          {TEMPLATES.map(t => (
            <div
              key={t.id}
              className={`template-card ${t.id === templateId ? "selected" : ""}`}
              onClick={() => setTemplateId(t.id)}
            >
              <h4>{t.name}</h4>
              <p>{t.description}</p>
              <p style={{ marginTop: 6, fontSize: 11 }}>
                {t.id === CUSTOM_TEMPLATE_ID
                  ? `${CUSTOM_SIZE_MIN}…${CUSTOM_SIZE_MAX} клеток`
                  : `${t.defaultWidth}×${t.defaultHeight}`}
                , оппонентов: {t.recommendedOpponents.min}–{t.recommendedOpponents.max}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="section">
        <h3>Фракция</h3>
        <div className="faction-grid">
          {FACTION_LIST.map(f => {
            const meta = FACTION_META[f];
            return (
              <div key={f} className={`faction-card ${faction === f ? "selected" : ""}`} onClick={() => setFaction(f)}>
                <span className="emoji">{meta.icon}</span>
                <div>{meta.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>{meta.description}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="section">
        <h3>Сложность</h3>
        <div className="faction-picker">
          {DIFFICULTY_ORDER.map(d => {
            const p = DIFFICULTY_PRESETS[d];
            return (
              <div
                key={d}
                className={`faction-card ${difficulty === d ? "selected" : ""}`}
                onClick={() => setDifficulty(d)}
              >
                <span className="emoji">{DIFFICULTY_ICON[d]}</span>
                <div>{p.label}</div>
                <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>{p.description}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="section">
        <h3>Параметры</h3>
        <div className="form-row">
          <label>Имя игрока:</label>
          <input value={playerName} onChange={e => setPlayerName(e.target.value)} />
        </div>
        <div className="form-row">
          <label>Размер карты:</label>
          <input
            type="number"
            min={CUSTOM_SIZE_MIN}
            max={CUSTOM_SIZE_MAX}
            value={finalW}
            disabled={!isCustom}
            onChange={e => setCustomW(clamp(+e.target.value || CUSTOM_SIZE_MIN, CUSTOM_SIZE_MIN, CUSTOM_SIZE_MAX))}
            style={{ width: 80 }}
          />
          <span style={{ color: "var(--text-dim)" }}>×</span>
          <input
            type="number"
            min={CUSTOM_SIZE_MIN}
            max={CUSTOM_SIZE_MAX}
            value={finalH}
            disabled={!isCustom}
            onChange={e => setCustomH(clamp(+e.target.value || CUSTOM_SIZE_MIN, CUSTOM_SIZE_MIN, CUSTOM_SIZE_MAX))}
            style={{ width: 80 }}
          />
          {!isCustom && (
            <span style={{ color: "var(--text-dim)", fontSize: 11 }}>
              (для шаблона зафиксировано — выберите «Произвольная»)
            </span>
          )}
        </div>
        <div className="form-row">
          <label>Противников:</label>
          <input
            type="number"
            min={tmpl.recommendedOpponents.min}
            max={tmpl.recommendedOpponents.max}
            value={opponents}
            onChange={e =>
              setOpponents(
                Math.max(tmpl.recommendedOpponents.min, Math.min(tmpl.recommendedOpponents.max, +e.target.value)),
              )
            }
          />
        </div>
        <div className="form-row">
          <label>Seed карты:</label>
          <input type="number" value={seed} onChange={e => setSeed(+e.target.value)} />
          <button onClick={() => setSeed(Math.floor(Math.random() * 0xfffffff))}>🎲</button>
        </div>
      </div>

      <div className="footer">
        <button onClick={goToMenu}>← Назад</button>
        <button
          className="primary"
          onClick={() => {
            startGame({
              templateId,
              mapWidth: finalW,
              mapHeight: finalH,
              opponentCount: opponents,
              playerFaction: faction,
              playerName,
              seed,
              difficulty,
            });
          }}
        >
          Начать игру
        </button>
      </div>
    </div>
  );
}
