// FORGE — weapon build optimizer.
//
// Finds the Pareto-optimal set of builds for a weapon on THREE objectives:
//   maximize ergonomics, minimize recoil, minimize price.
// A build is "Pareto-optimal" if no other build beats it on all three at once —
// these are the genuine best trade-offs. Because ergo and recoil trade against
// each other at every price point, the frontier holds many builds (not a thin
// line), just like db4tarkov's FORGE.
//
// The slot tree is astronomically large, so we never brute-force whole builds.
// Each slot yields a small Pareto set; slots combine via pruned Minkowski sums.
// Objectives are additive (ergo adds, recoil modifiers sum, prices add), so the
// optimum of the whole is reachable by combining optima of the parts. The 3D
// prune is O(n log n) via a Fenwick tree, so even big merges stay cheap.

export interface ForgeMod {
  n: string; sn: string; ic: string; img?: string;
  c?: string[];          // compact category names for client-side filters
  e: number;            // ergonomics (flat, additive)
  r: number;            // recoilModifier (fraction, e.g. -0.015)
  a: number;            // accuracyModifier (flat, additive)
  cap: number | null;   // magazine capacity
  p: number;            // cheapest price (RUB)
  s: ForgeSlot[];       // child slots
}
export interface ForgeSlot { n: string; req: boolean; items: string[]; }
export interface ForgeWeapon {
  id: string; n: string; sn: string; ic: string; img?: string;
  cal: string | null; e0: number; rv: number; rh: number; fr: number;
  s: ForgeSlot[];
}
export interface ForgeData { mode: string; weapons: ForgeWeapon[]; mods: Record<string, ForgeMod>; }

// A point in objective space + the mod ids that produced it.
interface Pt { e: number; r: number; a: number; p: number; ids: string[]; }

export interface Build {
  ids: string[];
  ergo: number;        // final ergonomics
  recoilV: number;     // final vertical recoil
  recoilH: number;     // final horizontal recoil
  accuracy: number;    // summed accuracy modifier (MOA delta)
  price: number;       // total RUB
  quality: number;     // recoil reduction %, 0..100 (for the chart Y axis)
}

export interface ForgeResult {
  builds: Build[];     // Pareto-optimal builds, sorted by price asc
  combos: number;      // size of the full search space (combinations explored)
}

export interface CandidateOptions {
  limit?: number;
  perModLimit?: number;
  perSlotLimit?: number;
  accumulatorLimit?: number;
  maxPairs?: number;
}

// Cap on per-set size. After a 3D prune sets are usually small, but a few weapons
// can produce large frontiers; bounding each set keeps Minkowski combines cheap.
// We sample evenly across price to preserve the frontier's shape.
const MAX_SET = 400;
const DEFAULT_CANDIDATE_LIMIT = 350_000;

// 3-objective Pareto prune: keep points where no other point has ergo >=,
// recoil <=, and price <=. Sort by price asc; sweep maintaining, per ergo level,
// the best (lowest) recoil seen so far among cheaper points, via a Fenwick tree
// over ergo ranks. A point is dominated iff some cheaper point with ergo >= its
// own already has recoil <= its own. O(n log n).
function prune(pts: Pt[]): Pt[] {
  const n = pts.length;
  if (n <= 1) return pts;
  pts.sort((x, y) => x.p - y.p || y.e - x.e || x.r - y.r);

  // Rank ergo values descending (highest ergo = rank 1) so "ergo >= e" is a prefix.
  const ergos = Array.from(new Set(pts.map((p) => p.e))).sort((a, b) => b - a);
  const rankOf = new Map<number, number>();
  ergos.forEach((e, i) => rankOf.set(e, i + 1));
  const R = ergos.length;
  const fen = new Float64Array(R + 1).fill(Infinity); // prefix-min of recoil

  const prefixMin = (i: number): number => {
    let m = Infinity;
    for (; i > 0; i -= i & -i) if (fen[i] < m) m = fen[i];
    return m;
  };
  const update = (i: number, v: number): void => {
    for (; i <= R; i += i & -i) if (v < fen[i]) fen[i] = v;
  };

  const kept: Pt[] = [];
  for (const c of pts) {
    const rk = rankOf.get(c.e)!;
    // min recoil among already-inserted (cheaper) points with ergo >= c.e
    if (prefixMin(rk) <= c.r + 1e-12) continue; // dominated
    kept.push(c);
    update(rk, c.r);
  }

  if (kept.length > MAX_SET) {
    kept.sort((a, b) => a.p - b.p);
    const step = (kept.length - 1) / (MAX_SET - 1);
    const sampled: Pt[] = [];
    for (let i = 0; i < MAX_SET; i++) sampled.push(kept[Math.round(i * step)]);
    return sampled;
  }
  return kept;
}

