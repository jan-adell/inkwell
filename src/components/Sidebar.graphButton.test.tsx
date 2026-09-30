import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "./Sidebar";
import { useAppStore } from "../store/appStore";

vi.mock("../hooks/useTauri", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hooks/useTauri")>()),
  invokeListRootDocuments: vi.fn().mockResolvedValue([]),
  invokeListEntityTypes: vi.fn().mockResolvedValue([]),
  invokeListEntityFolders: vi.fn().mockResolvedValue([]),
  invokeListEntitiesByFolder: vi.fn().mockResolvedValue([]),
  invokeListRootEntities: vi.fn().mockResolvedValue([]),
}));

describe("Sidebar graph button", () => {
  beforeEach(() => {
    useAppStore.setState({ projectId: "p1", activeView: "worldbuilding" });
  });

  it("is placed directly above the Add New button in the World tab", () => {
    render(<Sidebar />);

    const graph = screen.getByRole("button", { name: /graph/i });
    const addNew = screen.getByRole("button", { name: /add new/i });

    expect(graph.compareDocumentPosition(addNew) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(graph.parentElement).toBe(addNew.parentElement);
  });

  it("opens the graph view when clicked", async () => {
    render(<Sidebar />);

    await userEvent.click(screen.getByRole("button", { name: /graph/i }));

    expect(useAppStore.getState().activeView).toBe("graph");
  });

  it("keeps Add New available while the graph is open", () => {
    useAppStore.setState({ activeView: "graph" });

    render(<Sidebar />);

    expect(screen.getByRole("button", { name: /add new/i })).toBeInTheDocument();
  });

  it("is not shown in the Write tab", () => {
    useAppStore.setState({ activeView: "writing" });

    render(<Sidebar />);

    expect(screen.queryByRole("button", { name: /graph/i })).not.toBeInTheDocument();
  });

  it("does not add a third tab next to Write and World", () => {
    render(<Sidebar />);

    const tabBar = screen.getByRole("button", { name: /^write$/i }).parentElement;

    expect(tabBar?.children).toHaveLength(2);
  });
});
