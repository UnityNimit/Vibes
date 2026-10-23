export type AccentTheme = 'white' | 'blue' | 'emerald' | 'violet' | 'rose' | 'amber' | 'cyan';

export interface ThemeOption {
  id: AccentTheme;
  bg: string;
  contrast: string;
}

export const THEMES: ThemeOption[] = [
  { id: 'white', bg: '#ffffff', contrast: '#000000' },
  { id: 'blue', bg: '#3b82f6', contrast: '#ffffff' },
  { id: 'emerald', bg: '#10b981', contrast: '#ffffff' },
  { id: 'violet', bg: '#a855f7', contrast: '#ffffff' },
  { id: 'rose', bg: '#f43f5e', contrast: '#ffffff' },
  { id: 'amber', bg: '#f59e0b', contrast: '#000000' },
  { id: 'cyan', bg: '#06b6d4', contrast: '#000000' }
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
