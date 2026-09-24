import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockInvoke } from "../test/mocks/tauri";
import { useAppStore } from "../store/appStore";
import type { Document, KnownProject } from "../types/core";
import { DocumentEditor } from "./DocumentEditor";

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

const doc: Document = {
  id: "doc-1",
  project_id: "proj-1",
  parent_id: null,
  node_type: "document",
  title: "Chapter One",
  synopsis: null,
  status: "draft",
  word_count: 0,
  sort_order: 0,
  is_included: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  deleted_at: null,
};

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState());
  useAppStore.setState({ projectId: "proj-1", knownProjects: [knownProject] });
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue(undefined);
  mockSave.mockReset();
});

describe("DocumentEditor export", () => {
  it("exports the book after the user picks a format and a destination", async () => {
    mockSave.mockResolvedValueOnce("/tmp/My Book.epub");
    const user = userEvent.setup();

    render(<DocumentEditor documentId={doc.id} doc={doc} />);
    await user.click(screen.getByTitle("Export book"));
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

  it("does not export when the user cancels the save dialog", async () => {
    mockSave.mockResolvedValueOnce(null);
    const user = userEvent.setup();

    render(<DocumentEditor documentId={doc.id} doc={doc} />);
    await user.click(screen.getByTitle("Export book"));
    await user.click(screen.getByText("PDF (.pdf)"));

    expect(mockInvoke).not.toHaveBeenCalledWith("export_book", expect.anything());
  });
});
