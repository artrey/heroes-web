import { useGame } from "./game/store";
import { AdventureScreen } from "./ui/AdventureScreen";
import { BattleScreen } from "./ui/BattleScreen";
import { GameOverScreen } from "./ui/GameOverScreen";
import { HeroMeetingScreen } from "./ui/HeroMeetingScreen";
import { MainMenu } from "./ui/MainMenu";
import { NewGameScreen } from "./ui/NewGameScreen";
import { TownScreen } from "./ui/TownScreen";

export function App() {
  const phase = useGame(s => s.phase);

  return (
    <div className="app">
      {phase === "menu" && <MainMenu />}
      {phase === "newGame" && <NewGameScreen />}
      {phase === "adventure" && <AdventureScreen />}
      {phase === "town" && <TownScreen />}
      {phase === "battle" && <BattleScreen />}
      {phase === "heroMeeting" && <HeroMeetingScreen />}
      {phase === "gameOver" && <GameOverScreen />}
    </div>
  );
}
