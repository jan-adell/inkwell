import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ExportMenu } from "./ExportMenu";

const OPTIONS = [
  { id: "inkwell", label: "Inkwell Project (.inkwell)" },
  { id: "txt", label: "Plain Text (.txt)" },
  { id: "pdf", label: "PDF (.pdf)" },
  { id: "epub", label: "EPUB (.epub)" },
];

describe("ExportMenu", () => {
  it("does not show options until opened", () => {
    render(<ExportMenu options={OPTIONS} onSelect={vi.fn()} title="Export project" />);
    expect(screen.queryByText("Plain Text (.txt)")).not.toBeInTheDocument();
  });

  it("shows every option when opened", async () => {
    const user = userEvent.setup();
    render(<ExportMenu options={OPTIONS} onSelect={vi.fn()} title="Export project" />);

    await user.click(screen.getByTitle("Export project"));

    expect(screen.getByText("Inkwell Project (.inkwell)")).toBeInTheDocument();
    expect(screen.getByText("Plain Text (.txt)")).toBeInTheDocument();
    expect(screen.getByText("PDF (.pdf)")).toBeInTheDocument();
    expect(screen.getByText("EPUB (.epub)")).toBeInTheDocument();
  });

  it("calls onSelect with the chosen option id and closes the menu", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ExportMenu options={OPTIONS} onSelect={onSelect} title="Export project" />);

    await user.click(screen.getByTitle("Export project"));
    await user.click(screen.getByText("EPUB (.epub)"));

    expect(onSelect).toHaveBeenCalledWith("epub");
    expect(screen.queryByText("Plain Text (.txt)")).not.toBeInTheDocument();
  });

  it("disables the trigger button while disabled is true", () => {
    render(<ExportMenu options={OPTIONS} onSelect={vi.fn()} disabled title="Export project" />);
    expect(screen.getByTitle("Export project")).toBeDisabled();
  });
});
