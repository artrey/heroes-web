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
  // winnerId выставляется хостом, когда остаётся один не-побеждённый игрок, и
  // синхронизируется всем клиентам через state-broadcast. Локальная phase у клиента
  // НЕ синхронизируется, поэтому показывать «Игра окончена» нужно именно по
  // winnerId — иначе у проигравшего экран бы оставался на карте.
  const winnerId = useGame(s => s.winnerId);
  // В MP-режиме фазы у каждого клиента свои, а бой — глобальный. Если у нас есть
  // активный battle, показываем поле боя поверх любой локальной фазы. Это позволяет
  // двум игрокам синхронно видеть начавшееся сражение независимо от того, кто из
  // них сидит в городе или на карте.
  const showBattle = battle != null;
  // gameOver перекрывает всё остальное, включая активную битву (на практике
  // winnerId устанавливается одновременно со сбросом battle, но порядок set()
  // в host'е и client'е может отличаться — пусть gameOver выигрывает безусловно).
  // Не показываем gameOver в меню/настройках новой игры/лобби: после клика
  // «В меню» клиент локально уходит в phase=menu, и при ненулевом winnerId
  // мы должны его отпустить, а не запирать на финальном экране.
  const inMenuLike = phase === "menu" || phase === "newGame" || phase === "multiplayer";
  const showGameOver = !inMenuLike && (winnerId != null || phase === "gameOver");
  return (
    <div className="app">
      {showGameOver ? (
        <GameOverScreen />
      ) : showBattle ? (
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
        </>
      )}
    </div>
  );
}
