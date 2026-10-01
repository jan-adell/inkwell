import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { AppearanceSettings } from "./AppearanceSettings";
import { useAppearanceStore } from "../store/appearanceStore";

beforeEach(() => {
  localStorage.clear();
  useAppearanceStore.setState(useAppearanceStore.getInitialState());
});

describe("AppearanceSettings — theme backgrounds", () => {
  it("marks the active theme and switches on click", async () => {
    const user = userEvent.setup();
    render(<AppearanceSettings />);

    expect(screen.getByRole("button", { name: "Midnight" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "Forest" })).toHaveAttribute("aria-current", "false");

    await user.click(screen.getByRole("button", { name: "Forest" }));

    expect(useAppearanceStore.getState().theme).toBe("forest");
  });
});

describe("AppearanceSettings — accent color palette", () => {
  it("marks the active accent and switches on click, independent of theme", async () => {
    const user = userEvent.setup();
    render(<AppearanceSettings />);

    expect(screen.getByRole("button", { name: "Amber accent" })).toHaveAttribute("aria-current", "true");

    await user.click(screen.getByRole("button", { name: "Purple accent" }));

    expect(useAppearanceStore.getState().accent).toBe("purple");
    expect(useAppearanceStore.getState().theme).toBe("midnight");
  });
});

describe("AppearanceSettings — typography style", () => {
  it("marks the active font and switches on click", async () => {
    const user = userEvent.setup();
    render(<AppearanceSettings />);

    expect(screen.getByRole("button", { name: "Modern Sans" })).toHaveAttribute("aria-current", "true");

    await user.click(screen.getByRole("button", { name: "Monospace" }));

    expect(useAppearanceStore.getState().font).toBe("mono");
  });
});
