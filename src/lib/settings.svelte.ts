export type AccentTheme = 'blue' | 'white' | 'red' | 'pink' | 'purple' | 'violet' | 'rose' | 'emerald' | 'amber' | 'cyan';

export interface ThemeOption {
  id: AccentTheme;
  name: string;
  bg: string;
  contrast: string;
}

export const THEMES: ThemeOption[] = [
  { id: 'blue', name: 'Blue', bg: '#3b82f6', contrast: '#ffffff' },
  { id: 'white', name: 'White', bg: '#ffffff', contrast: '#000000' },
  { id: 'red', name: 'Red', bg: '#ef4444', contrast: '#ffffff' },
  { id: 'pink', name: 'Pink', bg: '#ec4899', contrast: '#ffffff' },
  { id: 'purple', name: 'Purple', bg: '#a855f7', contrast: '#ffffff' },
];

class SettingsState {
  autoSave = $state<boolean>(true);
  showSettings = $state<boolean>(false);
  accentTheme = $state<AccentTheme>('white');

  constructor() {
    if (typeof window !== 'undefined') {
      const storedAutoSave = localStorage.getItem('vibes_auto_save');
      if (storedAutoSave !== null) {
        this.autoSave = storedAutoSave === 'true';
      }

      const storedTheme = localStorage.getItem('vibes_accent_theme') as AccentTheme | null;
      if (storedTheme && THEMES.some(t => t.id === storedTheme)) {
        this.accentTheme = storedTheme;
      }
      this.applyTheme(this.accentTheme);
    }
  }

  toggleAutoSave() {
    this.autoSave = !this.autoSave;
    if (typeof window !== 'undefined') {
      localStorage.setItem('vibes_auto_save', String(this.autoSave));
    }
  }

  setAccentTheme(theme: AccentTheme) {
    this.accentTheme = theme;
    if (typeof window !== 'undefined') {
      localStorage.setItem('vibes_accent_theme', theme);
      this.applyTheme(theme);
    }
  }

  private applyTheme(theme: AccentTheme) {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-accent', theme);
    }
  }
}

export const settings = new SettingsState();
