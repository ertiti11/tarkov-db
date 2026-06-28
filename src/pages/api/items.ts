export const prerender = false;

const API = 'https://api.tarkov.dev/graphql';
const CACHE_SECONDS = 3600; // 1 hour

async function fetchAllItems(gameMode: string) {
  const idsRes = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `{ items(gameMode: ${gameMode}) { id } }`,
    }),
  });
  const idsJson = await idsRes.json();
  const ids: string[] = idsJson.data.items.map((it: any) => it.id);

  const batchSize = 250;
  const items: any[] = [];

  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `{
          items(ids: ${JSON.stringify(batch)}, lang: en, gameMode: ${gameMode}) {
            id name shortName normalizedName
            basePrice avg24hPrice low24hPrice high24hPrice lastLowPrice changeLast48hPercent
            width height weight iconLink wikiLink types
            categories { normalizedName }
            sellFor { vendor { normalizedName } price priceRUB currency }
            buyFor  { vendor { normalizedName } price priceRUB currency }
          }
        }`,
      }),
    });
    const json = await res.json();
    if (json.data?.items) items.push(...json.data.items);
  }

  return items.map((it) => ({
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
    c: it.categories?.map((c: any) => c.normalizedName) ?? [],
    sf: (it.sellFor || []).map((s: any) => ({
      v: s.vendor.normalizedName,
      p: s.priceRUB,
      pr: s.price,
      c: s.currency,
    })),
    bf: (it.buyFor || []).map((b: any) => ({
      v: b.vendor.normalizedName,
      p: b.priceRUB,
      pr: b.price,
      c: b.currency,
    })),
  }));
}

export async function GET({ request }: { request: Request }) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('mode') === 'pvp' ? 'regular' : 'pve';

  try {
    const items = await fetchAllItems(mode);
    return new Response(JSON.stringify(items), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=600`,
      },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
