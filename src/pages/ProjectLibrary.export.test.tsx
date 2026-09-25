import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockInvoke } from "../test/mocks/tauri";
import { useAppStore } from "../store/appStore";
import type { KnownProject } from "../types/core";
import { ProjectLibrary } from "./ProjectLibrary";

const mockSave = vi.fn();
vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: (...args: unknown[]) => mockSave(...args),
}));

const knownProject: KnownProject = {
  project_id: "proj-1",
  name: "My Book",
  path: "/tmp/my-book.inkwell",
  last_opened_at: "2026-01-01T00:00:00Z",
};

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState());
  useAppStore.setState({ knownProjects: [knownProject] });
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue(undefined);
  mockSave.mockReset();
});

async function openExportMenu() {
  const user = userEvent.setup();
  render(<ProjectLibrary onOpenProject={vi.fn()} onNewProject={vi.fn()} />);
  await user.click(screen.getByTitle("Export project"));
  return user;
}

describe("ProjectLibrary export menu", () => {
  it("offers Inkwell, txt, pdf, and epub as export options", async () => {
    await openExportMenu();
    expect(screen.getByText("Inkwell Project (.inkwell)")).toBeInTheDocument();
    expect(screen.getByText("Plain Text (.txt)")).toBeInTheDocument();
    expect(screen.getByText("PDF (.pdf)")).toBeInTheDocument();
    expect(screen.getByText("EPUB (.epub)")).toBeInTheDocument();
  });

  it("exports the .inkwell archive via export_project", async () => {
    mockSave.mockResolvedValueOnce("/tmp/My Book.inkwell");
    const user = await openExportMenu();

    await user.click(screen.getByText("Inkwell Project (.inkwell)"));

    expect(mockSave).toHaveBeenCalledWith({
      defaultPath: "My Book.inkwell",
      filters: [{ name: "Inkwell Project", extensions: ["inkwell"] }],
    });
    expect(mockInvoke).toHaveBeenCalledWith("export_project", {
      projectId: "proj-1",
      destPath: "/tmp/My Book.inkwell",
    });
  });

  it("exports a book format via export_book", async () => {
    mockSave.mockResolvedValueOnce("/tmp/My Book.epub");
    const user = await openExportMenu();

    await user.click(screen.getByText("EPUB (.epub)"));

    expect(mockSave).toHaveBeenCalledWith({
      defaultPath: "My Book.epub",
      filters: [{ name: "EPUB Book", extensions: ["epub"] }],
    });
    expect(mockInvoke).toHaveBeenCalledWith("export_book", {
      projectId: "proj-1",
      format: "epub",
      destPath: "/tmp/My Book.epub",
    });
  });

  it("does not export when the save dialog is cancelled", async () => {
    mockSave.mockResolvedValueOnce(null);
    const user = await openExportMenu();

    await user.click(screen.getByText("PDF (.pdf)"));

    expect(mockInvoke).not.toHaveBeenCalledWith("export_book", expect.anything());
    expect(mockInvoke).not.toHaveBeenCalledWith("export_project", expect.anything());
  });
});
