// Pre-fetch weapon build trees for the FORGE optimizer.
// For a set of base weapons, recursively walk every mod slot to closure,
// recording each mod's ergo / recoil / accuracy modifiers + cheapest price.
// Output: forge.json (mods map + weapons list) shipped to the client.
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { gql } from './tarkov-graphql.mjs';

const OUT_DIR = 'src/data';
const PUBLIC_DIR = 'public/data';
const BATCH_SIZE = Number.parseInt(process.env.FORGE_BATCH_SIZE || '250', 10);

// All weapons from items.json (anything typed "gun"). Launchers have no useful
// builds, so skip them.
const SKIP_CATS = new Set(['grenade-launcher', 'rocket-launcher']);
async function loadWeaponIds() {
  const items = JSON.parse(await readFile(`${OUT_DIR}/items.json`, 'utf8'));
  return items
    .filter((it) => (it.t || []).includes('gun') && !(it.c || []).some((c) => SKIP_CATS.has(c)))
    .map((it) => it.id);
}

// Cheapest acquisition price in RUB, falling back to flea/base.
function cheapestPrice(it) {
  const buys = (it.buyFor || []).map((b) => b.priceRUB).filter((p) => p > 0);
  if (buys.length) return Math.min(...buys);
  return it.avg24hPrice || it.lastLowPrice || it.basePrice || 0;
}

const MOD_FRAGMENTS = `
  ... on ItemPropertiesWeaponMod { ergonomics recoilModifier accuracyModifier slots { id name required filters { allowedItems { id } } } }
  ... on ItemPropertiesBarrel    { ergonomics recoilModifier accuracyModifier slots { id name required filters { allowedItems { id } } } }
  ... on ItemPropertiesScope     { ergonomics recoilModifier slots { id name required filters { allowedItems { id } } } }
  ... on ItemPropertiesMagazine  { ergonomics recoilModifier capacity }
`;

function normSlots(slots) {
  // Some parts expose several slots with the same name (e.g. a buffer tube with
  // two "Stock" slots) that are mutually exclusive in-game via conflict rules we
  // don't model. Keep only the first of each name so a build can't stack two of
  // the same kind. Sort by option count desc first so we keep the richest one.
  const sorted = [...(slots || [])].sort(
    (a, b) => (b.filters?.allowedItems?.length || 0) - (a.filters?.allowedItems?.length || 0),
  );
  const seen = new Set();
  const out = [];
  for (const s of sorted) {
    if (seen.has(s.name)) continue;
    seen.add(s.name);
    out.push({
      n: s.name,
      req: !!s.required,
      items: (s.filters?.allowedItems || []).map((a) => a.id),
    });
  }
  return out;
}

// Pull props + price for a batch of item ids.
async function fetchItems(ids) {
  async function fetchBatch(batch, label) {
    const data = await gql(`{
      items(ids: ${JSON.stringify(batch)}, lang: en, gameMode: ${GAME_MODE}) {
        id name shortName iconLink imageLink baseImageLink
        basePrice avg24hPrice lastLowPrice
        categories { normalizedName }
        buyFor { priceRUB }
        properties { __typename ${MOD_FRAGMENTS} }
      }
    }`, { label, retries: 2 });
    return data.items;
  }

  try {
    return await fetchBatch(ids, `forge items (${ids.length})`);
  } catch (error) {
    if (!error.retryable || ids.length <= 25) throw error;

    const mid = Math.ceil(ids.length / 2);
    console.warn(`[forge] item batch too heavy; splitting ${ids.length} ids into ${mid}/${ids.length - mid}`);
    const left = await fetchItems(ids.slice(0, mid));
    const right = await fetchItems(ids.slice(mid));
    return [...left, ...right];
  }
}

// Generic categories shared by all mods — useless for telling slots apart.
const GENERIC_CATS = new Set([
  'weapon-mod', 'gear-mod', 'functional-mod', 'essential-mod',
  'compound-item', 'item', 'master-mod', 'barter-item', 'mods',
]);

// Slots that never belong in a recoil/price build. Optics, mounts and tactical
// devices stay in the graph because the FORGE UI can now constrain those.
const DROP_SLOT = /ubgl/i;

// The slot's dominant specific category (e.g. a "Pistol Grip" slot -> pistol-grip).
function dominantCat(items, cats) {
  const freq = {};
  for (const id of items) {
    for (const c of cats[id] || []) {
      if (GENERIC_CATS.has(c)) continue;
      freq[c] = (freq[c] || 0) + 1;
    }
  }
  let best = null, bn = 0;
  for (const [c, n] of Object.entries(freq)) if (n > bn) { bn = n; best = c; }
  return best;
}

function slotKind(name) {
  const s = name.toLowerCase();
  if (/scope|sight|optic/.test(s)) return 'optic';
  if (/tactical|flashlight|light|laser|device/.test(s)) return 'tactical';
  if (/mount|rail/.test(s)) return 'mount';
  return 'mod';
}

