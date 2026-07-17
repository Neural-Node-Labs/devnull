export interface Theme {
  id: string;
  name: string;
  description: string;
  colors: {
    primary: string;
    primaryHover: string;
    bg: string;
    bgSecondary: string;
    surface: string;
    text: string;
    textSecondary: string;
    border: string;
    accent: string;
    success: string;
    warning: string;
    error: string;
    sidebarBg: string;
    sidebarText: string;
    sidebarHover: string;
    cardBg: string;
    inputBg: string;
    navBg: string;
  };
}

export const themes: Theme[] = [
  {
    id: "default-dark",
    name: "Default Dark",
    description: "Classic dark theme with blue accents",
    colors: {
      primary: "#3b82f6",
      primaryHover: "#2563eb",
      bg: "#0f172a",
      bgSecondary: "#1e293b",
      surface: "#1e293b",
      text: "#f1f5f9",
      textSecondary: "#94a3b8",
      border: "#334155",
      accent: "#60a5fa",
      success: "#22c55e",
      warning: "#f59e0b",
      error: "#ef4444",
      sidebarBg: "#0f172a",
      sidebarText: "#94a3b8",
      sidebarHover: "#1e293b",
      cardBg: "#1e293b",
      inputBg: "#0f172a",
      navBg: "#1e293b",
    },
  },
  {
    id: "default-light",
    name: "Default Light",
    description: "Clean light theme with blue accents",
    colors: {
      primary: "#2563eb",
      primaryHover: "#1d4ed8",
      bg: "#ffffff",
      bgSecondary: "#f8fafc",
      surface: "#f1f5f9",
      text: "#0f172a",
      textSecondary: "#64748b",
      border: "#e2e8f0",
      accent: "#3b82f6",
      success: "#16a34a",
      warning: "#d97706",
      error: "#dc2626",
      sidebarBg: "#f8fafc",
      sidebarText: "#64748b",
      sidebarHover: "#e2e8f0",
      cardBg: "#ffffff",
      inputBg: "#ffffff",
      navBg: "#ffffff",
    },
  },
  {
    id: "dracula",
    name: "Dracula",
    description: "Dark purple-pink theme inspired by Dracula",
    colors: {
      primary: "#bd93f9",
      primaryHover: "#a679f2",
      bg: "#282a36",
      bgSecondary: "#44475a",
      surface: "#44475a",
      text: "#f8f8f2",
      textSecondary: "#6272a4",
      border: "#44475a",
      accent: "#ff79c6",
      success: "#50fa7b",
      warning: "#ffb86c",
      error: "#ff5555",
      sidebarBg: "#21222c",
      sidebarText: "#6272a4",
      sidebarHover: "#44475a",
      cardBg: "#44475a",
      inputBg: "#282a36",
      navBg: "#21222c",
    },
  },
  {
    id: "nord",
    name: "Nord",
    description: "Arctic, bluish cold theme",
    colors: {
      primary: "#88c0d0",
      primaryHover: "#81a1c1",
      bg: "#2e3440",
      bgSecondary: "#3b4252",
      surface: "#434c5e",
      text: "#eceff4",
      textSecondary: "#81a1c1",
      border: "#4c566a",
      accent: "#b48ead",
      success: "#a3be8c",
      warning: "#ebcb8b",
      error: "#bf616a",
      sidebarBg: "#2e3440",
      sidebarText: "#81a1c1",
      sidebarHover: "#3b4252",
      cardBg: "#3b4252",
      inputBg: "#2e3440",
      navBg: "#3b4252",
    },
  },
  {
    id: "monokai",
    name: "Monokai",
    description: "Vibrant dark theme with bright accents",
    colors: {
      primary: "#a6e22e",
      primaryHover: "#95d626",
      bg: "#272822",
      bgSecondary: "#383830",
      surface: "#3e3d32",
      text: "#f8f8f2",
      textSecondary: "#75715e",
      border: "#49483e",
      accent: "#f92672",
      success: "#a6e22e",
      warning: "#e6db74",
      error: "#f92672",
      sidebarBg: "#1f201c",
      sidebarText: "#75715e",
      sidebarHover: "#383830",
      cardBg: "#3e3d32",
      inputBg: "#272822",
      navBg: "#1f201c",
    },
  },
  {
    id: "solarized-dark",
    name: "Solarized Dark",
    description: "Earthy dark theme with warm tones",
    colors: {
      primary: "#268bd2",
      primaryHover: "#2aa198",
      bg: "#002b36",
      bgSecondary: "#073642",
      surface: "#073642",
      text: "#839496",
      textSecondary: "#657b83",
      border: "#073642",
      accent: "#b58900",
      success: "#859900",
      warning: "#cb4b16",
      error: "#dc322f",
      sidebarBg: "#002b36",
      sidebarText: "#657b83",
      sidebarHover: "#073642",
      cardBg: "#073642",
      inputBg: "#002b36",
      navBg: "#073642",
    },
  },
  {
    id: "solarized-light",
    name: "Solarized Light",
    description: "Earthy light theme with warm tones",
    colors: {
      primary: "#268bd2",
      primaryHover: "#2aa198",
      bg: "#fdf6e3",
      bgSecondary: "#eee8d5",
      surface: "#eee8d5",
      text: "#657b83",
      textSecondary: "#93a1a1",
      border: "#d5c4a1",
      accent: "#b58900",
      success: "#859900",
      warning: "#cb4b16",
      error: "#dc322f",
      sidebarBg: "#fdf6e3",
      sidebarText: "#93a1a1",
      sidebarHover: "#eee8d5",
      cardBg: "#fdf6e3",
      inputBg: "#fdf6e3",
      navBg: "#eee8d5",
    },
  },
  {
    id: "github-dark",
    name: "GitHub Dark",
    description: "GitHub's dark mode theme",
    colors: {
      primary: "#58a6ff",
      primaryHover: "#79c0ff",
      bg: "#0d1117",
      bgSecondary: "#161b22",
      surface: "#21262d",
      text: "#c9d1d9",
      textSecondary: "#8b949e",
      border: "#30363d",
      accent: "#f78166",
      success: "#3fb950",
      warning: "#d29922",
      error: "#f85149",
      sidebarBg: "#0d1117",
      sidebarText: "#8b949e",
      sidebarHover: "#161b22",
      cardBg: "#161b22",
      inputBg: "#0d1117",
      navBg: "#161b22",
    },
  },
  {
    id: "catppuccin",
    name: "Catppuccin Mocha",
    description: "Soft, warm dark theme with pastel accents",
    colors: {
      primary: "#89b4fa",
      primaryHover: "#74c7ec",
      bg: "#1e1e2e",
      bgSecondary: "#313244",
      surface: "#45475a",
      text: "#cdd6f4",
      textSecondary: "#a6adc8",
      border: "#45475a",
      accent: "#f5c2e7",
      success: "#a6e3a1",
      warning: "#f9e2af",
      error: "#f38ba8",
      sidebarBg: "#181825",
      sidebarText: "#a6adc8",
      sidebarHover: "#313244",
      cardBg: "#313244",
      inputBg: "#1e1e2e",
      navBg: "#181825",
    },
  },
  {
    id: "tokyo-night",
    name: "Tokyo Night",
    description: "Deep blue dark theme with vibrant accents",
    colors: {
      primary: "#7aa2f7",
      primaryHover: "#89ddff",
      bg: "#1a1b26",
      bgSecondary: "#24283b",
      surface: "#2f3346",
      text: "#c0caf5",
      textSecondary: "#565f89",
      border: "#2f3346",
      accent: "#bb9af7",
      success: "#9ece6a",
      warning: "#e0af68",
      error: "#f7768e",
      sidebarBg: "#1a1b26",
      sidebarText: "#565f89",
      sidebarHover: "#24283b",
      cardBg: "#24283b",
      inputBg: "#1a1b26",
      navBg: "#24283b",
    },
  },
];

