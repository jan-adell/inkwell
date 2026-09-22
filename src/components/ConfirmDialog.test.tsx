import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

function setup(overrides: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const props = {
    title: 'Delete "My Document"?',
    description: "This document will be permanently deleted.",
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  const user = userEvent.setup();
  render(<ConfirmDialog {...props} />);
  return { user, ...props };
}

describe("ConfirmDialog", () => {
  it("renders the title and description", () => {
    setup();
    expect(screen.getByRole("heading", { name: /My Document/ })).toBeInTheDocument();
    expect(screen.getByText(/permanently deleted/)).toBeInTheDocument();
  });

  it("renders Cancel and Delete buttons", () => {
    setup();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("focuses the Cancel button on mount", () => {
    setup();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const { user, onCancel } = setup();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("calls onConfirm when Delete is clicked", async () => {
    const { user, onConfirm } = setup();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onCancel when the backdrop is clicked", async () => {
    const { user, onCancel } = setup();
    const backdrop = document.querySelector(".absolute.inset-0") as HTMLElement;
    await user.click(backdrop);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("calls onCancel when Escape is pressed", async () => {
    const { user, onCancel } = setup();
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("does not call onConfirm when Cancel is clicked", async () => {
    const { user, onConfirm } = setup();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("does not call onCancel when Delete is clicked", async () => {
    const { user, onCancel } = setup();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onCancel).not.toHaveBeenCalled();
  });
});
