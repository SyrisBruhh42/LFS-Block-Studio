import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerStudioServiceWorker } from './lib/pwaInstallAndOffline';

registerStudioServiceWorker();

createRoot(document.getElementById('root')!).render(<App />);