export const themeStorageKey = "devnull_theme";

export function getStoredTheme(): string {
  return localStorage.getItem(themeStorageKey) || "default-dark";
}

export function storeTheme(themeId: string): void {
  localStorage.setItem(themeStorageKey, themeId);
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const c = theme.colors;
  root.style.setProperty("--color-primary", c.primary);
  root.style.setProperty("--color-primary-hover", c.primaryHover);
  root.style.setProperty("--color-bg", c.bg);
  root.style.setProperty("--color-bg-secondary", c.bgSecondary);
  root.style.setProperty("--color-surface", c.surface);
  root.style.setProperty("--color-text", c.text);
  root.style.setProperty("--color-text-secondary", c.textSecondary);
  root.style.setProperty("--color-border", c.border);
  root.style.setProperty("--color-accent", c.accent);
  root.style.setProperty("--color-success", c.success);
  root.style.setProperty("--color-warning", c.warning);
  root.style.setProperty("--color-error", c.error);
  root.style.setProperty("--color-sidebar-bg", c.sidebarBg);
  root.style.setProperty("--color-sidebar-text", c.sidebarText);
  root.style.setProperty("--color-sidebar-hover", c.sidebarHover);
  root.style.setProperty("--color-card-bg", c.cardBg);
  root.style.setProperty("--color-input-bg", c.inputBg);
  root.style.setProperty("--color-nav-bg", c.navBg);
}