// Drop irrelevant slots; keep only items matching the slot's dominant kind
// (tarkov.dev slot filters are loose — e.g. a stock listed under a grip slot).
function cleanSlots(slots, mods, cats) {
  const out = [];
  for (const s of slots) {
    if (DROP_SLOT.test(s.n)) continue;
    const kind = slotKind(s.n);
    const tc = dominantCat(s.items, cats);
    let items = s.items.filter((id) => mods[id]); // resolved only
    if (kind === 'optic') {
      items = items.filter((id) => (cats[id] || []).includes('sights'));
    } else if (kind === 'tactical') {
      // Tactical slot filters are already specific enough. Many laser/light
      // devices only come through as generic functional-mod categories.
      items = items;
    } else if (kind === 'mount') {
      items = items.filter((id) => (cats[id] || []).some((c) => /mount|sights|tactical|gear-mod/.test(c)));
    } else if (tc) {
      items = items.filter((id) => (cats[id] || []).includes(tc));
    }
    if (items.length) out.push({ n: s.n, req: s.req, items });
  }
  return out;
}

const GAME_MODE = process.env.GAME_MODE === 'pve' ? 'pve' : 'regular';

async function main() {
  console.log(`[forge] mode=${GAME_MODE}`);
  if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });
  if (!existsSync(PUBLIC_DIR)) await mkdir(PUBLIC_DIR, { recursive: true });

  // 1) Base weapons
  const WEAPON_IDS = await loadWeaponIds();
  console.log(`[forge] weapons to process: ${WEAPON_IDS.length}`);
  const wData = await gql(`{
    items(ids: ${JSON.stringify(WEAPON_IDS)}, lang: en, gameMode: ${GAME_MODE}) {
      id name shortName iconLink imageLink baseImageLink
      properties {
        ... on ItemPropertiesWeapon {
          caliber ergonomics recoilVertical recoilHorizontal fireRate
          slots { id name required filters { allowedItems { id } } }
        }
      }
    }
  }`, { label: 'forge weapons' });

  const weapons = [];
  const frontierIds = new Set();
  for (const it of wData.items) {
    const p = it.properties || {};
    weapons.push({
        id: it.id,
        n: it.name,
        sn: it.shortName,
        ic: it.iconLink,
        img: it.baseImageLink || it.imageLink,
      cal: p.caliber || null,
      e0: p.ergonomics ?? 0,
      rv: p.recoilVertical ?? 0,
      rh: p.recoilHorizontal ?? 0,
      fr: p.fireRate ?? 0,
      s: normSlots(p.slots),
    });
    for (const s of normSlots(p.slots)) for (const id of s.items) frontierIds.add(id);
  }
  console.log(`[forge] weapons: ${weapons.length}, seed mods: ${frontierIds.size}`);

  // 2) Walk the mod tree to closure. A persistent queue + done-set so nothing
  // is dropped: each round fetches up to 250 not-yet-fetched ids and enqueues
  // their children.
  const mods = {};
  const cats = {}; // id -> category normalizedNames (used for slot cleanup, not shipped)
  const queued = new Set(frontierIds);
  const done = new Set();
  while (true) {
    const batch = [...queued].filter((id) => !done.has(id)).slice(0, BATCH_SIZE);
    if (!batch.length) break;
    for (const id of batch) { queued.delete(id); done.add(id); }
    const items = await fetchItems(batch);
    for (const it of items) {
      const p = it.properties || {};
      const slots = normSlots(p.slots);
      cats[it.id] = (it.categories || []).map((c) => c.normalizedName);
      mods[it.id] = {
        n: it.name,
        sn: it.shortName,
        ic: it.iconLink,
        img: it.baseImageLink || it.imageLink,
        c: cats[it.id],
        e: p.ergonomics ?? 0,
        r: p.recoilModifier ?? 0,
        a: p.accuracyModifier ?? 0,
        cap: p.capacity ?? null,
        p: cheapestPrice(it),
        s: slots,
      };
      for (const s of slots) for (const id of s.items) if (!done.has(id)) queued.add(id);
    }
    console.log(`[forge] resolved ${Object.keys(mods).length} mods, ${queued.size} queued`);
  }

  // 3) Clean slots: drop non-build slots and loose-filter junk so builds are
  // realistic (one part per kind, matching the slot).
  for (const w of weapons) w.s = cleanSlots(w.s, mods, cats);
  for (const id of Object.keys(mods)) mods[id].s = cleanSlots(mods[id].s, mods, cats);

  // Prune now-unreferenced mods to shrink the payload.
  const reachable = new Set();
  const visit = (slots) => {
    for (const s of slots) for (const id of s.items) {
      if (mods[id] && !reachable.has(id)) { reachable.add(id); visit(mods[id].s); }
    }
  };
  for (const w of weapons) visit(w.s);
  for (const id of Object.keys(mods)) if (!reachable.has(id)) delete mods[id];

  const out = { mode: GAME_MODE, generatedAt: Date.now(), weapons, mods };
  const json = JSON.stringify(out);
  await Promise.all([
    writeFile(`${OUT_DIR}/forge.json`, json),
    writeFile(`${PUBLIC_DIR}/forge.json`, json),
  ]);
  console.log(`[forge] wrote forge.json (${(json.length / 1024 / 1024).toFixed(2)} MB, ${Object.keys(mods).length} mods)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