// Minkowski sum of two Pareto sets, then prune.
function combine(A: Pt[], B: Pt[]): Pt[] {
  if (!A.length) return B;
  if (!B.length) return A;
  const merged: Pt[] = [];
  for (const a of A) for (const b of B) {
    merged.push({ e: a.e + b.e, r: a.r + b.r, a: a.a + b.a, p: a.p + b.p, ids: a.ids.concat(b.ids) });
  }
  return prune(merged);
}

function buildFromPoint(weapon: ForgeWeapon, pt: Pt): Build {
  const factor = Math.max(1 + pt.r, 0.15);
  const recoilV = Math.round(weapon.rv * factor);
  return {
    ids: pt.ids,
    ergo: Math.round((weapon.e0 + pt.e) * 10) / 10,
    recoilV,
    recoilH: Math.round(weapon.rh * factor),
    accuracy: pt.a,
    price: pt.p,
    quality: weapon.rv > 0 ? Math.round((1 - recoilV / weapon.rv) * 1000) / 10 : 0,
  };
}

function candidateScore(pt: Pt): number {
  // A broad "looks good" score for keeping many viable complete builds without
  // requiring full enumeration. Price is intentionally soft so expensive high
  // performance builds survive alongside budget builds.
  return pt.r * 900 + pt.p / 18000 - pt.e * 0.9 + Math.abs(pt.a) * 2 + pt.ids.length * 0.05;
}

