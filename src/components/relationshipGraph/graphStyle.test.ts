import { describe, it, expect } from "vitest";
import { DIMMED_OPACITY, edgeLabelProps, edgeStyle, nodeStyle } from "./graphStyle";

describe("nodeStyle", () => {
  it("outlines the node in its entity color with readable text", () => {
    const style = nodeStyle("#ff0000", { selected: false, dimmed: false });

    expect(style.border).toBe("2px solid #ff0000");
    expect(Number(style.fontSize)).toBeGreaterThanOrEqual(14);
    expect(style.opacity).toBe(1);
  });

  it("takes surface, text and selection colors from the app theme", () => {
    const style = nodeStyle("#ff0000", { selected: true, dimmed: false });

    expect(style.background).toContain("var(--color-surface)");
    expect(style.color).toBe("var(--color-text)");
    expect(style.boxShadow).toContain("var(--color-accent)");
  });

  it("fades a dimmed node", () => {
    expect(nodeStyle("#ff0000", { selected: false, dimmed: true }).opacity).toBe(DIMMED_OPACITY);
  });

  it("rings the selected node so it stands out", () => {
    const selected = nodeStyle("#ff0000", { selected: true, dimmed: false });
    const plain = nodeStyle("#ff0000", { selected: false, dimmed: false });

    expect(selected.boxShadow).toBeTruthy();
    expect(plain.boxShadow).toBeUndefined();
  });
});

describe("edgeStyle", () => {
  it("draws edges in their relation color with a visible stroke", () => {
    const style = edgeStyle("#00ff00", { focused: false, dimmed: false });

    expect(style.stroke).toBe("#00ff00");
    expect(Number(style.strokeWidth)).toBeGreaterThanOrEqual(2);
    expect(style.opacity).toBe(1);
  });

  it("thickens edges connected to the selection", () => {
    const focused = edgeStyle("#00ff00", { focused: true, dimmed: false });
    const plain = edgeStyle("#00ff00", { focused: false, dimmed: false });

    expect(Number(focused.strokeWidth)).toBeGreaterThan(Number(plain.strokeWidth));
  });

  it("fades a dimmed edge", () => {
    expect(edgeStyle("#00ff00", { focused: false, dimmed: true }).opacity).toBe(DIMMED_OPACITY);
  });
});

describe("edgeLabelProps", () => {
  it("backs the label with a plate so text stays legible over lines", () => {
    const props = edgeLabelProps({ dimmed: false });

    expect(props.labelBgStyle.fillOpacity).toBeGreaterThan(0.8);
    expect(props.labelBgPadding).toEqual([6, 4]);
    expect(Number(props.labelStyle.fontSize)).toBeGreaterThanOrEqual(12);
  });

  it("takes label colors from the app theme", () => {
    const props = edgeLabelProps({ dimmed: false });

    expect(props.labelStyle.fill).toBe("var(--color-text)");
    expect(props.labelBgStyle.fill).toBe("var(--color-surface)");
  });

  it("fades the label together with a dimmed edge", () => {
    const props = edgeLabelProps({ dimmed: true });

    expect(props.labelStyle.opacity).toBe(DIMMED_OPACITY);
    expect(props.labelBgStyle.opacity).toBe(DIMMED_OPACITY);
  });
});
