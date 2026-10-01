import { useEffect } from "react";
import { useAppearanceStore } from "../store/appearanceStore";

export function useApplyAppearance() {
  const { theme, accent, font } = useAppearanceStore();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.setAttribute("data-accent", accent);
    document.documentElement.setAttribute("data-font", font);
  }, [theme, accent, font]);
}
