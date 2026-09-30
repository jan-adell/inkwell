import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EdgeProps } from "@xyflow/react";
import { FloatingEdge } from "./FloatingEdge";

const mockUseInternalNode = vi.fn();

vi.mock("@xyflow/react", () => ({
  useInternalNode: (id: string) => mockUseInternalNode(id),
  BaseEdge: ({ path, label, labelX, labelY, markerEnd }: Record<string, unknown>) => (
    <path
      data-testid="edge"
      d={path as string}
      data-label={label as string}
      data-label-x={labelX as number}
      data-label-y={labelY as number}
      data-marker-end={markerEnd as string}
    />
  ),
}));

const measuredNode = (x: number, y: number) => ({
  measured: { width: 100, height: 40 },
  internals: { positionAbsolute: { x, y } },
});

const renderEdge = (props: Partial<EdgeProps> = {}) =>
  render(
    <svg>
      <FloatingEdge
        {...({ id: "e1", source: "a", target: "b", label: "Daughter of", markerEnd: "url(#arrow)", ...props } as EdgeProps)}
      />
    </svg>,
  );

describe("FloatingEdge", () => {
  beforeEach(() => {
    mockUseInternalNode.mockReset();
    mockUseInternalNode.mockImplementation((id: string) => (id === "a" ? measuredNode(0, 0) : measuredNode(300, 0)));
  });

  it("connects the facing borders of the two nodes", () => {
    const { getByTestId } = renderEdge();

    expect(getByTestId("edge").getAttribute("d")).toBe("M 100 20 L 300 20");
  });

  it("puts the label at the middle of the line", () => {
    const { getByTestId } = renderEdge();

    const edge = getByTestId("edge");
    expect(edge.getAttribute("data-label")).toBe("Daughter of");
    expect(edge.getAttribute("data-label-x")).toBe("200");
    expect(edge.getAttribute("data-label-y")).toBe("20");
  });

  it("bows the line when the edge has a parallel offset", () => {
    const { getByTestId } = renderEdge({ data: { offset: 30 } });

    expect(getByTestId("edge").getAttribute("d")).toBe("M 100 20 Q 200 80 300 20");
    expect(getByTestId("edge").getAttribute("data-label-y")).toBe("50");
  });

  it("keeps the arrow marker", () => {
    const { getByTestId } = renderEdge();

    expect(getByTestId("edge").getAttribute("data-marker-end")).toBe("url(#arrow)");
  });

  it("draws nothing when an endpoint node is unknown", () => {
    mockUseInternalNode.mockImplementation((id: string) => (id === "a" ? measuredNode(0, 0) : undefined));

    const { queryByTestId } = renderEdge();

    expect(queryByTestId("edge")).toBeNull();
  });

  it("draws nothing until both nodes are measured", () => {
    mockUseInternalNode.mockImplementation((id: string) =>
      id === "a" ? measuredNode(0, 0) : { measured: {}, internals: { positionAbsolute: { x: 300, y: 0 } } },
    );

    const { queryByTestId } = renderEdge();

    expect(queryByTestId("edge")).toBeNull();
  });
});
