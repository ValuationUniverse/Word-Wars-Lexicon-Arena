import { Audio } from './Audio';
import { ViewportContext } from './GameEngine';
import { CoreInput, InlineHammerGesturePlugin, InputManager } from './InputManager';
import { PlayablesState } from './PlayablesWrapper';
import { languageManager, WordEntry } from './Language';

export interface FloatingLetter {
  id: string;
  char: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  selected: boolean;
  type: 'NORMAL' | 'WILDCARD';
}

export interface Enemy {
  id: string;
  type: 'BRUTE' | 'NORMAL' | 'BOSS';
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  speed: number;
  radius: number;
  shieldLengthRequired: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
}

export interface FeedbackMessage {
  id: string;
  text: string;
  subtext?: string;
  x: number;
  y: number;
  life: number;
  color: string;
}

export interface SaveData {
  xp: number;
  achievements: string[];
}

export class GameLogic {
  public isPaused = false;
  public status: 'menu' | 'playing' | 'results' | 'victory' = 'menu';
  public score = 0;
  public wave = 1;

  public playerHp = 100;
  public maxPlayerHp = 100;
  public playerX = 100;
  public playerY = 0;

  // Progression (Persistent)
  public playerXp = 0;
  public playerLevel = 1;
  public achievements: Set<string> = new Set();

  // Run Statistics (Educational & Session Feedback)
  public runXpEarned = 0;
  public runAttempts = 0;
  public runHits = 0;
  public runWordsMastered: WordEntry[] = [];

  public letters: FloatingLetter[] = [];
  public currentWord: FloatingLetter[] = [];
  public enemies: Enemy[] = [];
  public particles: Particle[] = [];
  public activeTargets: WordEntry[] = [];
  public feedback: FeedbackMessage[] = [];

  public screenShakeTime = 0;
  private waveTimer = 0;
  private spawnInterval = 3.5;
  private nextLetterId = 0;
  private nextEnemyId = 0;
  private nextFeedbackId = 0;

  public inputManager: InputManager | null = null;

  public initializeInputManager(): void {
    this.destroyInputManager();
    this.inputManager = new InputManager();
    this.inputManager.use(new InlineHammerGesturePlugin());
  }

  public destroyInputManager(): void {
    this.inputManager?.destroy();
    this.inputManager = null;
  }

  // Decodes Level safely from total XP to prevent desynchronization
  private calculateLevel(xp: number): number {
    return Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1;
  }

  public loadSaveData(data: SaveData) {
    if (typeof data.xp === 'number') {
      this.playerXp = data.xp;
      this.playerLevel = this.calculateLevel(this.playerXp);
    }
    if (Array.isArray(data.achievements)) {
      this.achievements = new Set(data.achievements);
    }
  }

  private triggerSave() {
    const data: SaveData = {
      xp: this.playerXp,
      achievements: Array.from(this.achievements)
    };
    PlayablesState.saveGameData(data);
  }

  private addXp(amount: number) {
    const oldLevel = this.playerLevel;
    this.playerXp += amount;
    this.runXpEarned += amount;
    this.playerLevel = this.calculateLevel(this.playerXp);

    if (this.playerLevel > oldLevel) {
      this.addFeedback(this.playerX, this.playerY - 100, `LEVEL UP! (${this.playerLevel})`, undefined, '#FFD700');
      Audio.play('reward');
    }
    this.triggerSave();
  }

  private unlockAchievement(id: string, name: string) {
    if (!this.achievements.has(id)) {
      this.achievements.add(id);
      this.addFeedback(this.playerX, this.playerY - 150, 'ACHIEVEMENT UNLOCKED', name, '#00FFFF');
      Audio.play('reward');
      this.triggerSave();
    }
  }

  public start() {
    this.score = 0;
    this.wave = 1;
    this.playerHp = 100;
    this.status = 'playing';
    this.letters = [];
    this.currentWord = [];
    this.enemies = [];
    this.particles = [];
    this.feedback = [];
    this.activeTargets = [];
    this.waveTimer = 0;

    // Reset Run Stats
    this.runXpEarned = 0;
    this.runAttempts = 0;
    this.runHits = 0;
    this.runWordsMastered = [];

    this.populateTargetWords();
  }

  public togglePause() {
    if (this.status !== 'playing') return;
    this.isPaused = !this.isPaused;
    Audio.play('select');
  }

  private populateTargetWords() {
    while (this.activeTargets.length < 3) {
      const maxTier = this.wave < 4 ? 1 : (this.wave < 7 ? 2 : 3);
      let wordEntry;
      do {
        wordEntry = languageManager.getRandomWord(maxTier);
      } while (this.activeTargets.some(t => t.word === wordEntry.word));
      
      this.activeTargets.push(wordEntry);
    }
    this.ensureSolvability();
  }

