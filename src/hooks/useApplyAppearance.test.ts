import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useAppearanceStore } from "../store/appearanceStore";
import { useApplyAppearance } from "./useApplyAppearance";

beforeEach(() => {
  localStorage.clear();
  useAppearanceStore.setState(useAppearanceStore.getInitialState());
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-accent");
  document.documentElement.removeAttribute("data-font");
});

describe("useApplyAppearance", () => {
  it("applies the current appearance as attributes on <html> when mounted", () => {
    renderHook(() => useApplyAppearance());
    expect(document.documentElement.getAttribute("data-theme")).toBe("midnight");
    expect(document.documentElement.getAttribute("data-accent")).toBe("amber");
    expect(document.documentElement.getAttribute("data-font")).toBe("sans");
  });

  it("updates the attributes when the appearance store changes", () => {
    renderHook(() => useApplyAppearance());
    act(() => {
      useAppearanceStore.getState().setTheme("forest");
      useAppearanceStore.getState().setAccent("cyan");
      useAppearanceStore.getState().setFont("mono");
    });
    expect(document.documentElement.getAttribute("data-theme")).toBe("forest");
    expect(document.documentElement.getAttribute("data-accent")).toBe("cyan");
    expect(document.documentElement.getAttribute("data-font")).toBe("mono");
  });
});
