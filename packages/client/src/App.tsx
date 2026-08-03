import { MotionConfig } from 'framer-motion';
import { ConnectionLost } from './components/ConnectionLost.js';
import { ErrorToast } from './components/ErrorToast.js';
import { About } from './screens/About.js';
import { Game } from './screens/Game.js';
import { HostSetup } from './screens/HostSetup.js';
import { JoinForm } from './screens/JoinForm.js';
import { Landing } from './screens/Landing.js';
import { Lobby } from './screens/Lobby.js';
import { MatchEnd } from './screens/MatchEnd.js';
import { PracticeSetup } from './screens/PracticeSetup.js';
import { RoundEnd } from './screens/RoundEnd.js';
import { Spectate } from './screens/Spectate.js';
import { SpectateForm } from './screens/SpectateForm.js';
import { useStore } from './store/index.js';

function CurrentScreen() {
  const screen = useStore(s => s.screen);

  switch (screen) {
    case 'landing':
      return <Landing />;
    case 'hostSetup':
      return <HostSetup />;
    case 'practiceSetup':
      return <PracticeSetup />;
    case 'joinForm':
      return <JoinForm />;
    case 'lobby':
      return <Lobby />;
    case 'game':
      return <Game />;
    case 'roundEnd':
      return <RoundEnd />;
    case 'matchEnd':
      return <MatchEnd />;
    case 'about':
      return <About />;
    case 'spectateForm':
      return <SpectateForm />;
    case 'spectate':
      return <Spectate />;
  }
}

export function App() {
  // reducedMotion="user" drops Framer's transform/spring animations for anyone
  // who asked the OS for less motion; the CSS counterpart lives in index.css. (F12)
  return (
    <MotionConfig reducedMotion="user">
      <CurrentScreen />
      <ErrorToast />
      <ConnectionLost />
    </MotionConfig>
  );
}
