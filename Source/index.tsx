/** 🌐 [PLATFORM SHELL] React 18 DOM mount entry point. Rarely needs modification. */
import React from 'react';
import {createRoot} from 'react-dom/client';
import {App} from './App';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
