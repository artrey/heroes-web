import { useGame } from "../game/store";
import { UiIcon } from "./gameArt";

export function GameOverScreen() {
  const winnerId = useGame(s => s.winnerId);
  const players = useGame(s => s.players);
  const reset = useGame(s => s.reset);
  const goToMenu = useGame(s => s.goToMenu);

  const winner = winnerId ? players[winnerId] : null;
  const isHumanWinner = winner?.isHuman ?? false;

  return (
    <div className={`gameover ${!isHumanWinner ? "defeat" : ""}`}>
      <UiIcon name={isHumanWinner ? "victory" : "defeat"} size={120} />
      <h1>{isHumanWinner ? "ПОБЕДА" : "ПОРАЖЕНИЕ"}</h1>
      <div style={{ color: "var(--text-dim)", marginBottom: 32 }}>
        {winner ? `Победитель: ${winner.name}` : "Все игроки погибли."}
      </div>
      <div className="actions">
        <button onClick={goToMenu}>В меню</button>
        <button
          onClick={() => {
            reset();
            goToMenu();
          }}
        >
          Удалить сохранение
        </button>
      </div>
    </div>
  );
}
