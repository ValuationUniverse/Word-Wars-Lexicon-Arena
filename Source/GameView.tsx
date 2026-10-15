import React, { useRef, useState, useEffect } from 'react';
import { GameEngine, ViewportContext } from './GameEngine';
import { GameLogic } from './GameLogic';
import { usePlayables } from './PlayablesWrapper';
import { languageManager, WordEntry } from './Language';

export const GameView: React.FC = () => {
  const logicRef = useRef<GameLogic | null>(null);
  const logic = logicRef.current ?? (logicRef.current = new GameLogic());
  const playables = usePlayables();

  const [uiScore, setUiScore] = useState(0);
  const [uiWave, setUiWave] = useState(1);
  const [uiHp, setUiHp] = useState(100);
  const [uiWord, setUiWord] = useState('');
  const [uiStatus, setUiStatus] = useState<'menu' | 'playing' | 'results' | 'victory'>('menu');
  const [isPaused, setIsPaused] = useState(false);
  const [bgOffset, setBgOffset] = useState(0);
  
  // Progression & Localization UI State
  const [uiLevel, setUiLevel] = useState(1);
  const [uiXp, setUiXp] = useState(0);
  const [uiAchievementsCount, setUiAchievementsCount] = useState(0);
  const [uiActiveClues, setUiActiveClues] = useState<WordEntry[]>([]);
  const [langUI, setLangUI] = useState(languageManager.getUI());

  const isEffectivePaused = playables.isPaused || isPaused;

  useEffect(() => {
    logic.initializeInputManager();
    if (playables.savedData) {
      try {
        const data = JSON.parse(playables.savedData);
        logic.loadSaveData(data);
        setUiLevel(logic.playerLevel);
        setUiXp(logic.playerXp);
        setUiAchievementsCount(logic.achievements.size);
      } catch (e) { 
        // Ignore parse errors 
      }
    }
    return () => logic.destroyInputManager();
  }, [playables.savedData]);

  const handleUpdate = (dt: number, vp: ViewportContext) => {
    logic.update(dt, vp, isEffectivePaused);

    if (!isEffectivePaused && logic.status === 'playing') {
      setBgOffset(prev => (prev + 15 * dt) % 100);
    }

    if (logic.score !== uiScore) setUiScore(logic.score);
    if (logic.wave !== uiWave) setUiWave(logic.wave);
    if (logic.playerHp !== uiHp) setUiHp(logic.playerHp);
    if (logic.status !== uiStatus) setUiStatus(logic.status);
    if (logic.playerLevel !== uiLevel) setUiLevel(logic.playerLevel);
    if (logic.playerXp !== uiXp) setUiXp(logic.playerXp);
    if (logic.achievements.size !== uiAchievementsCount) setUiAchievementsCount(logic.achievements.size);

    const currentWordStr = logic.currentWord.map(l => l.type === 'WILDCARD' ? '*' : l.char).join('');
    if (currentWordStr !== uiWord) setUiWord(currentWordStr);

    // Update Clues
    if (logic.status === 'playing') {
      const clues = logic.activeTargets;
      // Simple shallow compare to avoid too many renders
      if (clues.length !== uiActiveClues.length || clues.some((c,i) => c.word !== uiActiveClues[i]?.word)) {
         setUiActiveClues([...clues]);
      }
    }
  };

  const handleRender = (ctx: CanvasRenderingContext2D, vp: ViewportContext) => {
    // Screen Shake
    if (logic.screenShakeTime > 0) {
      const mag = logic.screenShakeTime * 20;
      ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
    }

    // Background Grid
    ctx.fillStyle = '#0A0A2A';
    ctx.fillRect(0, 0, vp.width, vp.height);
    
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const gridSize = 100;
    for (let x = -bgOffset; x < vp.width; x += gridSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, vp.height);
    }
    for (let y = 0; y < vp.height; y += gridSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(vp.width, y);
    }
    ctx.stroke();

    // Render Game Objects
    if (logic.status === 'playing' || logic.status === 'results') {
      // Player Pillar
      ctx.save();
      ctx.fillStyle = '#00FFFF';
      ctx.shadowColor = '#00FFFF';
      ctx.shadowBlur = 30;
      const pWidth = 40;
      const pHeight = vp.height * 0.8;
      ctx.fillRect(logic.playerX - pWidth/2, logic.playerY - pHeight/2, pWidth, pHeight);
      
      // Barrier Glow
      ctx.strokeStyle = `rgba(0, 255, 255, ${logic.playerHp / logic.maxPlayerHp})`;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(logic.playerX, logic.playerY, 150, -Math.PI/2, Math.PI/2);
      ctx.stroke();
      ctx.restore();

      // Enemies
      logic.enemies.forEach(e => {
        ctx.save();
        const isBrute = e.type === 'BRUTE';
        const isBoss = e.type === 'BOSS';
        
        ctx.translate(e.x, e.y);
        
        // HP Bar
        ctx.fillStyle = 'rgba(255,0,0,0.5)';
        ctx.fillRect(-e.radius, -e.radius - 15, e.radius * 2, 6);
        ctx.fillStyle = '#00FF00';
        ctx.fillRect(-e.radius, -e.radius - 15, (e.radius * 2) * (e.hp / e.maxHp), 6);

        if (e.shieldLengthRequired > 0) {
          ctx.fillStyle = '#FFFFFF';
          ctx.font = '14px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`Shield: ${e.shieldLengthRequired}+ Ltrs`, 0, -e.radius - 22);
        }

        ctx.shadowColor = '#FF0033';
        ctx.shadowBlur = isBoss ? 40 : 15;
        ctx.fillStyle = '#FF0033';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 4;

        ctx.beginPath();
        if (isBrute) {
          for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i;
            ctx.lineTo(Math.cos(angle) * e.radius, Math.sin(angle) * e.radius);
          }
        } else if (isBoss) {
          for (let i = 0; i < 8; i++) {
            const angle = (Math.PI / 4) * i;
            ctx.lineTo(Math.cos(angle) * e.radius, Math.sin(angle) * e.radius);
          }
        } else {
          ctx.moveTo(0, -e.radius);
          ctx.lineTo(e.radius, 0);
          ctx.lineTo(0, e.radius);
          ctx.lineTo(-e.radius, 0);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      });

      // Particles
      logic.particles.forEach(p => {
        ctx.globalAlpha = p.life / p.maxLife;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1.0;

      // Letters
      logic.letters.forEach(l => {
        if (l.selected) return;
        ctx.save();
        ctx.translate(l.x, l.y);
        
        const isWild = l.type === 'WILDCARD';
        ctx.shadowColor = isWild ? '#FFD700' : '#00FFFF';
        ctx.shadowBlur = 10;
        ctx.fillStyle = isWild ? '#FFD700' : '#1A1A3A';
        ctx.strokeStyle = isWild ? '#FFFFFF' : '#00FFFF';
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.arc(0, 0, l.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = isWild ? '#000000' : '#FFFFFF';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(l.char, 0, 2);
        ctx.restore();
      });

      // Feedback Texts
      logic.feedback.forEach(f => {
        ctx.save();
        ctx.globalAlpha = Math.min(1, f.life);
        ctx.textAlign = 'center';
        
        ctx.fillStyle = f.color;
        ctx.font = 'bold 36px sans-serif';
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 4;
        ctx.fillText(f.text, f.x, f.y);

        if (f.subtext) {
          ctx.fillStyle = '#FFFFFF';
          ctx.font = '20px sans-serif';
          ctx.fillText(f.subtext, f.x, f.y + 30);
        }
        ctx.restore();
      });
    }
  };

  const handleFire = () => logic.fireWord();
  const handleClear = () => logic.clearWord();
  const stopGameInput = (event: React.PointerEvent<HTMLButtonElement>) =>
    event.stopPropagation();
  const togglePause = () => {
    setIsPaused(!isPaused);
    logic.togglePause();
  };
  const startGame = () => logic.start();
  const returnToMenu = () => {
    logic.status = 'menu';
    setUiStatus('menu');
  };

  const toggleLanguage = () => {
    const langs = languageManager.getAvailableLanguages();
    const currIdx = langs.findIndex(l => l.id === languageManager.getCurrentLangId());
    const nextIdx = (currIdx + 1) % langs.length;
    
    if (langs[nextIdx].isSupported) {
       languageManager.setLanguage(langs[nextIdx].id);
       setLangUI(languageManager.getUI());
    } else {
       // Simulate a brief feedback for unsupported languages
       alert(`Language ${langs[nextIdx].name} is ${langs[nextIdx].ui.coming_soon}`);
    }
  };

  const getTierColor = (tier: number) => {
    if (tier === 1) return '#00FFFF';
    if (tier === 2) return '#FFD700';
    return '#FF00FF';
  };

  // Calculate XP threshold for current level progress
  // Level = floor(sqrt(XP / 50)) + 1
  // To get to Level L, XP needed = (L - 1)^2 * 50
  const xpForCurrentLvl = Math.pow(uiLevel - 1, 2) * 50;
  const xpForNextLvl = Math.pow(uiLevel, 2) * 50;
  const xpProgress = Math.max(0, uiXp - xpForCurrentLvl);
  const xpRequired = xpForNextLvl - xpForCurrentLvl;
  const xpPercent = Math.min(100, (xpProgress / xpRequired) * 100);

  const runAccuracy = logic.runAttempts > 0
    ? Math.floor((logic.runHits / logic.runAttempts) * 100)
    : 0;

  return (
    <GameEngine supportResize={true} backgroundColor="#0A0A2A" onUpdate={handleUpdate} onRender={handleRender}>
      {/* HUD Layer */}
      {uiStatus === 'playing' && (
        <div style={styles.hudOverlay}>
          {/* Top Bar */}
          <div style={styles.topBar}>
            <div style={styles.statBox}>
              <div style={styles.statLabel}>{langUI.level} {uiLevel}</div>
              <div style={{width: '100px', height: '6px', backgroundColor: '#333', marginTop: '5px', borderRadius: '3px', overflow: 'hidden'}}>
                <div style={{width: `${xpPercent}%`, height: '100%', backgroundColor: '#00FFFF'}} />
              </div>
            </div>
            <div style={styles.statBox}>
              <div style={styles.statLabel}>{langUI.score}</div>
              <div style={styles.statValue}>{uiScore}</div>
            </div>
            <div style={styles.statBox}>
              <div style={styles.statLabel}>{langUI.wave}</div>
              <div style={styles.statValue}>{uiWave}</div>
            </div>
            <div style={styles.statBox}>
              <div style={styles.statLabel}>BARRIER</div>
              <div style={{ ...styles.statValue, color: uiHp < 30 ? '#FF0033' : '#00FFFF' }}>
                {uiHp}%
              </div>
            </div>
            <button type="button" style={styles.pauseBtn} onPointerDown={stopGameInput} onClick={togglePause}>
              {isEffectivePaused ? '▶' : '⏸'}
            </button>
          </div>

          {/* Educational Clues Panel */}
          <div style={styles.cluesContainer}>
            <div style={styles.cluesTitle}>{langUI.clues_title}</div>
            {uiActiveClues.map((clue, idx) => (
              <div key={idx} style={styles.clueRow}>
                <span style={{color: getTierColor(clue.tier), fontWeight: 'bold', marginRight: '8px'}}>
                  [{clue.tier === 1 ? '⭐' : clue.tier === 2 ? '⭐⭐' : '⭐⭐⭐'}]
                </span>
                <span style={styles.clueLengthHint}>
                  ({clue.word.length}) {'_ '.repeat(clue.word.length).trim()}
                </span>
                <span style={{marginLeft: '10px'}}>{clue.definition}</span>
              </div>
            ))}
          </div>

          {/* Bottom Controls */}
          <div style={styles.bottomBar}>
            <div style={styles.wordDisplay}>
              {uiWord || <span style={{ opacity: 0.3 }}>{langUI.tap_letters}</span>}
            </div>
            <div style={styles.controlsRow}>
              <button type="button" style={styles.clearBtn} onPointerDown={stopGameInput} onClick={handleClear}>{langUI.clear}</button>
              <button type="button" style={styles.fireBtn} onPointerDown={stopGameInput} onClick={handleFire}>{langUI.fire}</button>
            </div>
          </div>
        </div>
      )}

      {/* MAIN MENU */}
      {uiStatus === 'menu' && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <h1 style={styles.modalTitle}>{langUI.title}</h1>
            <h2 style={{color: '#00FFFF', marginTop: 0}}>{langUI.subtitle}</h2>
            <p style={styles.modalText}>Defend your core by spelling words that match the target definitions.</p>
            
            <div style={styles.progressionPanel}>
               <p style={styles.modalText}>Caster Level: <strong style={{color:'#00FFFF'}}>{uiLevel}</strong></p>
               <p style={styles.modalText}>Total XP: <strong style={{color:'#FFD700'}}>{uiXp}</strong></p>
               <p style={styles.modalText}>Achievements: <strong style={{color:'#00FF00'}}>{uiAchievementsCount}</strong></p>
            </div>

            <div style={{marginBottom: '20px'}}>
               <button type="button" style={styles.langBtn} onPointerDown={stopGameInput} onClick={toggleLanguage}>
                 {langUI.language_btn}
               </button>
            </div>

            <button type="button" style={{...styles.actionBtn, backgroundColor: '#00FFFF', color: '#000'}} onPointerDown={stopGameInput} onClick={startGame}>
              {langUI.play_btn}
            </button>
          </div>
        </div>
      )}

      {/* RUN RESULTS SCREEN */}
      {uiStatus === 'results' && (
        <div style={styles.modalOverlay}>
          <div style={{...styles.modalContent, maxWidth: '700px', width: '90%'}}>
            <h1 style={{...styles.modalTitle, color: '#FF0033'}}>{langUI.results}</h1>
            
            <div style={{display: 'flex', gap: '20px', flexWrap: 'wrap', justifyContent: 'center'}}>
              <div style={{...styles.progressionPanel, flex: '1', minWidth: '200px'}}>
                 <h3 style={{color: '#00FFFF', marginTop: 0}}>{langUI.run_stats}</h3>
                 <p style={styles.modalText}>Final Score: <strong style={{color:'#00FFFF'}}>{uiScore}</strong></p>
                 <p style={styles.modalText}>Waves Survived: <strong style={{color:'#FFFFFF'}}>{uiWave}</strong></p>
                 <p style={styles.modalText}>{langUI.xp} Earned: <strong style={{color:'#FFD700'}}>+{logic.runXpEarned}</strong></p>
                 <p style={styles.modalText}>{langUI.accuracy}: <strong style={{color: runAccuracy > 75 ? '#00FF00' : '#FF0033'}}>{runAccuracy}%</strong></p>
              </div>

              <div style={{...styles.progressionPanel, flex: '2', minWidth: '300px', maxHeight: '250px', display: 'flex', flexDirection: 'column'}}>
                 <h3 style={{color: '#00FFFF', marginTop: 0}}>{langUI.words_mastered}</h3>
                 <div style={styles.reviewList}>
                   {logic.runWordsMastered.length === 0 && (
                      <p style={{color: '#777'}}>No words mastered this run.</p>
                   )}
                   {logic.runWordsMastered.map((w, i) => (
                      <div key={i} style={styles.reviewItem}>
                         <strong style={{color: getTierColor(w.tier)}}>{w.word}</strong>: {w.definition}
                      </div>
                   ))}
                 </div>
              </div>
            </div>

            <div style={{display: 'flex', gap: '20px', justifyContent: 'center'}}>
              <button type="button" style={{...styles.actionBtn, backgroundColor: '#333'}} onPointerDown={stopGameInput} onClick={returnToMenu}>{langUI.menu_btn}</button>
              <button type="button" style={styles.actionBtn} onPointerDown={stopGameInput} onClick={startGame}>{langUI.rematch_btn}</button>
            </div>
          </div>
        </div>
      )}

      {/* PAUSE */}
      {isEffectivePaused && uiStatus === 'playing' && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <h1 style={styles.modalTitle}>{langUI.paused}</h1>
            <button type="button" style={styles.actionBtn} onPointerDown={stopGameInput} onClick={togglePause}>{langUI.resume}</button>
          </div>
        </div>
      )}
    </GameEngine>
  );
};

