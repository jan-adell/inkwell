import type { CSSProperties } from "react";

export const DIMMED_OPACITY = 0.2;

const TEXT_COLOR = "var(--color-text)";
const SURFACE_COLOR = "var(--color-surface)";
const SELECTION_COLOR = "var(--color-accent)";

interface NodeState {
  selected: boolean;
  dimmed: boolean;
}

interface EdgeState {
  focused: boolean;
  dimmed: boolean;
}

export function nodeStyle(color: string, { selected, dimmed }: NodeState): CSSProperties {
  return {
    border: `2px solid ${color}`,
    background: `color-mix(in srgb, ${color} 18%, ${SURFACE_COLOR})`,
    color: TEXT_COLOR,
    padding: "10px 16px",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    minWidth: 96,
    opacity: dimmed ? DIMMED_OPACITY : 1,
    ...(selected && { boxShadow: `0 0 0 3px ${SELECTION_COLOR}` }),
  };
}

export function edgeStyle(color: string, { focused, dimmed }: EdgeState): CSSProperties {
  return {
    stroke: color,
    strokeWidth: focused ? 3.5 : 2,
    opacity: dimmed ? DIMMED_OPACITY : 1,
  };
}

export function edgeLabelProps({ dimmed }: { dimmed: boolean }) {
  const opacity = dimmed ? DIMMED_OPACITY : 1;
  return {
    labelStyle: { fill: TEXT_COLOR, fontSize: 13, fontWeight: 500, opacity },
    labelBgStyle: { fill: SURFACE_COLOR, fillOpacity: 0.92, opacity },
    labelBgPadding: [6, 4] as [number, number],
    labelBgBorderRadius: 4,
  };
}
