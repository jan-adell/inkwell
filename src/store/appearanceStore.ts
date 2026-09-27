import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AccentColor, AppearanceSettings, ThemeBackground, TypographyStyle } from "../types/core";

const DEFAULT_APPEARANCE: AppearanceSettings = {
  theme: "midnight",
  accent: "amber",
  font: "sans",
};

interface AppearanceStore extends AppearanceSettings {
  setTheme: (theme: ThemeBackground) => void;
  setAccent: (accent: AccentColor) => void;
  setFont: (font: TypographyStyle) => void;
}

export const useAppearanceStore = create<AppearanceStore>()(
  persist(
    (set) => ({
      ...DEFAULT_APPEARANCE,
      setTheme: (theme) => set({ theme }),
      setAccent: (accent) => set({ accent }),
      setFont: (font) => set({ font }),
    }),
    {
      name: "inkwell-appearance",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
