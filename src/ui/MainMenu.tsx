import { useGame } from "../game/store";
import { UiIcon } from "./gameArt";

export function MainMenu() {
  const goToNewGame = useGame(s => s.goToNewGame);
  const goToMultiplayer = useGame(s => s.goToMultiplayer);
  const reset = useGame(s => s.reset);
  const hasSave = useGame(s => s.map !== null);

  return (
    <div className="menu">
      <h1>Heroes Web</h1>
      <div className="subtitle">~ браузерный прототип в духе HoMM3 / HotA ~</div>
      <div className="menu-buttons">
        <button onClick={goToNewGame}>Новая игра</button>
        <button onClick={goToMultiplayer}>
          <UiIcon name="multiplayer" size={18} /> Мультиплеер
        </button>
        <button disabled={!hasSave} onClick={() => useGame.setState({ phase: "adventure" })}>
          Продолжить
        </button>
        <button
          disabled={!hasSave}
          onClick={() => {
            if (confirm("Удалить сохранение?")) reset();
          }}
        >
          Удалить сохранение
        </button>
      </div>
    </div>
  );
}
