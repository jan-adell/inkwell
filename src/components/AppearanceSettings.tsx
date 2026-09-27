import { useAppearanceStore } from "../store/appearanceStore";
import type { AccentColor, ThemeBackground, TypographyStyle } from "../types/core";

const THEME_OPTIONS: { id: ThemeBackground; label: string }[] = [
  { id: "ivory", label: "Ivory" },
  { id: "light-blue", label: "Light Blue" },
  { id: "graphite", label: "Graphite" },
  { id: "midnight", label: "Midnight" },
  { id: "forest", label: "Forest" },
];

const ACCENT_OPTIONS: { id: AccentColor; label: string }[] = [
  { id: "purple", label: "Purple accent" },
  { id: "blue", label: "Blue accent" },
  { id: "cyan", label: "Cyan accent" },
  { id: "green", label: "Green accent" },
  { id: "orange", label: "Orange accent" },
  { id: "amber", label: "Amber accent" },
];

const FONT_OPTIONS: { id: TypographyStyle; label: string }[] = [
  { id: "serif", label: "Editorial Serif (Playfair)" },
  { id: "sans", label: "Modern Sans (Inter)" },
  { id: "mono", label: "Monospace (JetBrains)" },
];

export function AppearanceSettings() {
  const { theme, setTheme, accent, setAccent, font, setFont } = useAppearanceStore();

  return (
    <div className="space-y-8">
      <section>
        <p className="text-xs text-ivory-ghost uppercase tracking-wider mb-3">Theme Backgrounds</p>
        <div className="grid grid-cols-5 gap-3">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.id}
              onClick={() => setTheme(option.id)}
              aria-current={theme === option.id}
              data-theme={option.id}
              className={`flex flex-col items-center gap-2 py-4 rounded-lg border text-sm transition-colors bg-ink-void text-ivory ${
                theme === option.id ? "border-gold" : "border-ink-border hover:border-ink-muted"
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-ivory" />
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <p className="text-xs text-ivory-ghost uppercase tracking-wider mb-3">Accent Color Palette</p>
        <div className="flex gap-3">
          {ACCENT_OPTIONS.map((option) => (
            <button
              key={option.id}
              onClick={() => setAccent(option.id)}
              aria-current={accent === option.id}
              aria-label={option.label}
              data-accent={option.id}
              className={`w-9 h-9 rounded-full bg-gold transition-transform ${
                accent === option.id ? "ring-2 ring-offset-2 ring-offset-ink-void ring-ivory scale-105" : ""
              }`}
            />
          ))}
        </div>
      </section>

      <section>
        <p className="text-xs text-ivory-ghost uppercase tracking-wider mb-3">Typography Style</p>
        <div className="grid grid-cols-3 gap-3">
          {FONT_OPTIONS.map((option) => (
            <button
              key={option.id}
              onClick={() => setFont(option.id)}
              aria-current={font === option.id}
              data-font={option.id}
              className={`font-body py-4 rounded-lg border text-sm transition-colors bg-ink-void text-ivory ${
                font === option.id ? "border-gold" : "border-ink-border hover:border-ink-muted"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
