import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { mockInvoke } from "../test/mocks/tauri";
import { StatisticsPanel } from "./StatisticsPanel";
import { useAppStore } from "../store/appStore";
import type { ProjectStats } from "../types/core";

const STATS: ProjectStats = {
  entity_count: 3,
  document_count: 2,
  total_word_count: 150,
  documents: [
    { id: "doc-1", title: "Chapter One", word_count: 100 },
    { id: "doc-2", title: "Chapter Two", word_count: 50 },
  ],
};

beforeEach(() => {
  mockInvoke.mockReset();
  useAppStore.setState({ projectId: "proj-1" });
});

describe("StatisticsPanel", () => {
  it("shows a loading state before stats arrive", () => {
    mockInvoke.mockReturnValue(new Promise(() => {}));
    render(<StatisticsPanel />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("renders entity count, document count, total words, and per-document breakdown", async () => {
    mockInvoke.mockResolvedValue(STATS);
    render(<StatisticsPanel />);

    await waitFor(() => expect(screen.getByText("3")).toBeInTheDocument());
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("150")).toBeInTheDocument();
    expect(screen.getByText("Chapter One")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("Chapter Two")).toBeInTheDocument();
    expect(screen.getByText("50")).toBeInTheDocument();
  });

  it("shows an empty state when there are no documents", async () => {
    mockInvoke.mockResolvedValue({ entity_count: 0, document_count: 0, total_word_count: 0, documents: [] });
    render(<StatisticsPanel />);
    await waitFor(() => expect(screen.getByText(/no documents/i)).toBeInTheDocument());
  });

  it("requests stats for the current project", async () => {
    mockInvoke.mockResolvedValue(STATS);
    render(<StatisticsPanel />);
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("get_project_stats", { projectId: "proj-1" }));
  });
});
