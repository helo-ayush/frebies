import type { Box } from "./matrix";

/**
 * When a text grows, what stands below it makes room, the way lines of a
 * document move down. Wide gaps are used up first; a drawing moves as a whole.
 */

export type RoomItem = {
  key: string;
  box: Box;
  /** Moves together with the others of the same name. */ rigid: string | null;
};

/** The most empty space that is kept between two things that were further apart. */
const KEEP = 14;

/**
 * How far everything has to move. `before` and `now`: the lower edge of what
 * grew. Nothing that starts below `foot` (page numbers and the like) moves.
 */
export function planRoom(
  grown: { x: number; w: number; before: number; now: number },
  items: readonly RoomItem[],
  foot: number,
): Map<string, number> {
  const out = new Map<string, number>();
  if (grown.now <= grown.before + 0.05) return out;

  type Cluster = { keys: string[]; x0: number; x1: number; top: number; bottom: number };
  const clusters: Cluster[] = [];
  const named = new Map<string, Cluster>();
  for (const { key, box, rigid } of items) {
    const found = rigid ? named.get(rigid) : undefined;
    if (found) {
      found.keys.push(key);
      found.x0 = Math.min(found.x0, box.x);
      found.x1 = Math.max(found.x1, box.x + box.w);
      found.top = Math.min(found.top, box.y);
      found.bottom = Math.max(found.bottom, box.y + box.h);
      continue;
    }
    const cluster = { keys: [key], x0: box.x, x1: box.x + box.w, top: box.y, bottom: box.y + box.h };
    clusters.push(cluster);
    if (rigid) named.set(rigid, cluster);
  }
  clusters.sort((a, b) => a.top - b.top || a.x0 - b.x0);

  const edges = [{ x0: grown.x, x1: grown.x + grown.w, before: grown.before, now: grown.now }];
  for (const cluster of clusters) {
    if (cluster.top < grown.before - 2.5 || cluster.top >= foot) continue;
    let top = cluster.top;
    for (const edge of edges) {
      if (Math.min(edge.x1, cluster.x1) - Math.max(edge.x0, cluster.x0) < 1) continue;
      if (edge.before > cluster.top + 3) continue;
      const gap = Math.max(0, cluster.top - edge.before);
      top = Math.max(top, edge.now + Math.min(gap, KEEP));
    }
    const by = top - cluster.top;
    edges.push({ x0: cluster.x0, x1: cluster.x1, before: cluster.bottom, now: cluster.bottom + by });
    if (by > 0.05) for (const key of cluster.keys) out.set(key, by);
  }
  return out;
}
