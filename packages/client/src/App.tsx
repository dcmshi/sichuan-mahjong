import { useStore } from './store/index.js';
import { Landing } from './screens/Landing.js';
import { HostSetup } from './screens/HostSetup.js';
import { JoinForm } from './screens/JoinForm.js';
import { Lobby } from './screens/Lobby.js';
import { Game } from './screens/Game.js';
import { RoundEnd } from './screens/RoundEnd.js';

export function App() {
  const screen = useStore(s => s.screen);

  switch (screen) {
    case 'landing':   return <Landing />;
    case 'hostSetup': return <HostSetup />;
    case 'joinForm':  return <JoinForm />;
    case 'lobby':     return <Lobby />;
    case 'game':      return <Game />;
    case 'roundEnd':  return <RoundEnd />;
  }
}
