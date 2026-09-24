import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ExportMenu } from "./DocumentEditor";

describe("ExportMenu", () => {
  it("does not show format options until opened", () => {
    render(<ExportMenu onExport={vi.fn()} exportingFormat={null} />);
    expect(screen.queryByText("Plain Text (.txt)")).not.toBeInTheDocument();
  });

  it("shows txt, pdf, and epub options when opened", async () => {
    const user = userEvent.setup();
    render(<ExportMenu onExport={vi.fn()} exportingFormat={null} />);

    await user.click(screen.getByTitle("Export book"));

    expect(screen.getByText("Plain Text (.txt)")).toBeInTheDocument();
    expect(screen.getByText("PDF (.pdf)")).toBeInTheDocument();
    expect(screen.getByText("EPUB (.epub)")).toBeInTheDocument();
  });

  it("calls onExport with the chosen format and closes the menu", async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    render(<ExportMenu onExport={onExport} exportingFormat={null} />);

    await user.click(screen.getByTitle("Export book"));
    await user.click(screen.getByText("EPUB (.epub)"));

    expect(onExport).toHaveBeenCalledWith("epub");
    expect(screen.queryByText("Plain Text (.txt)")).not.toBeInTheDocument();
  });

  it("disables the export button while a format is exporting", () => {
    render(<ExportMenu onExport={vi.fn()} exportingFormat="pdf" />);
    expect(screen.getByTitle("Export book")).toBeDisabled();
  });
});
