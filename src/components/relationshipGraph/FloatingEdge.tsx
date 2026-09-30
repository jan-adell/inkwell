import { BaseEdge, useInternalNode, type EdgeProps, type InternalNode } from "@xyflow/react";
import { edgePath, floatingEndpoints, type Rect } from "./edgeGeometry";

const toRect = (node: InternalNode): Rect | null => {
  const { width, height } = node.measured;
  if (!width || !height) return null;
  return { x: node.internals.positionAbsolute.x, y: node.internals.positionAbsolute.y, width, height };
};

export function FloatingEdge({ id, source, target, data, ...rest }: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const sourceRect = sourceNode && toRect(sourceNode);
  const targetRect = targetNode && toRect(targetNode);
  if (!sourceRect || !targetRect) return null;

  const { start, end } = floatingEndpoints(sourceRect, targetRect);
  const { path, labelX, labelY } = edgePath(start, end, Number(data?.offset ?? 0));

  return (
    <BaseEdge
      id={id}
      path={path}
      labelX={labelX}
      labelY={labelY}
      label={rest.label}
      labelStyle={rest.labelStyle}
      labelShowBg={rest.labelShowBg}
      labelBgStyle={rest.labelBgStyle}
      labelBgPadding={rest.labelBgPadding}
      labelBgBorderRadius={rest.labelBgBorderRadius}
      markerEnd={rest.markerEnd}
      style={rest.style}
    />
  );
}
