import { useGame } from "./game/store";
import type { Phase } from "./game/types";
import { AdventureScreen } from "./ui/AdventureScreen";
import { BattleScreen } from "./ui/BattleScreen";
import { GameOverScreen } from "./ui/GameOverScreen";
import { HeroMeetingScreen } from "./ui/HeroMeetingScreen";
import { HeroScreen } from "./ui/HeroScreen";
import { MainMenu } from "./ui/MainMenu";
import { MultiplayerScreen } from "./ui/MultiplayerScreen";
import { NewGameScreen } from "./ui/NewGameScreen";
import { TownScreen } from "./ui/TownScreen";

// Реестр «фаза → экран». TS требует, чтобы тут были все варианты Phase из
// game/types.ts — если добавишь новую фазу, компилятор подсветит пропуск
// именно здесь, а не в рантайме на пустом экране.
const PHASE_SCREENS: Record<Phase, () => JSX.Element> = {
  menu: () => <MainMenu />,
  newGame: () => <NewGameScreen />,
  multiplayer: () => <MultiplayerScreen />,
  adventure: () => <AdventureScreen />,
  town: () => <TownScreen />,
  hero: () => <HeroScreen />,
  heroMeeting: () => <HeroMeetingScreen />,
  battle: () => <BattleScreen />,
  gameOver: () => <GameOverScreen />,
};

export function App() {
  const phase = useGame(s => s.phase);
  const battle = useGame(s => s.battle);
  // winnerId выставляется хостом, когда остаётся один не-побеждённый игрок, и
  // синхронизируется всем клиентам через state-broadcast. Локальная phase у клиента
  // НЕ синхронизируется, поэтому показывать «Игра окончена» нужно именно по
  // winnerId — иначе у проигравшего экран бы оставался на карте.
  const winnerId = useGame(s => s.winnerId);
  // Эффективная фаза: gameOver перекрывает battle, battle перекрывает phase.
  //   - В MP-режиме фазы у каждого клиента свои, а бой — глобальный (battle != null).
  //   - winnerId выставляется одновременно со сбросом battle, но порядок set() в
  //     host'е и client'е может отличаться — пусть gameOver выигрывает безусловно.
  //   - В меню/настройках новой игры/лобби finale не показываем: после клика «В меню»
  //     клиент локально уходит в phase=menu, нельзя его там запирать.
  const inMenuLike = phase === "menu" || phase === "newGame" || phase === "multiplayer";
  const showGameOver = !inMenuLike && (winnerId != null || phase === "gameOver");
  const effectivePhase: Phase = showGameOver ? "gameOver" : battle != null ? "battle" : phase;
  const Screen = PHASE_SCREENS[effectivePhase];
  return (
    <div className="app">
      <Screen />
    </div>
  );
}
