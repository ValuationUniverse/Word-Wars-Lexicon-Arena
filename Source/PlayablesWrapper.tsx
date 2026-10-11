/** 🔒 [CORE PLATFORM SDK - READ ONLY] YouTube Playables SDK lifecycle, cloud save/load, and host event wrapper. Do not modify. */
import React, {createContext, useContext, useEffect, useState} from 'react';
import {Audio} from './Audio';

declare global {
  interface Window {
    ytgame?: {
      IN_PLAYABLES_ENV?: boolean;
      game: {
        firstFrameReady: () => void;
        gameReady: () => void;
        loadData: () => Promise<string>;
        saveData: (data: string) => Promise<void>;
      };
      system: {
        isAudioEnabled: () => boolean;
        onAudioEnabledChange: (cb: (enabled: boolean) => void) => void;
        onPause: (cb: () => void) => void;
        onResume: (cb: () => void) => void;
      };
      engagement: {
        sendScore: (scoreData: {value: number}) => void;
      };
    };
  }
}

export const saveGameData = (dataObj: any) => {
  const str = typeof dataObj === 'string' ? dataObj : JSON.stringify(dataObj);
  const yt = typeof window !== 'undefined' ? window.ytgame : undefined;
  if (yt?.IN_PLAYABLES_ENV || yt?.game?.saveData) {
    try {
      yt.game
        .saveData(str)
        .catch((err) => console.warn('saveData error:', err));
    } catch (e) {
      console.warn('saveData error:', e);
    }
  } else {
    try {
      localStorage.setItem('playables_save', str);
    } catch (e) {}
  }
};

export const sendGameScore = (score: number) => {
  const yt = typeof window !== 'undefined' ? window.ytgame : undefined;
  if (yt?.IN_PLAYABLES_ENV || yt?.engagement?.sendScore) {
    try {
      yt.engagement.sendScore({value: Math.floor(score)});
    } catch (e) {
      console.warn('sendScore error:', e);
    }
  }
};

export interface PlayablesState {
  isPaused: boolean;
  isMuted: boolean;
  savedData: string | null;
  saveGameData: (data: any) => void;
  sendGameScore: (score: number) => void;
}

export const PlayablesState: PlayablesState = {
  isPaused: false,
  isMuted: false,
  savedData: null,
  saveGameData,
  sendGameScore,
};

export const PlayablesContext = createContext<PlayablesState>(PlayablesState);
export const usePlayables = () => useContext(PlayablesContext);

interface Props {
  children: React.ReactNode | ((state: PlayablesState) => React.ReactNode);
}

export const PlayablesWrapper: React.FC<Props> = ({children}) => {
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.ytgame?.system?.isAudioEnabled) {
      try {
        const hostAudio = window.ytgame.system.isAudioEnabled();
        Audio.isMuted = !hostAudio;
        return !hostAudio;
      } catch (_) {}
    }
    return Audio.isMuted;
  });
  const [savedData, setSavedData] = useState<string | null>(null);

  useEffect(() => {
    const yt = typeof window !== 'undefined' ? window.ytgame : undefined;
    if (yt?.IN_PLAYABLES_ENV || (yt?.game && yt?.system)) {
      try {
        yt.game.firstFrameReady();
      } catch (e) {
        console.warn('firstFrameReady error:', e);
      }

      const dataPromise = Promise.resolve(yt.game.loadData())
        .then((data) => {
          if (data) setSavedData(data);
        })
        .catch((err) => console.warn('Failed to load ytgame data:', err));

      const timeoutPromise = new Promise((resolve) =>
        setTimeout(resolve, 3000),
      );

      Promise.race([dataPromise, timeoutPromise]).finally(() => {
        try {
          yt.game.gameReady();
        } catch (e) {
          console.warn('gameReady error:', e);
        }
      });

      try {
        // Sync initial audio state from YouTube host
        if (yt.system.isAudioEnabled) {
          const enabled = yt.system.isAudioEnabled();
          setIsMuted(!enabled);
          Audio.isMuted = !enabled;
        }

        yt.system.onAudioEnabledChange((enabled: boolean) => {
          setIsMuted(!enabled);
          Audio.isMuted = !enabled;
        });

        yt.system.onPause(() => {
          setIsPaused(true);
        });

        yt.system.onResume(() => {
          setIsPaused(false);
        });
      } catch (e) {
        console.warn('System event registration error:', e);
      }
    } else {
      // Local storage fallback for standalone / dev testing
      try {
        const local = localStorage.getItem('playables_save');
        if (local) setSavedData(local);
      } catch (e) {}
    }
  }, []);


  const playablesState: PlayablesState = {
    isPaused,
    isMuted,
    savedData,
    saveGameData,
    sendGameScore,
  };

  return (
    <PlayablesContext.Provider value={playablesState}>
      {typeof children === 'function' ? children(playablesState) : children}
    </PlayablesContext.Provider>
  );
};