  /**
   * Guarantees solvability by checking if all required letters for active targets
   * are currently present on the board. Spawns missing letters.
   */
  private ensureSolvability() {
    const boardChars = [
      ...this.letters.map(l => l.char),
      ...this.currentWord.map(l => l.char)
    ];

    this.activeTargets.forEach(target => {
      const needed = target.word.split('');
      const available = [...boardChars];

      needed.forEach(char => {
        const idx = available.indexOf(char);
        if (idx !== -1) {
          available.splice(idx, 1);
        } else {
          // Missing character, spawn it to guarantee solvability
          this.letters.push({
            id: `L_${this.nextLetterId++}`,
            char,
            x: 300 + Math.random() * 500,
            y: -50 - Math.random() * 100,
            vx: (Math.random() - 0.5) * 60,
            vy: 40 + Math.random() * 60,
            radius: 28,
            selected: false,
            type: 'NORMAL',
          });
          boardChars.push(char);
        }
      });
    });

    this.cleanUpExcessLetters();
  }

  private cleanUpExcessLetters() {
    // Remove letters that are not needed by ANY active target to prevent clutter.
    const neededChars = new Set(this.activeTargets.flatMap(t => t.word.split('')));
    
    for (let i = this.letters.length - 1; i >= 0; i--) {
      const l = this.letters[i];
      if (l.type === 'WILDCARD') continue;
      if (!neededChars.has(l.char)) {
        // Unneeded, 50% chance to remove immediately, keeps board clean but allows some noise
        if (Math.random() > 0.5) {
          this.letters.splice(i, 1);
        }
      }
    }
  }

  private spawnEnemy(vp: ViewportContext) {
    const typeRoll = Math.random();
    let type: Enemy['type'] = 'NORMAL';
    let hp = 100 + this.wave * 25;
    let speed = 40 + this.wave * 5;
    let shield = 0;
    let radius = 35;

    if (this.wave > 3 && typeRoll > 0.7) {
      type = 'BRUTE';
      hp *= 2.0;
      speed *= 0.6;
      shield = 5; // Requires 5 letter word minimum
      radius = 50;
    } else if (this.wave > 6 && typeRoll > 0.95) {
      type = 'BOSS';
      hp *= 5;
      speed *= 0.4;
      shield = 6;
      radius = 80;
    }

    this.enemies.push({
      id: `E_${this.nextEnemyId++}`,
      type,
      hp,
      maxHp: hp,
      x: vp.width + 100,
      y: vp.centerY + (Math.random() - 0.5) * (vp.height * 0.6),
      speed,
      radius,
      shieldLengthRequired: shield,
    });
  }

  public clearWord() {
    this.currentWord.forEach(l => l.selected = false);
    this.currentWord = [];
    Audio.play('select');
  }

  private isMatch(targetStr: string, assembled: string): boolean {
    if (targetStr.length !== assembled.length) return false;
    for (let i = 0; i < targetStr.length; i++) {
      if (assembled[i] !== '*' && targetStr[i] !== assembled[i]) return false;
    }
    return true;
  }

  public fireWord() {
    if (this.currentWord.length === 0) return;
    this.runAttempts++;

    let assembled = '';
    this.currentWord.forEach(l => {
      assembled += (l.type === 'WILDCARD' ? '*' : l.char);
    });

    // Validate against ACTIVE targets to ensure solvability & education
    const targetIndex = this.activeTargets.findIndex(t => this.isMatch(t.word, assembled));

    if (targetIndex === -1) {
      Audio.play('error');
      this.addFeedback(this.playerX + 200, this.playerY, 'INVALID COMMAND', 'Must match an active clue!', '#FF0033');
      this.clearWord();
      return;
    }

    this.runHits++;
    const validEntry = this.activeTargets[targetIndex];
    this.runWordsMastered.push(validEntry);
    
    const wordLen = validEntry.word.length;
    
    // Calculate Damage and XP based on Word Tier
    let damage = wordLen * 15;
    let xpReward = 10;
    
    if (validEntry.tier === 2) {
      damage *= 1.5;
      xpReward = 25;
    } else if (validEntry.tier === 3) {
      damage *= 2.5;
      xpReward = 50;
      this.unlockAchievement('tier3', 'Wordsmith');
    }

    this.score += Math.floor(damage);
    this.addXp(xpReward);
    Audio.play('score', validEntry.tier * 2);

    // Educational Feedback on Success
    this.addFeedback(this.playerX + 300, this.playerY - 50, validEntry.word, validEntry.definition, '#00FFFF');

    // Find front-most enemy (smallest X)
    let target: Enemy | null = null;
    let minX = Infinity;
    this.enemies.forEach(e => {
      if (e.x < minX) {
        minX = e.x;
        target = e;
      }
    });

    if (target) {
      if (target.shieldLengthRequired > wordLen) {
        Audio.play('invalid'); 
        this.spawnParticles(target.x, target.y, 10, '#555555');
        this.addFeedback(target.x, target.y - 50, 'BLOCKED', 'Word too short!', '#AAAAAA');
      } else {
        target.hp -= damage;
        Audio.play('explosion');
        this.spawnParticles(target.x, target.y, wordLen * 5, '#00FFFF');
        this.addFeedback(target.x, target.y, `-${Math.floor(damage)}`, undefined, '#FF3333');
        
        if (target.hp <= 0) {
          this.enemies = this.enemies.filter(e => e.id !== (target as Enemy).id);
          this.unlockAchievement('first_blood', 'First Blood');
        }
      }
    }

    // Remove used letters from pool permanently
    const usedIds = new Set(this.currentWord.map(l => l.id));
    this.letters = this.letters.filter(l => !usedIds.has(l.id));
    this.currentWord = [];

    // Remove completed target and spawn a new one, then check solvability
    this.activeTargets.splice(targetIndex, 1);
    this.populateTargetWords();
  }

