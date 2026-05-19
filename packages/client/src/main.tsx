import { createRoot } from 'react-dom/client';

const el = document.getElementById('root');
if (!el) throw new Error('No #root element');
createRoot(el).render(<div>Sichuan Mahjong — Phase 6</div>);
