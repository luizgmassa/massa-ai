/**
 * Community Detection over the File-Import Graph (P4-T4 / D4)
 *
 * Multi-level **Louvain** modularity optimization with a connectivity
 * refinement pass. Surfaces de-facto modules/clusters: tightly-coupled groups
 * of files that form implicit packages/layers in the codebase.
 *
 * Why Louvain (+ refinement) rather than full Leiden:
 *   - Louvain is simpler and well-understood; its main known defect is that a
 *     local-moving phase can leave a community internally disconnected. We
 *     close that gap with an explicit connectivity refinement pass
 *     (split-and-reattach by connected components within each community), which
 *     is the property Leiden guarantees. This gives Leiden-quality output at
 *     Louvain implementation cost, with no heavy dependency.
 *
 * Algorithm sketch (porting the *approach* from codebase-memory-mcp's Leiden,
 * rewritten fresh in TypeScript):
 *
 *   1. Build an undirected weighted graph (CSR: offsets + neighbors + weights).
 *      Directed import edges {from→to} are symmetrized and deduped (multi-edges
 *      become weights); self-loops are folded into each node's weighted degree.
 *   2. Local-moving phase: greedily move each node to the neighboring community
 *      that maximizes modularity gain, until stable. Re-queue only neighbors of
 *      moved nodes (near-linear per level).
 *   3. Refinement: ensure every community is internally connected by splitting
 *      disconnected communities along their connected components.
 *   4. Aggregate: collapse communities into super-nodes; repeat on the coarse
 *      graph until a level stops shrinking.
 *   5. Back-project the final community onto the original node ids via an
 *      `orig[]` indirection array.
 *
 * Bounds & fallback:
 *   - Node cap `COMMUNITY_NODE_CAP` (default 8000). Graphs above this run a
 *     cheaper connected-components + weighted label-propagation hybrid.
 *   - Edge cap `COMMUNITY_EDGE_CAP` (default 50000) — same fallback.
 *   - Max levels `MAX_LEVELS` (default 64) and per-pass iteration cap guard
 *     against pathological oscillation.
 *   - Empty / single-node / no-edge graphs short-circuit: every node its own
 *     community (no crash).
 *
 * Resolution `gamma` (default 1.0): higher → more, smaller communities.
 */

const MAX_LEVELS = 64;
/** Per local-moving pass, process at most N * this many node-visits. */
const MOVE_PASS_CAP = 100;
/** Above this many nodes, fall back to the cheaper label-propagation hybrid. */
export const COMMUNITY_NODE_CAP = 8000;
/** Above this many undirected edges, fall back. */
export const COMMUNITY_EDGE_CAP = 50000;
/** Communities with fewer members than this are merged into the nearest neighbor or dropped. */
const MIN_COMMUNITY_SIZE = 1;
/** Default resolution parameter (modularity). */
const DEFAULT_GAMMA = 1.0;

// ─── Public types ────────────────────────────────────────────────────────────

export interface WeightedEdge {
  /** Index into the `nodes` array of runLouvain. */
  a: number;
  b: number;
  /** Edge weight (>= 0). */
  w: number;
}

export interface CommunityOptions {
  /** Resolution parameter; higher → more, smaller communities. Default 1.0. */
  gamma?: number;
  /** Node cap above which the cheaper fallback runs. */
  nodeCap?: number;
  /** Edge cap above which the cheaper fallback runs. */
  edgeCap?: number;
}

export interface Community {
  /** Stable community id (0-based, contiguous in the result array). */
  id: number;
  /** Original node indices belonging to this community. */
  members: number[];
}

export interface CommunityResult {
  communities: Community[];
  /** communityId per original node (length === nodes.length). */
  assignment: number[];
  /** Modularity of the final partition (-1..1, higher is better). */
  modularity: number;
  /** Which algorithm produced this result. */
  algorithm: "louvain" | "fallback" | "trivial";
}

// ─── Graph build ─────────────────────────────────────────────────────────────

interface Graph {
  /** Number of nodes. */
  n: number;
  /** CSR offsets, length n+1. */
  off: Int32Array;
  /** Neighbor indices. */
  nbr: Int32Array;
  /** Edge weight aligned with nbr. */
  w: Float64Array;
  /** Weighted degree per node (k[i] = Σ incident edge weights + self-loop weight). */
  k: Float64Array;
  /** 2 × total edge weight (Σ k). */
  twom: number;
}