const styles: Record<string, React.CSSProperties> = {
  hudOverlay: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    padding: '20px',
  },
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    pointerEvents: 'auto',
    gap: '10px',
  },
  statBox: {
    backgroundColor: 'rgba(10, 10, 42, 0.8)',
    border: '2px solid #00FFFF',
    borderRadius: '8px',
    padding: '10px 15px',
    textAlign: 'center',
    boxShadow: '0 0 10px rgba(0, 255, 255, 0.3)',
  },
  statLabel: {
    fontSize: '12px',
    color: '#00FFFF',
    fontWeight: 'bold',
    letterSpacing: '1px',
  },
  statValue: {
    fontSize: '24px',
    color: '#FFFFFF',
    fontWeight: 'bold',
    marginTop: '4px',
  },
  pauseBtn: {
    backgroundColor: 'rgba(10, 10, 42, 0.8)',
    border: '2px solid #00FFFF',
    color: '#00FFFF',
    width: '44px',
    height: '44px',
    borderRadius: '8px',
    fontSize: '20px',
    cursor: 'pointer',
    pointerEvents: 'auto',
  },
  cluesContainer: {
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    border: '2px solid #00FFFF',
    borderRadius: '12px',
    padding: '15px 20px',
    width: '90%',
    maxWidth: '800px',
    pointerEvents: 'none',
    marginTop: '10px',
    boxShadow: '0 0 15px rgba(0,255,255,0.2)',
  },
  cluesTitle: {
    color: '#FFD700',
    fontSize: '14px',
    fontWeight: 'bold',
    marginBottom: '12px',
    letterSpacing: '1px',
    textAlign: 'center',
  },
  clueRow: {
    color: '#FFFFFF',
    fontSize: '16px',
    marginBottom: '8px',
    lineHeight: '1.5',
    textShadow: '1px 1px 2px #000',
    display: 'flex',
    alignItems: 'flex-start',
  },
  clueLengthHint: {
    color: '#AAAAAA',
    fontFamily: 'monospace',
    fontSize: '16px',
    whiteSpace: 'nowrap',
  },
  bottomBar: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '15px',
    pointerEvents: 'auto',
    marginBottom: '20px',
  },
  wordDisplay: {
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    border: '3px solid #00FFFF',
    borderRadius: '12px',
    padding: '15px 40px',
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: '4px',
    minWidth: '300px',
    textAlign: 'center',
    boxShadow: '0 0 20px rgba(0, 255, 255, 0.5)',
  },
  controlsRow: {
    display: 'flex',
    gap: '20px',
  },
  clearBtn: {
    padding: '15px 30px',
    fontSize: '20px',
    fontWeight: 'bold',
    backgroundColor: '#333333',
    color: '#FFFFFF',
    border: '2px solid #777777',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  fireBtn: {
    padding: '15px 50px',
    fontSize: '24px',
    fontWeight: 'bold',
    backgroundColor: '#00FFFF',
    color: '#000000',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    boxShadow: '0 0 15px #00FFFF',
  },
  modalOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'auto',
    zIndex: 100,
  },
  modalContent: {
    backgroundColor: '#0A0A2A',
    border: '4px solid #00FFFF',
    borderRadius: '16px',
    padding: '40px',
    textAlign: 'center',
    maxWidth: '500px',
    boxShadow: '0 0 30px rgba(0, 255, 255, 0.3)',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: '36px',
    margin: '0 0 10px 0',
    textShadow: '0 0 10px #FFFFFF',
  },
  modalText: {
    color: '#FFFFFF',
    fontSize: '18px',
    margin: '8px 0',
    lineHeight: '1.5',
  },
  progressionPanel: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: '20px',
    borderRadius: '12px',
    margin: '20px 0',
    border: '1px solid #333',
    textAlign: 'left',
  },
  reviewList: {
    overflowY: 'auto',
    flex: 1,
    paddingRight: '10px',
    marginTop: '10px',
  },
  reviewItem: {
    color: '#FFF',
    fontSize: '14px',
    padding: '8px 0',
    borderBottom: '1px solid #333',
    lineHeight: '1.4',
  },
  actionBtn: {
    marginTop: '20px',
    padding: '15px 40px',
    fontSize: '20px',
    fontWeight: 'bold',
    backgroundColor: '#FF0033',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    boxShadow: '0 0 15px rgba(255,0,0,0.5)',
  },
  langBtn: {
    padding: '10px 20px',
    fontSize: '16px',
    backgroundColor: '#1A1A3A',
    color: '#00FFFF',
    border: '1px solid #00FFFF',
    borderRadius: '4px',
    cursor: 'pointer',
  }
};
