import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockInvoke } from "../test/mocks/tauri";
import { useAppStore } from "../store/appStore";
import { ProjectLibrary } from "./ProjectLibrary";

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState());
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue(undefined);
});

describe("ProjectLibrary settings", () => {
  it("opens the Settings screen and returns to the library on back", async () => {
    const user = userEvent.setup();
    render(<ProjectLibrary onOpenProject={vi.fn()} onNewProject={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Appearance" })).not.toBeInTheDocument();

    await user.click(screen.getByTitle("Settings"));
    expect(screen.getByRole("button", { name: "Appearance" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Statistics" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /back/i }));
    expect(screen.queryByRole("button", { name: "Appearance" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /new project/i })).toBeInTheDocument();
  });
});