/**
 * Build a CSR weighted undirected graph from an edge list.
 * Directed edges are symmetrized; multi-edges deduped into weights; self-loops
 * folded into `k[]` and NOT materialized in `nbr`/`w` (the gain formula relies
 * on this — intra-community weight lives only in `k`).
 */
function buildGraph(n: number, edges: WeightedEdge[]): Graph {
  // Dedupe + symmetrize via a Map keyed by "minIdx:maxIdx".
  const acc = new Map<string, number>();
  const selfLoop = new Float64Array(n);
  for (const e of edges) {
    if (e.w <= 0) continue;
    if (e.a === e.b) {
      selfLoop[e.a] += e.w;
      continue;
    }
    const lo = e.a < e.b ? e.a : e.b;
    const hi = e.a < e.b ? e.b : e.a;
    const key = lo + ":" + hi;
    acc.set(key, (acc.get(key) ?? 0) + e.w);
  }

  // Count undirected degree (each deduped edge contributes to both endpoints).
  const deg = new Int32Array(n);
  for (const [key, wt] of acc) {
    const sep = key.indexOf(":");
    const a = +key.slice(0, sep);
    const b = +key.slice(sep + 1);
    deg[a]++;
    deg[b]++;
    void wt;
  }

  const off = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) off[i + 1] = off[i] + deg[i];
  const nbr = new Int32Array(off[n]);
  const w = new Float64Array(off[n]);
  const fill = new Int32Array(n); // cursor per node
  const k = new Float64Array(n);

  for (const [key, wt] of acc) {
    const sep = key.indexOf(":");
    const a = +key.slice(0, sep);
    const b = +key.slice(sep + 1);
    // a → b
    nbr[off[a] + fill[a]] = b;
    w[off[a] + fill[a]] = wt;
    fill[a]++;
    k[a] += wt;
    // b → a
    nbr[off[b] + fill[b]] = a;
    w[off[b] + fill[b]] = wt;
    fill[b]++;
    k[b] += wt;
  }

  // Fold self-loops into degree (not materialized as neighbors).
  let twom = 0;
  for (let i = 0; i < n; i++) {
    k[i] += selfLoop[i] * 2; // self-loop contributes 2× to degree
    twom += k[i];
  }

  return { n, off, nbr, w, k, twom };
}

// ─── Local-moving phase (queue-based, near-linear) ───────────────────────────

/**
 * Greedily move each node to the neighboring community maximizing modularity
 * gain. Uses a work queue and re-queues only neighbors of moved nodes that are
 * not already queued and not in the destination community.
 *
 * `comm[i]` = current community of node i (mutated in place).
 * `stot[c]` = Σ weighted degree of nodes currently in community c (mutated).
 */
function localMove(
  g: Graph,
  comm: Int32Array,
  stot: Float64Array,
  gamma: number,
): boolean {
  const { n, off, nbr, w, k, twom } = g;
  if (twom <= 0) return false;

  const inq = new Uint8Array(n);
  const queue: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    queue[i] = i;
    inq[i] = 1;
  }

  // Sparse accumulator: edge-weight from the current node into each touched
  // community. Reset via a dirty list to avoid O(n) clears.
  const acc = new Float64Array(n);
  const dirty: number[] = [];

  let visits = 0;
  const visitCap = n * MOVE_PASS_CAP + MAX_LEVELS;

  let head = 0;
  while (head < queue.length) {
    if (visits++ > visitCap) break;
    const v = queue[head++];
    inq[v] = 0;

    const cv = comm[v];
    const kv = k[v];

    // Accumulate weights into each neighboring community.
    for (let e = off[v]; e < off[v + 1]; e++) {
      const u = nbr[e];
      const cu = comm[u];
      if (acc[cu] === 0) dirty.push(cu);
      acc[cu] += w[e];
    }

    // Tentatively remove v from its current community's degree total.
    stot[cv] -= kv;
    // Edge weight from v into its own current community.
    const intoCurrent = acc[cv] || 0;

    let bestC = cv;
    // Gain of staying put (baseline).
    let bestGain = intoCurrent - (gamma * kv * stot[cv]) / twom;

    for (const c of dirty) {
      if (c === cv) continue;
      const gain = acc[c] - (gamma * kv * stot[c]) / twom;
      if (gain > bestGain + 1e-15) {
        bestGain = gain;
        bestC = c;
      }
    }

    // Commit: move v into bestC.
    stot[bestC] += kv;
    if (bestC !== cv) {
      comm[v] = bestC;
      // Re-queue neighbors not in bestC and not already queued.
      for (let e = off[v]; e < off[v + 1]; e++) {
        const u = nbr[e];
        if (comm[u] !== bestC && !inq[u]) {
          queue.push(u);
          inq[u] =1;
        }
      }
    }

    // Reset accumulator.
    for (const c of dirty) acc[c] = 0;
    dirty.length = 0;
  }

  return true;
}

