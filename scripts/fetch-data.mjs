// Pre-fetch static data at build time from tarkov.dev GraphQL.
// Result: a single JSON shipped to the client = one request instead of thousands.
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { GraphQLResponseError, gql } from './tarkov-graphql.mjs';

const OUT_DIR = 'src/data';
const PUBLIC_DIR = 'public/data';
const ITEM_BATCH_SIZE = Number.parseInt(process.env.ITEM_BATCH_SIZE || '250', 10);

async function writeBoth(name, data) {
  const json = JSON.stringify(data);
  await Promise.all([
    writeFile(`${OUT_DIR}/${name}`, json),
    writeFile(`${PUBLIC_DIR}/${name}`, json),
  ]);
  return json;
}

function chunks(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function fetchItems(gameMode) {
  const idsData = await gql(`{
    items(gameMode: ${gameMode}) {
      id
    }
  }`, { label: 'item ids' });

  const ids = idsData.items.map((it) => it.id);
  const items = [];
  let processed = 0;

  async function fetchBatch(batch, label) {
    const data = await gql(`{
      items(ids: ${JSON.stringify(batch)}, lang: en, gameMode: ${gameMode}) {
        id
        name
        shortName
        normalizedName
        basePrice
        avg24hPrice
        low24hPrice
        high24hPrice
        lastLowPrice
        changeLast48hPercent
        width
        height
        weight
        iconLink
        wikiLink
        types
        categories { id name normalizedName }
        sellFor { vendor { name normalizedName } price priceRUB currency }
        buyFor  { vendor { name normalizedName } price priceRUB currency }
      }
    }`, { label, retries: 2 });

    return data.items;
  }

  async function fetchBatchAdaptive(batch, label) {
    try {
      return await fetchBatch(batch, label);
    } catch (error) {
      if (!error.retryable || batch.length <= 25) throw error;

      const mid = Math.ceil(batch.length / 2);
      console.warn(`[fetch] ${label} too heavy; splitting ${batch.length} ids into ${mid}/${batch.length - mid}`);
      const left = await fetchBatchAdaptive(batch.slice(0, mid), `${label}a`);
      const right = await fetchBatchAdaptive(batch.slice(mid), `${label}b`);
      return [...left, ...right];
    }
  }

  const batches = chunks(ids, ITEM_BATCH_SIZE);
  for (let i = 0; i < batches.length; i += 1) {
    const batch = batches[i];
    const fetched = await fetchBatchAdaptive(batch, `items ${i + 1}/${batches.length}`);
    items.push(...fetched);
    processed += batch.length;
    console.log(`[fetch] items batch ${i + 1}/${batches.length}: ${items.length}/${processed}/${ids.length}`);
  }

  return items;
}

async function loadExistingTaskExperience() {
  if (!existsSync(`${OUT_DIR}/tasks.json`)) return new Map();

  try {
    const tasks = JSON.parse(await readFile(`${OUT_DIR}/tasks.json`, 'utf8'));
    return new Map(tasks.map((task) => [task.id, task.experience ?? 0]));
  } catch {
    return new Map();
  }
}

function isTaskExperienceError(error) {
  return error instanceof GraphQLResponseError
    && error.errors.some((entry) => entry.message?.includes('Task.experience'));
}

async function fetchTasks(gameMode) {
  const query = (includeExperience) => `{
    tasks(lang: en, gameMode: ${gameMode}) {
      id name normalizedName
      trader { normalizedName name }
      map { normalizedName name }
      minPlayerLevel
      ${includeExperience ? 'experience' : ''}
      wikiLink
      kappaRequired
      lightkeeperRequired
      objectives { description optional }
    }
  }`;

  try {
    const data = await gql(query(true), { label: 'tasks' });
    return data.tasks;
  } catch (error) {
    if (!isTaskExperienceError(error)) throw error;

    console.warn('[fetch] tasks experience is broken upstream; preserving local XP where possible');
    const experience = await loadExistingTaskExperience();
    const data = await gql(query(false), { label: 'tasks without experience' });
    return data.tasks.map((task) => ({
      ...task,
      experience: experience.get(task.id) ?? 0,
    }));
  }
}

async function main() {
  const gameMode = process.env.GAME_MODE === 'pve' ? 'pve' : 'regular';
  console.log(`[fetch] mode=${gameMode}`);

  if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });
  if (!existsSync(PUBLIC_DIR)) await mkdir(PUBLIC_DIR, { recursive: true });

  // 1) Items - bare essentials only (we'll merge live prices client-side)
  console.log('[fetch] items...');
  const itemsData = await fetchItems(gameMode);
  console.log(`[fetch] items: ${itemsData.length}`);

  // Strip nulls, compact for transport
  const items = itemsData.map((it) => ({
    id: it.id,
    n: it.name,
    sn: it.shortName,
    nn: it.normalizedName,
    bp: it.basePrice,
    a24: it.avg24hPrice,
    l24: it.low24hPrice,
    h24: it.high24hPrice,
    llp: it.lastLowPrice,
    ch: it.changeLast48hPercent,
    w: it.width,
    h: it.height,
    wt: it.weight,
    ic: it.iconLink,
    wk: it.wikiLink,
    t: it.types,
    c: it.categories?.map((c) => c.normalizedName) ?? [],
    sf: (it.sellFor || []).map((s) => ({
      v: s.vendor.normalizedName,
      p: s.priceRUB,
      pr: s.price,
      c: s.currency,
    })),
    bf: (it.buyFor || []).map((b) => ({
      v: b.vendor.normalizedName,
      p: b.priceRUB,
      pr: b.price,
      c: b.currency,
    })),
  }));

  const itemsJson = await writeBoth('items.json', items);
  console.log(`[fetch] wrote items.json (${(itemsJson.length / 1024 / 1024).toFixed(2)} MB)`);

  // 2) Traders
  console.log('[fetch] traders...');
  const tradersData = await gql(`{
    traders(lang: en, gameMode: ${gameMode}) {
      id name normalizedName
      imageLink image4xLink
      levels { level payRate insuranceRate repairCostMultiplier requiredPlayerLevel requiredReputation requiredCommerce }
      currency { name }
    }
  }`, { label: 'traders' });
  await writeBoth('traders.json', tradersData.traders);
  console.log(`[fetch] traders: ${tradersData.traders.length}`);

  // 3) Barters
  console.log('[fetch] barters...');
  const bartersData = await gql(`{
    barters(lang: en, gameMode: ${gameMode}) {
      id
      level
      trader { normalizedName name }
      taskUnlock { id name }
      requiredItems { item { id name shortName iconLink } count }
      rewardItems  { item { id name shortName iconLink } count }
    }
  }`, { label: 'barters' });
  await writeBoth('barters.json', bartersData.barters);
  console.log(`[fetch] barters: ${bartersData.barters.length}`);

  // 4) Crafts
  console.log('[fetch] crafts...');
  const craftsData = await gql(`{
    crafts(lang: en, gameMode: ${gameMode}) {
      id
      station { normalizedName name }
      level
      duration
      requiredItems { item { id name shortName iconLink } count }
      rewardItems  { item { id name shortName iconLink } count }
    }
  }`, { label: 'crafts' });
  await writeBoth('crafts.json', craftsData.crafts);
  console.log(`[fetch] crafts: ${craftsData.crafts.length}`);

  // 5) Maps
  console.log('[fetch] maps...');
  const mapsData = await gql(`{
    maps(lang: en, gameMode: ${gameMode}) {
      id name normalizedName
      raidDuration players description
      enemies
      wiki
    }
  }`, { label: 'maps' });
  await writeBoth('maps.json', mapsData.maps);
  console.log(`[fetch] maps: ${mapsData.maps.length}`);

  // 6) Ammo (specialized — extracts ballistic data)
  console.log('[fetch] ammo...');
  const ammoData = await gql(`{
    ammo(lang: en, gameMode: ${gameMode}) {
      item { id name shortName iconLink avg24hPrice lastLowPrice basePrice }
      caliber
      damage
      armorDamage
      penetrationPower
      fragmentationChance
      initialSpeed
      tracer
      ammoType
    }
  }`, { label: 'ammo' });
  await writeBoth('ammo.json', ammoData.ammo);
  console.log(`[fetch] ammo: ${ammoData.ammo.length}`);

  // 7) Tasks (quests)
  console.log('[fetch] tasks...');
  const tasks = await fetchTasks(gameMode);
  await writeBoth('tasks.json', tasks);
  console.log(`[fetch] tasks: ${tasks.length}`);

  // 8) Hideout
  console.log('[fetch] hideout...');
  const hideoutData = await gql(`{
    hideoutStations(lang: en, gameMode: ${gameMode}) {
      id name normalizedName
      levels {
        level
        constructionTime
        itemRequirements { item { id name shortName iconLink } count }
      }
    }
  }`, { label: 'hideout' });
  await writeBoth('hideout.json', hideoutData.hideoutStations);
  console.log(`[fetch] hideout: ${hideoutData.hideoutStations.length}`);

  console.log('[fetch] done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
