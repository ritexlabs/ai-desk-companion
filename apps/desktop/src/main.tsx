import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { hydrateFromTauriStore } from './lib/secureStore';

// In Tauri mode: load credentials from the encrypted store into localStorage
// before React hydrates so hooks see the values on first render.
// In browser mode: this is a no-op.
hydrateFromTauriStore().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
