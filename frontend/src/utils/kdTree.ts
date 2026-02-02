/**
 * Minimal 2D k-d tree for nearest-neighbor lookup on sound points.
 * Used to find the hovered point on mouse move without scanning all points.
 */

export interface Point2D {
  x: number;
  y: number;
  id: string | number;
}

function sqDist(point: Point2D, b: { x: number; y: number }): number {
  const dx = point.x - b.x;
  const dy = point.y - b.y;
  return dx * dx + dy * dy;
}

class KDNode {
  point: Point2D;
  left: KDNode | null = null;
  right: KDNode | null = null;
  axis: number; // 0 = x, 1 = y

  constructor(point: Point2D, axis: number) {
    this.point = point;
    this.axis = axis;
  }
}

function build(points: Point2D[], axis: number = 0): KDNode | null {
  if (points.length === 0) return null;
  if (points.length === 1) return new KDNode(points[0], axis);

  const sorted = [...points].sort((a, b) => {
    const key = axis === 0 ? 'x' : 'y';
    return (a[key] as number) - (b[key] as number);
  });
  const mid = Math.floor(sorted.length / 2);
  const node = new KDNode(sorted[mid], axis);
  const leftPoints = sorted.slice(0, mid);
  const rightPoints = sorted.slice(mid + 1);
  const nextAxis = 1 - axis;
  node.left = build(leftPoints, nextAxis);
  node.right = build(rightPoints, nextAxis);
  return node;
}

function nearest(
  node: KDNode | null,
  target: { x: number; y: number },
  best: { point: Point2D | null; distSq: number }
): void {
  if (!node) return;

  const d = sqDist(node.point, target);
  if (d < best.distSq) {
    best.distSq = d;
    best.point = node.point;
  }

  const key = node.axis === 0 ? 'x' : 'y';
  const diff = target[key] - (node.point[key] as number);
  const goLeft = diff <= 0;

  if (goLeft) {
    nearest(node.left, target, best);
    if (diff * diff < best.distSq) nearest(node.right, target, best);
  } else {
    nearest(node.right, target, best);
    if (diff * diff < best.distSq) nearest(node.left, target, best);
  }
}

export class KDTree {
  private root: KDNode | null = null;

  constructor(points: Point2D[]) {
    this.root = build(points);
  }

  nearestNeighbor(x: number, y: number): Point2D | null {
    const best = { point: null as Point2D | null, distSq: Infinity };
    nearest(this.root, { x, y }, best);
    return best.point;
  }
}

/** Build k-d tree from API points (coords_2d). */
export function buildKDTreeFromPoints(
  points: Array<{ id: string | number; coords_2d: [number, number] }>
): KDTree {
  const pts: Point2D[] = points.map((p) => ({
    x: p.coords_2d[0],
    y: p.coords_2d[1],
    id: p.id,
  }));
  return new KDTree(pts);
}