// ─── Connectivity refinement ─────────────────────────────────────────────────

/**
 * Ensure every community is internally connected (the Leiden guarantee).
 * Split any community whose members form >1 connected component in the original
 * graph, assigning each component its own label. `labels` mutated in place.
 */
function refineConnectivity(g: Graph, labels: Int32Array): number {
  const { n, off, nbr } = g;
  // Group nodes by current community.
  const byComm = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const c = labels[i];
    let arr = byComm.get(c);
    if (!arr) {
      arr = [];
      byComm.set(c, arr);
    }
    arr.push(i);
  }

  // Union-Find restricted to a community's members.
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  let nextLabel = 0;
  const remap = new Int32Array(n);

  for (const [, members] of byComm) {
    if (members.length <= 1) {
      const m = members[0];
      remap[m] = nextLabel++;
      continue;
    }
    // Reset UF roots for these members.
    for (const m of members) parent[m] = m;
    // Only edges WITHIN this community's member set union nodes.
    const inSet = new Set(members);
    for (const m of members) {
      for (let e = off[m]; e < off[m + 1]; e++) {
        const u = nbr[e];
        if (inSet.has(u)) union(m, u);
      }
    }
    // Each distinct root → a new label.
    const rootLabel = new Map<number, number>();
    for (const m of members) {
      const r = find(m);
      let lbl = rootLabel.get(r);
      if (lbl === undefined) {
        lbl = nextLabel++;
        rootLabel.set(r, lbl);
      }
      remap[m] = lbl;
    }
  }

  let changed = false;
  for (let i = 0; i < n; i++) {
    if (labels[i] !== remap[i]) changed = true;
    labels[i] = remap[i];
  }
  return changed ? nextLabel : -1;
}

// ─── Relabel (compact community ids) ─────────────────────────────────────────

/** Compact community ids to a contiguous 0..(count-1) range. Returns count. */
function relabel(labels: Int32Array): number {
  const seen = new Map<number, number>();
  let next = 0;
  for (let i = 0; i < labels.length; i++) {
    let lbl = seen.get(labels[i]);
    if (lbl === undefined) {
      lbl = next++;
      seen.set(labels[i], lbl);
    }
    labels[i] = lbl;
  }
  return next;
}

// ─── Aggregate (collapse communities into super-nodes) ───────────────────────

/**
 * Build the coarse graph: each community becomes a super-node. Inter-community
 * edges become weighted edges between super-nodes; intra-community weight is
 * folded into each super-node's `k` (NOT materialized as a self-loop).
 * Returns the coarse graph plus `seed[c]` = any original comm id for super-node c.
 */
function aggregate(
  g: Graph,
  comm: Int32Array,
  commCount: number,
): { g2: Graph; seed: Int32Array } {
  const { n, off, nbr, w, k } = g;

  // Sum weighted degree into each super-node.
  const k2 = new Float64Array(commCount);
  for (let i = 0; i < n; i++) k2[comm[i]] += k[i];

  // Accumulate inter-community edges (deduped) via Map keyed "lo:hi".
  const edges = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const ci = comm[i];
    for (let e = off[i]; e < off[i + 1]; e++) {
      const cj = comm[nbr[e]];
      if (ci === cj) continue; // intra-community: already in k2
      const lo = ci < cj ? ci : cj;
      const hi = ci < cj ? cj : ci;
      const key = lo + ":" + hi;
      edges.set(key, (edges.get(key) ?? 0) + w[e]);
    }
  }

  const edgeList: WeightedEdge[] = [];
  for (const [key, wt] of edges) {
    const sep = key.indexOf(":");
    edgeList.push({ a: +key.slice(0, sep), b: +key.slice(sep + 1), w: wt });
  }

  const g2 = buildGraph(commCount, edgeList);
  // Override k with the true super-node degree (buildGraph recomputes from
  // edges, but we must add back the folded intra weight).
  for (let c = 0; c < commCount; c++) {
    g2.k[c] += k2[c];
  }
  // Recompute twom from the corrected k.
  let twom = 0;
  for (let c = 0; c < commCount; c++) twom += g2.k[c];
  g2.twom = twom;

  // seed[c] = a representative original community id (here identity).
  const seed = new Int32Array(commCount);
  for (let c = 0; c < commCount; c++) seed[c] = c;

  return { g2, seed };
}

