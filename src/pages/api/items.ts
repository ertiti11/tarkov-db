export const prerender = false;

const API = 'https://api.tarkov.dev/graphql';
const CACHE_SECONDS = 3600;

async function fetchPrices(gameMode: string) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `{
        items(gameMode: ${gameMode}) {
          id
          avg24hPrice
          low24hPrice
          high24hPrice
          lastLowPrice
          changeLast48hPercent
          basePrice
          sellFor { vendor { normalizedName } priceRUB }
          buyFor  { vendor { normalizedName } priceRUB }
        }
      }`,
    }),
  });

  if (!res.ok) throw new Error(`tarkov.dev ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message || 'GraphQL error');

  return json.data.items.map((it: any) => ({
    id: it.id,
    a24: it.avg24hPrice,
    l24: it.low24hPrice,
    h24: it.high24hPrice,
    llp: it.lastLowPrice,
    ch: it.changeLast48hPercent,
    bp: it.basePrice,
    sf: (it.sellFor || []).map((s: any) => ({ v: s.vendor.normalizedName, p: s.priceRUB })),
    bf: (it.buyFor || []).map((b: any) => ({ v: b.vendor.normalizedName, p: b.priceRUB })),
  }));
}

export async function GET({ request }: { request: Request }) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('mode') === 'pvp' ? 'regular' : 'pve';

  try {
    const prices = await fetchPrices(mode);
    return new Response(JSON.stringify(prices), {
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