function trimCandidates(pts: Pt[], limit: number): Pt[] {
  const seen = new Set<string>();
  const unique: Pt[] = [];
  for (const pt of pts) {
    const key = pt.ids.join('|');
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(pt);
    }
  }
  if (unique.length <= limit) return unique;
  unique.sort((a, b) => candidateScore(a) - candidateScore(b) || a.p - b.p);

  const picked: Pt[] = [];
  const pickedKeys = new Set<string>();
  const add = (pt: Pt | undefined) => {
    if (!pt || picked.length >= limit) return;
    const key = pt.ids.join('|');
    if (pickedKeys.has(key)) return;
    pickedKeys.add(key);
    picked.push(pt);
  };
  const addMany = (list: Pt[], count: number) => {
    for (const pt of list) {
      add(pt);
      if (picked.length >= limit || --count <= 0) break;
    }
  };
  const sampleMany = (list: Pt[], count: number) => {
    if (!list.length || count <= 0) return;
    const step = (list.length - 1) / Math.max(count - 1, 1);
    for (let i = 0; i < count; i++) add(list[Math.round(i * step)]);
  };

  addMany(unique, Math.ceil(limit * 0.35));
  addMany([...unique].sort((a, b) => a.p - b.p || candidateScore(a) - candidateScore(b)), Math.ceil(limit * 0.18));
  addMany([...unique].sort((a, b) => b.e - a.e || candidateScore(a) - candidateScore(b)), Math.ceil(limit * 0.14));
  sampleMany([...unique].sort((a, b) => a.p - b.p), Math.ceil(limit * 0.18));

  const buckets = new Map<string, Pt[]>();
  for (const pt of unique) {
    const key = `${Math.round(pt.r * 100 / 2)}|${Math.round(pt.e / 4)}|${Math.round(pt.p / 10000)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(pt);
    else buckets.set(key, [pt]);
  }
  for (const bucket of buckets.values()) add(bucket[0]);
  addMany(unique, limit);
  return picked;
}

function combineCandidates(A: Pt[], B: Pt[], limit: number): Pt[] {
  return combineCandidatesWithCap(A, B, limit, Math.min(Math.max(limit * 18, limit), 900_000));
}

function combineCandidatesWithCap(A: Pt[], B: Pt[], limit: number, maxPairs: number): Pt[] {
  if (!A.length) return trimCandidates(B, limit);
  if (!B.length) return trimCandidates(A, limit);
  let left = A;
  let right = B;
  if (left.length * right.length > maxPairs) {
    if (left.length > right.length) {
      left = trimCandidates(left, Math.max(1, Math.ceil(maxPairs / right.length)));
    }
    if (left.length * right.length > maxPairs) {
      right = trimCandidates(right, Math.max(1, Math.ceil(maxPairs / left.length)));
    }
  }
  const merged: Pt[] = [];
  for (const a of left) for (const b of right) {
    merged.push({ e: a.e + b.e, r: a.r + b.r, a: a.a + b.a, p: a.p + b.p, ids: a.ids.concat(b.ids) });
  }
  return trimCandidates(merged, limit);
}

// Pareto set of a single mod *including its whole subtree*. Memoized — a mod's
// subtree is identical wherever it appears.
function modSet(id: string, mods: Record<string, ForgeMod>, memo: Map<string, Pt[]>, stack: Set<string>): Pt[] {
  const cached = memo.get(id);
  if (cached) return cached;
  const m = mods[id];
  if (!m) return [];
  if (stack.has(id)) return [{ e: m.e, r: m.r, a: m.a, p: m.p, ids: [id] }]; // cycle guard
  stack.add(id);
  let set: Pt[] = [{ e: m.e, r: m.r, a: m.a, p: m.p, ids: [id] }];
  for (const slot of m.s) {
    const ss = slotSet(slot, mods, memo, stack);
    if (ss.length) set = combine(set, ss);
  }
  stack.delete(id);
  memo.set(id, set);
  return set;
}

// Pareto set for filling one slot: pick the best option (or nothing, if optional).
function slotSet(slot: ForgeSlot, mods: Record<string, ForgeMod>, memo: Map<string, Pt[]>, stack: Set<string>): Pt[] {
  const opts: Pt[] = [];
  if (!slot.req) opts.push({ e: 0, r: 0, a: 0, p: 0, ids: [] }); // leave empty
  for (const optId of slot.items) {
    for (const pt of modSet(optId, mods, memo, stack)) opts.push(pt);
  }
  return prune(opts);
}

function modCandidates(
  id: string,
  mods: Record<string, ForgeMod>,
  memo: Map<string, Pt[]>,
  stack: Set<string>,
  opts: Required<CandidateOptions>,
): Pt[] {
  const cached = memo.get(id);
  if (cached) return cached;
  const m = mods[id];
  if (!m) return [];
  if (stack.has(id)) return [{ e: m.e, r: m.r, a: m.a, p: m.p, ids: [id] }];
  stack.add(id);
  let set: Pt[] = [{ e: m.e, r: m.r, a: m.a, p: m.p, ids: [id] }];
  for (const slot of m.s) {
    const ss = slotCandidates(slot, mods, memo, stack, opts);
    if (ss.length) set = combineCandidatesWithCap(set, ss, opts.perModLimit, opts.maxPairs);
  }
  stack.delete(id);
  set = trimCandidates(set, opts.perModLimit);
  memo.set(id, set);
  return set;
}

function slotCandidates(
  slot: ForgeSlot,
  mods: Record<string, ForgeMod>,
  memo: Map<string, Pt[]>,
  stack: Set<string>,
  opts: Required<CandidateOptions>,
): Pt[] {
  const out: Pt[] = [];
  if (!slot.req) out.push({ e: 0, r: 0, a: 0, p: 0, ids: [] });
  for (const optId of slot.items) {
    for (const pt of modCandidates(optId, mods, memo, stack, opts)) out.push(pt);
  }
  return trimCandidates(out, opts.perSlotLimit);
}

// Size of the full search space (every distinct complete build). Memoized,
// capped so deep trees don't overflow to Infinity.
const COMBO_CAP = 1e18;
function countMod(id: string, mods: Record<string, ForgeMod>, memo: Map<string, number>, stack: Set<string>): number {
  const c = memo.get(id);
  if (c !== undefined) return c;
  const m = mods[id];
  if (!m || stack.has(id)) return 1;
  stack.add(id);
  let n = 1;
  for (const slot of m.s) n = Math.min(n * countSlot(slot, mods, memo, stack), COMBO_CAP);
  stack.delete(id);
  memo.set(id, n);
  return n;
}
function countSlot(slot: ForgeSlot, mods: Record<string, ForgeMod>, memo: Map<string, number>, stack: Set<string>): number {
  let n = slot.req ? 0 : 1; // "empty" choice for optional slots
  for (const id of slot.items) n += countMod(id, mods, memo, stack);
  return Math.max(n, 1);
}

/** Compute the Pareto frontier of builds for a weapon. */
export function generateBuilds(weapon: ForgeWeapon, mods: Record<string, ForgeMod>): ForgeResult {
  const memo = new Map<string, Pt[]>();
  let acc: Pt[] = [{ e: 0, r: 0, a: 0, p: 0, ids: [] }];
  for (const slot of weapon.s) {
    const ss = slotSet(slot, mods, memo, new Set());
    if (ss.length) acc = combine(acc, ss);
  }

  const cmemo = new Map<string, number>();
  let combos = 1;
  for (const slot of weapon.s) combos = Math.min(combos * countSlot(slot, mods, cmemo, new Set()), COMBO_CAP);

  // Map objective points to real weapon stats. Recoil modifiers are summed
  // fractions applied to the weapon's base recoil. We clamp the factor: stacking
  // every reducer can sum past -100% (compounded differently in-game, and v1
  // ignores mod conflicts), so cap reduction at 85% to keep numbers realistic.
  let builds: Build[] = acc.map((pt) => buildFromPoint(weapon, pt));

  // Re-prune in real-stat space (recoilV is rounded & clamped) so we don't show
  // builds that another build beats on ergo, recoil and price at once.
  builds = paretoBuilds(builds);
  builds.sort((a, b) => a.price - b.price || b.quality - a.quality || b.ergo - a.ergo);
  return { builds, combos };
}

/** Broad ranked build list. Unlike `generateBuilds`, this keeps non-Pareto
 * alternatives so the UI can show many valid db4tarkov-style options. */
export function generateBuildCandidates(
  weapon: ForgeWeapon,
  mods: Record<string, ForgeMod>,
  options: CandidateOptions = {},
): ForgeResult {
  const opts: Required<CandidateOptions> = {
    limit: options.limit ?? DEFAULT_CANDIDATE_LIMIT,
    perModLimit: options.perModLimit ?? 120,
    perSlotLimit: options.perSlotLimit ?? 260,
    accumulatorLimit: options.accumulatorLimit ?? (options.limit ?? DEFAULT_CANDIDATE_LIMIT),
    maxPairs: options.maxPairs ?? 450_000,
  };

  const memo = new Map<string, Pt[]>();
  let acc: Pt[] = [{ e: 0, r: 0, a: 0, p: 0, ids: [] }];
  for (const slot of weapon.s) {
    const ss = slotCandidates(slot, mods, memo, new Set(), opts);
    if (ss.length) acc = combineCandidatesWithCap(acc, ss, opts.accumulatorLimit, opts.maxPairs);
  }

  const cmemo = new Map<string, number>();
  let combos = 1;
  for (const slot of weapon.s) combos = Math.min(combos * countSlot(slot, mods, cmemo, new Set()), COMBO_CAP);

  const seen = new Set<string>();
  const builds: Build[] = [];
  for (const pt of trimCandidates(acc, opts.limit * 2)) {
    const b = buildFromPoint(weapon, pt);
    const key = `${b.price}|${b.ergo}|${b.recoilV}|${b.ids.join('|')}`;
    if (!seen.has(key)) {
      seen.add(key);
      builds.push(b);
    }
  }

  const picked: Build[] = [];
  const pickedKeys = new Set<string>();
  const add = (b: Build | undefined) => {
    if (!b || picked.length >= opts.limit) return;
    const key = `${b.price}|${b.ergo}|${b.recoilV}|${b.ids.join('|')}`;
    if (pickedKeys.has(key)) return;
    pickedKeys.add(key);
    picked.push(b);
  };
  const addMany = (list: Build[], count: number) => {
    for (const b of list) {
      add(b);
      if (picked.length >= opts.limit || --count <= 0) break;
    }
  };
  const sampleMany = (list: Build[], count: number) => {
    if (!list.length || count <= 0) return;
    const step = (list.length - 1) / Math.max(count - 1, 1);
    for (let i = 0; i < count; i++) add(list[Math.round(i * step)]);
  };

  addMany([...builds].sort((a, b) => b.quality - a.quality || a.price - b.price), Math.ceil(opts.limit * 0.38));
  addMany([...builds].sort((a, b) => a.price - b.price || b.quality - a.quality), Math.ceil(opts.limit * 0.2));
  addMany([...builds].sort((a, b) => b.ergo - a.ergo || b.quality - a.quality), Math.ceil(opts.limit * 0.14));
  sampleMany([...builds].sort((a, b) => a.price - b.price), Math.ceil(opts.limit * 0.18));
  addMany(builds, opts.limit);
  picked.sort((a, b) => a.price - b.price || b.quality - a.quality || b.ergo - a.ergo);
  return { builds: picked, combos };
}

// Final dominance filter on rounded real stats (ergo↑, recoilV↓, price↓).
function paretoBuilds(builds: Build[]): Build[] {
  builds.sort((a, b) => a.price - b.price || b.ergo - a.ergo || a.recoilV - b.recoilV);
  // For each build keep it unless a cheaper-or-equal one has ergo>= and recoilV<=.
  const kept: Build[] = [];
  for (const b of builds) {
    let dominated = false;
    for (const k of kept) {
      if (k.price <= b.price && k.ergo >= b.ergo && k.recoilV <= b.recoilV &&
        (k.price < b.price || k.ergo > b.ergo || k.recoilV < b.recoilV)) { dominated = true; break; }
    }
    if (!dominated) kept.push(b);
  }
  return kept;
}

/** Cheapest build that reaches at least `minQuality` recoil reduction. */
export function bestUnderBudget(builds: Build[], budget: number): Build | null {
  // Among builds within budget, prefer the highest quality, then highest ergo.
  let best: Build | null = null;
  for (const b of builds) {
    if (b.price <= budget && (!best || b.quality > best.quality ||
      (b.quality === best.quality && b.ergo > best.ergo))) best = b;
  }
  return best;
}
