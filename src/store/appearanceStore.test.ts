import { beforeEach, describe, expect, it } from "vitest";
import { useAppearanceStore } from "./appearanceStore";

beforeEach(() => {
  localStorage.clear();
  useAppearanceStore.setState(useAppearanceStore.getInitialState());
});

describe("appearanceStore defaults", () => {
  it("starts with the midnight theme, amber accent, and sans font", () => {
    const { theme, accent, font } = useAppearanceStore.getState();
    expect(theme).toBe("midnight");
    expect(accent).toBe("amber");
    expect(font).toBe("sans");
  });
});

describe("appearanceStore setters", () => {
  it("setTheme updates only the theme", () => {
    useAppearanceStore.getState().setTheme("forest");
    expect(useAppearanceStore.getState().theme).toBe("forest");
    expect(useAppearanceStore.getState().accent).toBe("amber");
  });

  it("setAccent updates only the accent", () => {
    useAppearanceStore.getState().setAccent("purple");
    expect(useAppearanceStore.getState().accent).toBe("purple");
    expect(useAppearanceStore.getState().theme).toBe("midnight");
  });

  it("setFont updates only the font", () => {
    useAppearanceStore.getState().setFont("mono");
    expect(useAppearanceStore.getState().font).toBe("mono");
    expect(useAppearanceStore.getState().theme).toBe("midnight");
  });
});

describe("appearanceStore persistence", () => {
  it("persists choices to localStorage under the inkwell-appearance key", () => {
    useAppearanceStore.getState().setTheme("graphite");
    const raw = localStorage.getItem("inkwell-appearance");
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!).state.theme).toBe("graphite");
  });
});