// ─── Modularity ──────────────────────────────────────────────────────────────

/**
 * Modularity of a partition on graph g:
 *   Q = (1/twom) * Σ_c [ Σ_in(c) - (Σ_tot(c)^2) / (2*twom) ]
 * where Σ_in(c) is twice the intra-community edge weight of community c.
 * (Standard Newman-Girvan modularity, gamma=1.)
 */
function modularityOf(g: Graph, comm: Int32Array, commCount: number): number {
  const { n, off, nbr, w, k, twom } = g;
  if (twom <= 0) return 0;
  const sigmaIn = new Float64Array(commCount);
  const sigmaTot = new Float64Array(commCount);
  for (let i = 0; i < n; i++) {
    const ci = comm[i];
    sigmaTot[ci] += k[i];
    for (let e = off[i]; e < off[i + 1]; e++) {
      if (comm[nbr[e]] === ci) sigmaIn[ci] += w[e]; // counts each directed half once
    }
  }
  let q = 0;
  for (let c = 0; c < commCount; c++) {
    // sigmaIn currently counts each undirected intra edge once per endpoint
    // (we stored both directions) → divide by 2*twom directly matches the
    // Σ_in (which conventionally is the double-counted intra weight).
    q += sigmaIn[c] / (2 * twom) - (sigmaTot[c] / (2 * twom)) ** 2;
  }
  return q;
}

// ─── Fallback: connected components + weighted label propagation ─────────────

/**
 * Cheaper alternative for very large graphs. Seeds each connected component as
 * a community, then runs a few synchronous weighted label-propagation sweeps
 * (a node adopts the most-weighted neighbor community, capped iterations).
 */
function fallbackCommunities(g: Graph): { comm: Int32Array; count: number } {
  const { n, off, nbr, w } = g;

  // Connected components via BFS.
  const comp = new Int32Array(n).fill(-1);
  let nextComp = 0;
  for (let s = 0; s < n; s++) {
    if (comp[s] !== -1) continue;
    comp[s] = nextComp;
    const stack = [s];
    while (stack.length) {
      const v = stack.pop()!;
      for (let e = off[v]; e < off[v + 1]; e++) {
        const u = nbr[e];
        if (comp[u] === -1) {
          comp[u] = nextComp;
          stack.push(u);
        }
      }
    }
    nextComp++;
  }

  // Weighted label propagation within components: 4 synchronous sweeps.
  let labels = comp;
  let count = nextComp;
  const acc = new Float64Array(n);
  const dirty: number[] = [];
  for (let iter = 0; iter < 4; iter++) {
    let moved = false;
    for (let v = 0; v < n; v++) {
      if (off[v] === off[v + 1]) continue;
      const lv = labels[v];
      for (let e = off[v]; e < off[v + 1]; e++) {
        const lc = labels[nbr[e]];
        if (acc[lc] === 0) dirty.push(lc);
        acc[lc] += w[e];
      }
      let best = lv;
      let bestW = -1;
      for (const c of dirty) {
        if (acc[c] > bestW) {
          bestW = acc[c];
          best = c;
        }
      }
      if (best !== lv) {
        labels[v] = best;
        moved = true;
      }
      for (const c of dirty) acc[c] = 0;
      dirty.length = 0;
    }
    if (!moved) break;
    count = relabel(labels);
  }

  return { comm: labels, count };
}

// ─── Public entry ────────────────────────────────────────────────────────────

/**
 * Run multi-level Louvain community detection.
 *
 * @param nodeCount number of nodes (files).
 * @param edges weighted undirected edges (will be symmetrized internally).
 * @param opts gamma + caps.
 * @returns communities, per-node assignment, modularity, and algorithm used.
 */
