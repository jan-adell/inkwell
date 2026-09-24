import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mockInvoke } from "../test/mocks/tauri";
import { SettingsScreen } from "./SettingsScreen";
import { useAppStore } from "../store/appStore";

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue({ entity_count: 0, document_count: 0, total_word_count: 0, documents: [] });
  useAppStore.setState({ projectId: "proj-1" });
});

describe("SettingsScreen", () => {
  it("selects Statistics by default and shows the statistics panel", () => {
    render(<SettingsScreen onBack={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Statistics" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByText(/loading statistics/i)).toBeInTheDocument();
  });

  it("calls onBack when the back control is clicked", async () => {
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(<SettingsScreen onBack={onBack} />);
    await user.click(screen.getByRole("button", { name: /back/i }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
