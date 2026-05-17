import { useGame } from "./game/store";
import { AdventureScreen } from "./ui/AdventureScreen";
import { BattleScreen } from "./ui/BattleScreen";
import { GameOverScreen } from "./ui/GameOverScreen";
import { HeroMeetingScreen } from "./ui/HeroMeetingScreen";
import { HeroScreen } from "./ui/HeroScreen";
import { MainMenu } from "./ui/MainMenu";
import { MultiplayerScreen } from "./ui/MultiplayerScreen";
import { NewGameScreen } from "./ui/NewGameScreen";
import { TownScreen } from "./ui/TownScreen";

export function App() {
  const phase = useGame(s => s.phase);
  const battle = useGame(s => s.battle);
  // В MP-режиме фазы у каждого клиента свои, а бой — глобальный. Если у нас есть
  // активный battle, показываем поле боя поверх любой локальной фазы. Это позволяет
  // двум игрокам синхронно видеть начавшееся сражение независимо от того, кто из
  // них сидит в городе или на карте.
  const showBattle = battle != null;
  return (
    <div className="app">
      {showBattle ? (
        <BattleScreen />
      ) : (
        <>
          {phase === "menu" && <MainMenu />}
          {phase === "newGame" && <NewGameScreen />}
          {phase === "multiplayer" && <MultiplayerScreen />}
          {phase === "adventure" && <AdventureScreen />}
          {phase === "town" && <TownScreen />}
          {phase === "heroMeeting" && <HeroMeetingScreen />}
          {phase === "hero" && <HeroScreen />}
          {phase === "gameOver" && <GameOverScreen />}
        </>
      )}
    </div>
  );
}