  private addFeedback(x: number, y: number, text: string, subtext?: string, color: string = '#FFFFFF') {
    this.feedback.push({
      id: `F_${this.nextFeedbackId++}`,
      x,
      y,
      text,
      subtext,
      life: 2.0,
      color
    });
  }

  private spawnParticles(x: number, y: number, count: number, color: string) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 200 + 50;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        maxLife: 0.5 + Math.random() * 0.5,
        color
      });
    }
  }

  public update(dt: number, vp: ViewportContext, isHostPaused: boolean = false) {
    if (this.isPaused || isHostPaused || this.status !== 'playing') return;

    this.playerY = vp.centerY;

    const input = this.inputManager?.processInput();
    if (!input) return;

    // Handle Taps
    for (const evt of input.events) {
      if (evt.type === 'POINTER_TAP') {
        let hit = false;
        for (let i = this.letters.length - 1; i >= 0; i--) {
          const l = this.letters[i];
          if (l.selected) continue;
          const dist = Math.hypot(evt.x - l.x, evt.y - l.y);
          if (dist < l.radius * 1.5) {
            l.selected = true;
            this.currentWord.push(l);
            Audio.play('click', 1 + this.currentWord.length * 0.1);
            hit = true;
            break;
          }
        }
      }
    }

    // Update Letters
    this.letters.forEach(l => {
      if (l.selected) return;
      l.x += l.vx * dt;
      l.y += l.vy * dt;

      if (l.x < 300) { l.x = 300; l.vx *= -1; }
      if (l.x > vp.width - l.radius) { l.x = vp.width - l.radius; l.vx *= -1; }

      if (l.y > vp.height + 50) {
        l.y = -50;
        l.x = 300 + Math.random() * (vp.width - 400);
      }
    });

    // Spawn Enemies
    this.waveTimer -= dt;
    if (this.waveTimer <= 0) {
      this.spawnEnemy(vp);
      this.waveTimer = Math.max(1.5, this.spawnInterval - (this.wave * 0.1));
      if (this.enemies.length > 0 && this.nextEnemyId % 10 === 0) {
        this.wave++;
        Audio.play('reward');
        this.addFeedback(vp.centerX, vp.centerY - 200, `WAVE ${this.wave}`, undefined, '#FF00FF');
        if (this.wave === 10) this.unlockAchievement('wave10', 'Arena Champion');
      }
    }

    // Update Enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.x -= e.speed * dt;

      if (e.x - e.radius <= this.playerX + 50) {
        this.playerHp -= (e.type === 'BOSS' ? 40 : (e.type === 'BRUTE' ? 20 : 10));
        this.spawnParticles(this.playerX + 50, e.y, 20, '#FF0033');
        Audio.play('error');
        this.screenShakeTime = 0.3;
        this.enemies.splice(i, 1);

        if (this.playerHp <= 0) {
          this.playerHp = 0;
          this.status = 'results';
          Audio.play('gameover');
          PlayablesState.sendGameScore(this.score);
          this.triggerSave();
        }
      }
    }

    // Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // Update Feedback
    for (let i = this.feedback.length - 1; i >= 0; i--) {
      const f = this.feedback[i];
      f.y -= 30 * dt;
      f.life -= dt;
      if (f.life <= 0) {
        this.feedback.splice(i, 1);
      }
    }

    if (this.screenShakeTime > 0) {
      this.screenShakeTime -= dt;
    }
  }
}
