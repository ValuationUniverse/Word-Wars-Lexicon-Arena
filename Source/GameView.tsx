import React, { useRef, useState, useEffect } from 'react';
import { GameEngine, ViewportContext } from './GameEngine';
import { GameLogic } from './GameLogic';
import { usePlayables } from './PlayablesWrapper';
import { languageManager, WordEntry } from './Language';
import { Audio } from './Audio';
import menuArtwork from './assets/Word Wars_ Global Language Arena.png';
import './GameView.css';

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
  const [isMuted, setIsMuted] = useState(playables.isMuted);
  const [bgOffset, setBgOffset] = useState(0);
  const hitFlashRef = useRef(0);
  
  // Progression & Localization UI State
  const [uiLevel, setUiLevel] = useState(1);
  const [uiXp, setUiXp] = useState(0);
  const [uiAchievementsCount, setUiAchievementsCount] = useState(0);
  const [uiActiveClues, setUiActiveClues] = useState<WordEntry[]>([]);
  const [langUI, setLangUI] = useState(languageManager.getUI());

  const isEffectivePaused = playables.isPaused || isPaused;

  useEffect(() => {
    Audio.isMuted = playables.isMuted;
    setIsMuted(playables.isMuted);
  }, [playables.isMuted]);

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
    hitFlashRef.current = logic.playerHp < uiHp
      ? 0.24
      : Math.max(0, hitFlashRef.current - dt);

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
    const animationTime = performance.now();
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
      const barrierRatio = logic.playerHp / logic.maxPlayerHp;
      const barrierColor = barrierRatio > 0.6 ? '#40F5FF' : barrierRatio > 0.3 ? '#FFB84D' : '#FF5268';
      ctx.fillStyle = barrierColor;
      ctx.shadowColor = barrierColor;
      ctx.shadowBlur = 24 + hitFlashRef.current * 100;
      const pWidth = 40;
      const pHeight = vp.height * 0.8;
      ctx.fillRect(logic.playerX - pWidth/2, logic.playerY - pHeight/2, pWidth, pHeight);
      
      // Barrier Glow
      ctx.strokeStyle = barrierColor;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(logic.playerX, logic.playerY, 150, -Math.PI/2, Math.PI/2);
      ctx.stroke();
      if (hitFlashRef.current > 0) {
        ctx.globalAlpha = hitFlashRef.current / 0.24;
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(logic.playerX, logic.playerY, 156 + (0.24 - hitFlashRef.current) * 90, -Math.PI/2, Math.PI/2);
        ctx.stroke();
      }
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
        ctx.shadowColor = isWild ? '#FFD166' : '#58E8FF';
        ctx.shadowBlur = (isWild ? 15 : 9) + (Math.sin(animationTime / 260 + l.x) + 1) * 2;
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
  const toggleMute = () => {
    const muted = !isMuted;
    Audio.isMuted = muted;
    setIsMuted(muted);
    if (!muted) Audio.play('click');
  };
  const startGame = () => {
    Audio.init();
    Audio.play('select');
    logic.start();
  };
  const returnToMenu = () => {
    logic.status = 'menu';
    setUiStatus('menu');
  };

  const toggleLanguage = () => {
    Audio.play('click');
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
        <div className="hudOverlay" style={styles.hudOverlay}>
          {/* Top Bar */}
          <div style={styles.topBar}>
            <div className="stat-box" style={styles.statBox}>
              <div style={styles.statLabel}>{langUI.level} {uiLevel}</div>
              <div className="xp-track">
                <div className="xp-fill" style={{width: `${xpPercent}%`}} />
              </div>
            </div>
            <div className="stat-box" style={styles.statBox}>
              <div style={styles.statLabel}>{langUI.score}</div>
              <div style={styles.statValue}>{uiScore}</div>
            </div>
            <div className="stat-box" style={styles.statBox}>
              <div style={styles.statLabel}>{langUI.wave}</div>
              <div style={styles.statValue}>{uiWave}</div>
            </div>
            <div className="stat-box" style={styles.statBox}>
              <div style={styles.statLabel}>BARRIER</div>
              <div style={{ ...styles.statValue, color: uiHp < 30 ? '#FF5268' : uiHp < 60 ? '#FFB84D' : '#40F5FF' }}>
                {uiHp}%
              </div>
            </div>
            <button type="button" className="sound-button" aria-label={isMuted ? 'Unmute audio' : 'Mute audio'} aria-pressed={isMuted} title={isMuted ? 'Unmute audio' : 'Mute audio'} onPointerDown={stopGameInput} onClick={toggleMute}>
              <span className={`audio-icon${isMuted ? ' is-muted' : ''}`} aria-hidden="true">
                🔊<span className="audio-prohibited" />
              </span>
            </button>
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
        <div className="menu-overlay">
          <img
            className="menu-artwork"
            src={menuArtwork}
            alt="Word Wars: The Global Language Arena"
          />
          <div className="menu-content">
            <section className="menu-info">
              <h2 className="menu-subtitle">{langUI.subtitle}</h2>
              <p className="menu-description">Defend your core by spelling words that match the target definitions.</p>
            </section>

            <div className="menu-progression" style={styles.progressionPanel}>
              <p style={styles.modalText}>✦ Caster Level: <strong style={{color:'#64E8FF'}}>{uiLevel}</strong></p>
              <p style={styles.modalText}>✧ Total XP: <strong style={{color:'#FFD166'}}>{uiXp}</strong></p>
              <p style={styles.modalText}><span aria-hidden="true">🏆</span> Achievements: <strong style={{color:'#83E6B1'}}>{uiAchievementsCount}</strong></p>
            </div>
            <button type="button" className="menu-audio-button" aria-label={isMuted ? 'Unmute audio' : 'Mute audio'} aria-pressed={isMuted} title={isMuted ? 'Unmute audio' : 'Mute audio'} onPointerDown={stopGameInput} onClick={toggleMute}>
              <span className={`audio-icon${isMuted ? ' is-muted' : ''}`} aria-hidden="true">
                🔊<span className="audio-prohibited" />
              </span>
              <span>{isMuted ? 'Sound off' : 'Sound on'}</span>
            </button>
            <button type="button" className="menu-language" style={styles.langBtn} onPointerDown={stopGameInput} onClick={toggleLanguage}>
              {langUI.language_btn}
            </button>

            <button type="button" className="menu-play-button" style={{...styles.actionBtn, backgroundColor: '#00FFFF', color: '#000'}} onPointerDown={stopGameInput} onClick={startGame}>
              {langUI.play_btn}
            </button>
          </div>
        </div>
      )}

      {/* RUN RESULTS SCREEN */}
      {uiStatus === 'results' && (
        <div className="modalOverlay" style={styles.modalOverlay}>
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
                 <h3 style={{color: '#64E8FF', marginTop: 0}}>{langUI.words_mastered}</h3>
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
              <div className="achievement-summary">
                 <h3><span aria-hidden="true">🏆</span> Achievements</h3>
                 {logic.achievements.size === 0
                   ? <p>No trophies earned yet. Keep spelling!</p>
                   : Array.from(logic.achievements).map((achievement) => (
                     <div className="achievement-item" key={achievement}>
                       <span aria-hidden="true">🏅</span>
                       <span>{achievement === 'first_blood' ? 'First Blood' : achievement === 'wave10' ? 'Arena Champion' : achievement === 'tier3' ? 'Wordsmith' : achievement}</span>
                     </div>
                   ))}
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
        <div className="modalOverlay" style={styles.modalOverlay}>
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
    backgroundColor: 'rgba(7, 18, 38, 0.92)',
    border: '1px solid rgba(100, 232, 255, 0.72)',
    borderRadius: '8px',
    padding: '10px 15px',
    textAlign: 'center',
    boxShadow: '0 0 10px rgba(45, 190, 230, 0.22)',
  },
  statLabel: {
    fontSize: '12px',
    color: '#64E8FF',
    fontWeight: 'bold',
    letterSpacing: '1px',
  },
  statValue: {
    fontSize: '24px',
    color: '#EEF8FF',
    fontWeight: 'bold',
    marginTop: '4px',
  },
  pauseBtn: {
    backgroundColor: 'rgba(7, 18, 38, 0.92)',
    border: '1px solid #64E8FF',
    color: '#64E8FF',
    width: '44px',
    height: '44px',
    borderRadius: '8px',
    fontSize: '20px',
    cursor: 'pointer',
    pointerEvents: 'auto',
  },
  cluesContainer: {
    alignSelf: 'center',
    backgroundColor: 'rgba(7, 18, 38, 0.94)',
    border: '1px solid rgba(100, 232, 255, 0.72)',
    borderRadius: '12px',
    padding: '15px 20px',
    width: '90%',
    maxWidth: '800px',
    pointerEvents: 'none',
    marginTop: '10px',
    boxShadow: '0 0 15px rgba(45, 190, 230, 0.22)',
  },
  cluesTitle: {
    color: '#FFD166',
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
    backgroundColor: 'rgba(7, 18, 38, 0.96)',
    border: '2px solid #64E8FF',
    borderRadius: '12px',
    padding: '15px 40px',
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#EEF8FF',
    letterSpacing: '4px',
    minWidth: '300px',
    textAlign: 'center',
    boxShadow: '0 0 20px rgba(100, 232, 255, 0.35)',
  },
  controlsRow: {
    display: 'flex',
    gap: '20px',
  },
  clearBtn: {
    padding: '15px 30px',
    fontSize: '20px',
    fontWeight: 'bold',
    backgroundColor: '#26364B',
    color: '#EEF8FF',
    border: '1px solid #8195AA',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  fireBtn: {
    padding: '15px 50px',
    fontSize: '24px',
    fontWeight: 'bold',
    backgroundColor: '#64E8FF',
    color: '#071226',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    boxShadow: '0 0 15px rgba(100, 232, 255, 0.5)',
  },
  modalOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(3, 9, 22, 0.86)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'auto',
    zIndex: 100,
  },
  modalContent: {
    backgroundColor: '#071226',
    border: '2px solid #64E8FF',
    borderRadius: '16px',
    padding: '40px',
    textAlign: 'center',
    maxWidth: '500px',
    boxShadow: '0 0 30px rgba(100, 232, 255, 0.24)',
  },
  modalTitle: {
    color: '#EEF8FF',
    fontSize: '36px',
    margin: '0 0 10px 0',
    textShadow: '0 0 10px #64E8FF',
  },
  modalText: {
    color: '#FFFFFF',
    fontSize: '18px',
    margin: '8px 0',
    lineHeight: '1.5',
  },
  progressionPanel: {
    backgroundColor: 'rgba(14, 34, 62, 0.94)',
    padding: '20px',
    borderRadius: '12px',
    margin: '20px 0',
    border: '1px solid rgba(100, 232, 255, 0.3)',
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
    backgroundColor: '#FF5268',
    color: '#071226',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    boxShadow: '0 0 15px rgba(255, 82, 104, 0.42)',
  },
  langBtn: {
    padding: '10px 20px',
    fontSize: '16px',
    backgroundColor: '#0E223E',
    color: '#64E8FF',
    border: '1px solid #64E8FF',
    borderRadius: '4px',
    cursor: 'pointer',
  }
};