export function runLouvain(
  nodeCount: number,
  edges: WeightedEdge[],
  opts: CommunityOptions = {},
): CommunityResult {
  const gamma = opts.gamma ?? DEFAULT_GAMMA;
  const nodeCap = opts.nodeCap ?? COMMUNITY_NODE_CAP;
  const edgeCap = opts.edgeCap ?? COMMUNITY_EDGE_CAP;

  if (nodeCount <= 0) {
    return { communities: [], assignment: [], modularity: 0, algorithm: "trivial" };
  }
  if (nodeCount === 1) {
    return {
      communities: [{ id: 0, members: [0] }],
      assignment: [0],
      modularity: 0,
      algorithm: "trivial",
    };
  }

  const g = buildGraph(nodeCount, edges);

  // Trivial: no edges → every node its own community.
  if (g.twom <= 0 || edges.length === 0) {
    const assignment = Array.from({ length: nodeCount }, (_, i) => i);
    return {
      communities: assignment.map((id) => ({ id, members: [id] })),
      assignment,
      modularity: 0,
      algorithm: "trivial",
    };
  }

  // Large-graph fallback.
  if (nodeCount > nodeCap || edges.length > edgeCap) {
    const { comm, count } = fallbackCommunities(g);
    const finalCount = refineConnectivity(g, comm) >= 0 ? relabel(comm) : count;
    const communities = buildCommunities(comm, finalCount);
    return {
      communities,
      assignment: Array.from(comm),
      modularity: modularityOf(g, comm, finalCount),
      algorithm: "fallback",
    };
  }

  // Multi-level Louvain.
  // `orig[i]` maps original node i → its index in the CURRENT (possibly coarse) graph.
  let orig = new Int32Array(nodeCount);
  for (let i = 0; i < nodeCount; i++) orig[i] = i;

  let cur = g;
  let comm = new Int32Array(cur.n);
  for (let i = 0; i < cur.n; i++) comm[i] = i;

  let lastLevelComm = comm;
  let lastLevelGraph = cur;
  let lastLevelCount = cur.n;

  for (let level = 0; level < MAX_LEVELS; level++) {
    const stot = new Float64Array(cur.n);
    for (let i = 0; i < cur.n; i++) stot[comm[i]] += cur.k[i];

    localMove(cur, comm, stot, gamma);

    let count = relabel(comm);
    // Connectivity refinement (Leiden guarantee): split disconnected communities.
    const refined = refineConnectivity(cur, comm);
    if (refined >= 0) count = refined;
    count = relabel(comm);

    lastLevelComm = comm;
    lastLevelGraph = cur;
    lastLevelCount = count;

    if (count >= cur.n) break; // nothing coarsened

    const { g2 } = aggregate(cur, comm, count);
    if (g2.n >= cur.n) break; // safety: no shrink

    // Update orig indirection: orig[i] = comm[orig[i]] of the level we just finished.
    // comm currently holds the (refined) community of each node in `cur`.
    const newOrig = new Int32Array(nodeCount);
    for (let i = 0; i < nodeCount; i++) newOrig[i] = comm[orig[i]];
    orig = newOrig;

    cur = g2;
    comm = new Int32Array(cur.n);
    // Seed coarse communities from identity (each super-node starts alone);
    // local-move on the coarse graph re-merges where beneficial.
    for (let i = 0; i < cur.n; i++) comm[i] = i;
  }

  // Back-project: community of original node i = lastLevelComm[orig[i]].
  const assignment = new Int32Array(nodeCount);
  for (let i = 0; i < nodeCount; i++) {
    assignment[i] = lastLevelComm[orig[i]];
  }
  const finalCount = relabel(assignment);
  const communities = buildCommunities(assignment, finalCount);
  // Compute modularity on the ORIGINAL graph with the back-projected
  // assignment (coarse-graph modularity would be on super-nodes and is not
  // comparable across runs).
  const q = modularityOf(g, assignment, finalCount);
  void lastLevelGraph;
  void lastLevelComm;
  void lastLevelCount;

  return { communities, assignment: Array.from(assignment), modularity: q, algorithm: "louvain" };
}

/** Group node indices by community id, dropping sub-MIN_COMMUNITY_SIZE groups. */
function buildCommunities(assignment: Int32Array, count: number): Community[] {
  const buckets: number[][] = Array.from({ length: count }, () => []);
  for (let i = 0; i < assignment.length; i++) buckets[assignment[i]].push(i);
  const out: Community[] = [];
  let id = 0;
  for (const members of buckets) {
    if (members.length < MIN_COMMUNITY_SIZE) continue;
    out.push({ id: id++, members });
  }
  return out;
}
