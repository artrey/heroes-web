import { useGame } from './game/store';
import { MainMenu } from './ui/MainMenu';
import { NewGameScreen } from './ui/NewGameScreen';
import { AdventureScreen } from './ui/AdventureScreen';
import { TownScreen } from './ui/TownScreen';
import { BattleScreen } from './ui/BattleScreen';
import { GameOverScreen } from './ui/GameOverScreen';

export function App() {
  const phase = useGame((s) => s.phase);

  return (
    <div className="app">
      {phase === 'menu' && <MainMenu />}
      {phase === 'newGame' && <NewGameScreen />}
      {phase === 'adventure' && <AdventureScreen />}
      {phase === 'town' && <TownScreen />}
      {phase === 'battle' && <BattleScreen />}
      {phase === 'gameOver' && <GameOverScreen />}
    </div>
  );
}
