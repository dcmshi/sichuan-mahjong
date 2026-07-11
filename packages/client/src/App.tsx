import { About } from './screens/About.js';
import { Game } from './screens/Game.js';
import { HostSetup } from './screens/HostSetup.js';
import { JoinForm } from './screens/JoinForm.js';
import { Landing } from './screens/Landing.js';
import { Lobby } from './screens/Lobby.js';
import { RoundEnd } from './screens/RoundEnd.js';
import { Spectate } from './screens/Spectate.js';
import { SpectateForm } from './screens/SpectateForm.js';
import { useStore } from './store/index.js';

export function App() {
  const screen = useStore(s => s.screen);

  switch (screen) {
    case 'landing':
      return <Landing />;
    case 'hostSetup':
      return <HostSetup />;
    case 'joinForm':
      return <JoinForm />;
    case 'lobby':
      return <Lobby />;
    case 'game':
      return <Game />;
    case 'roundEnd':
      return <RoundEnd />;
    case 'about':
      return <About />;
    case 'spectateForm':
      return <SpectateForm />;
    case 'spectate':
      return <Spectate />;
  }
}
