import { BaseEdge, useInternalNode, useNodes, type EdgeProps, type InternalNode, type Node } from "@xyflow/react";
import { avoidObstacles, edgePath, floatingEndpoints, type Rect } from "./edgeGeometry";

const toRect = (node: InternalNode): Rect | null => {
  const { width, height } = node.measured;
  if (!width || !height) return null;
  return { x: node.internals.positionAbsolute.x, y: node.internals.positionAbsolute.y, width, height };
};

const obstacleRect = (node: Node): Rect | null => {
  const { width, height } = node.measured ?? {};
  if (!width || !height) return null;
  return { x: node.position.x, y: node.position.y, width, height };
};

export function FloatingEdge({ id, source, target, data, ...rest }: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const nodes = useNodes();
  const sourceRect = sourceNode && toRect(sourceNode);
  const targetRect = targetNode && toRect(targetNode);
  if (!sourceRect || !targetRect) return null;

  const { start, end } = floatingEndpoints(sourceRect, targetRect);
  const obstacles = nodes
    .filter((node) => node.id !== source && node.id !== target)
    .map(obstacleRect)
    .filter((rect): rect is Rect => rect !== null);
  const offset = avoidObstacles(start, end, Number(data?.offset ?? 0), obstacles);
  const { path, labelX, labelY } = edgePath(start, end, offset);

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
