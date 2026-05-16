import { useState } from "react";

import { DIFFICULTY_PRESETS } from "../game/data/difficulty";
import { TEMPLATES } from "../game/data/templates";
import { useGame } from "../game/store";
import type { Difficulty, Faction } from "../game/types";

const DIFFICULTY_ORDER: Difficulty[] = ["easy", "normal", "hard"];
const DIFFICULTY_ICON: Record<Difficulty, string> = { easy: "🟢", normal: "🟡", hard: "🔴" };

export function NewGameScreen() {
  const startGame = useGame(s => s.startGame);
  const goToMenu = useGame(s => s.goToMenu);

  const [templateId, setTemplateId] = useState(TEMPLATES[0].id);
  const [opponents, setOpponents] = useState(1);
  const [faction, setFaction] = useState<Faction>("castle");
  const [playerName, setPlayerName] = useState("Игрок");
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 0xfffffff));
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");

  const tmpl = TEMPLATES.find(t => t.id === templateId)!;

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
                {t.defaultWidth}×{t.defaultHeight}, оппонентов: {t.recommendedOpponents.min}–
                {t.recommendedOpponents.max}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="section">
        <h3>Фракция</h3>
        <div className="faction-picker">
          <div
            className={`faction-card ${faction === "castle" ? "selected" : ""}`}
            onClick={() => setFaction("castle")}
          >
            <span className="emoji">🏰</span>
            <div>Castle</div>
            <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Замок — рыцари и ангелы</div>
          </div>
          <div
            className={`faction-card ${faction === "rampart" ? "selected" : ""}`}
            onClick={() => setFaction("rampart")}
          >
            <span className="emoji">🏯</span>
            <div>Rampart</div>
            <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Оплот — эльфы и драконы</div>
          </div>
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
              mapWidth: tmpl.defaultWidth,
              mapHeight: tmpl.defaultHeight,
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
