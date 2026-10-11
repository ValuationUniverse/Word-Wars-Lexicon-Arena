/**
 * 🌐 [LANGUAGE ARCHITECTURE] Extensible vocabulary and localization system.
 * Separates dictionary data from game logic to support future languages.
 */

export interface WordEntry {
  word: string;
  definition: string;
  tier: 1 | 2 | 3; // 1: Easy/Common, 2: Medium/Advanced, 3: Hard/Rare
}

export interface UIStrings {
  title: string;
  subtitle: string;
  play_btn: string;
  rematch_btn: string;
  menu_btn: string;
  paused: string;
  resume: string;
  game_over: string;
  results: string;
  clues_title: string;
  clear: string;
  fire: string;
  score: string;
  wave: string;
  level: string;
  xp: string;
  tap_letters: string;
  language_btn: string;
  coming_soon: string;
  accuracy: string;
  words_mastered: string;
  run_stats: string;
}

export interface LanguagePack {
  id: string;
  name: string;
  isSupported: boolean;
  dictionary: WordEntry[];
  ui: UIStrings;
}

const EN_UI: UIStrings = {
  title: 'WORD WARS',
  subtitle: 'LEXICON ARENA',
  play_btn: 'ENTER ARENA',
  rematch_btn: 'REMATCH',
  menu_btn: 'MAIN MENU',
  paused: 'PAUSED',
  resume: 'RESUME',
  game_over: 'ARENA DEFEAT',
  results: 'COMBAT RESULTS',
  clues_title: 'TARGET DEFINITIONS',
  clear: 'CLEAR',
  fire: 'FIRE!',
  score: 'SCORE',
  wave: 'WAVE',
  level: 'LVL',
  xp: 'XP',
  tap_letters: 'TAP LETTERS',
  language_btn: 'Language: English',
  coming_soon: 'Coming Soon!',
  accuracy: 'Accuracy',
  words_mastered: 'Vocabulary Mastered (Review)',
  run_stats: 'Run Statistics',
};

const EN_DICTIONARY: WordEntry[] = [
  // Tier 1 (Easy)
  { word: 'FIRE', definition: 'Combustion or burning, producing heat and light.', tier: 1 },
  { word: 'ICE', definition: 'Frozen water, a brittle transparent crystalline solid.', tier: 1 },
  { word: 'WIND', definition: 'The perceptible natural movement of the air.', tier: 1 },
  { word: 'ROCK', definition: 'The solid mineral material forming part of the earth.', tier: 1 },
  { word: 'HERO', definition: 'A person admired for courage or outstanding achievements.', tier: 1 },
  { word: 'FAST', definition: 'Moving or capable of moving at high speed.', tier: 1 },
  { word: 'SLOW', definition: 'Moving or operating at a low speed.', tier: 1 },
  { word: 'DARK', definition: 'With little or no light.', tier: 1 },
  { word: 'LIGHT', definition: 'The natural agent that stimulates sight and makes things visible.', tier: 1 },
  { word: 'SWORD', definition: 'A weapon with a long metal blade and a hilt with a hand guard.', tier: 1 },

  // Tier 2 (Medium)
  { word: 'BLAZE', definition: 'A very large or fiercely burning fire.', tier: 2 },
  { word: 'FROST', definition: 'A deposit of small white ice crystals formed on the ground.', tier: 2 },
  { word: 'STORM', definition: 'A violent disturbance of the atmosphere with strong winds.', tier: 2 },
  { word: 'STONE', definition: 'Hard solid non-metallic mineral matter.', tier: 2 },
  { word: 'ROGUE', definition: 'A dishonest or unprincipled person.', tier: 2 },
  { word: 'SWIFT', definition: 'Happening quickly or promptly.', tier: 2 },
  { word: 'SHIELD', definition: 'A broad piece of metal or wood used for protection.', tier: 2 },
  { word: 'SHADOW', definition: 'A dark area produced by a body coming between rays of light.', tier: 2 },
  { word: 'BEACON', definition: 'A fire or light set up in a high position as a warning or signal.', tier: 2 },
  { word: 'KNIGHT', definition: 'A man who served his sovereign or lord as a mounted soldier.', tier: 2 },

  // Tier 3 (Hard/Rare)
  { word: 'INFERNO', definition: 'A large fire that is dangerously out of control.', tier: 3 },
  { word: 'GLACIER', definition: 'A slowly moving mass or river of ice.', tier: 3 },
  { word: 'ZEPHYR', definition: 'A soft, gentle breeze.', tier: 3 },
  { word: 'OBSIDIAN', definition: 'A hard, dark, glasslike volcanic rock.', tier: 3 },
  { word: 'PALADIN', definition: 'A knight renowned for heroism and chivalry.', tier: 3 },
  { word: 'CELERITY', definition: 'Swiftness of movement.', tier: 3 },
  { word: 'AEGIS', definition: 'The backing or support of a particular person or organization (protection).', tier: 3 },
  { word: 'UMBRA', definition: 'The fully shaded inner region of a shadow cast by an opaque object.', tier: 3 },
  { word: 'LUMINOUS', definition: 'Full of or shedding light; bright or shining.', tier: 3 },
  { word: 'EXCALIBUR', definition: 'The legendary sword of King Arthur.', tier: 3 }
];

export const EN_LANG: LanguagePack = {
  id: 'en',
  name: 'English',
  isSupported: true,
  dictionary: EN_DICTIONARY,
  ui: EN_UI
};

export const ES_LANG: LanguagePack = {
  id: 'es',
  name: 'Español',
  isSupported: false,
  dictionary: [],
  ui: EN_UI // Fallback for unsupported state display
};

export class LanguageManager {
  private currentLang: LanguagePack = EN_LANG;
  private availableLangs: LanguagePack[] = [EN_LANG, ES_LANG];

  public getDictionary(): WordEntry[] {
    return this.currentLang.dictionary;
  }

  public getUI(): UIStrings {
    return this.currentLang.ui;
  }

  public getCurrentLangId(): string {
    return this.currentLang.id;
  }

  public getAvailableLanguages(): LanguagePack[] {
    return this.availableLangs;
  }

  public setLanguage(id: string): boolean {
    const lang = this.availableLangs.find(l => l.id === id);
    if (lang && lang.isSupported) {
      this.currentLang = lang;
      return true;
    }
    return false;
  }

  public getRandomWord(maxTier: number = 3): WordEntry {
    const validWords = this.currentLang.dictionary.filter(w => w.tier <= maxTier);
    return validWords[Math.floor(Math.random() * validWords.length)];
  }
}

export const languageManager = new LanguageManager();
