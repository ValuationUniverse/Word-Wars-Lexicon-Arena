/** 🌐 [PLATFORM SHELL] Root React application wrapper. Rarely needs modification. */
import React from 'react';
import {GameView} from './GameView';
import {PlayablesWrapper} from './PlayablesWrapper';

export function App() {
  return (
    <PlayablesWrapper>
      <GameView />
    </PlayablesWrapper>
  );
}
