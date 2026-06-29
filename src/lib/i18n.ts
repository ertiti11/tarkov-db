export type Lang = 'en' | 'es';

const translations: Record<string, Record<Lang, string>> = {
  // Navigation
  'nav.market': { en: 'Market', es: 'Mercado' },
  'nav.guns': { en: 'Guns', es: 'Armas' },
  'nav.ammo': { en: 'Ammo', es: 'Munición' },
  'nav.barter': { en: 'Barter', es: 'Trueque' },
  'nav.craft': { en: 'Craft', es: 'Fabricación' },
  'nav.traders': { en: 'Traders', es: 'Comerciantes' },
  'nav.maps': { en: 'Maps', es: 'Mapas' },
  'nav.quests': { en: 'Quests', es: 'Misiones' },
  'nav.hideout': { en: 'Hideout', es: 'Refugio' },

  // Market page
  'market.filter': { en: 'Filter visible rows…', es: 'Filtrar filas visibles…' },
  'market.allCategories': { en: 'All categories', es: 'Todas las categorías' },
  'market.sort': { en: 'Sort:', es: 'Ordenar:' },
  'market.sortAvg': { en: 'Avg 24h ↓', es: 'Prom 24h ↓' },
  'market.sortLow24': { en: 'Low 24h ↓', es: 'Mín 24h ↓' },
  'market.sortHigh24': { en: 'High 24h ↓', es: 'Máx 24h ↓' },
  'market.sortLastLow': { en: 'Last Low ↓', es: 'Último mín ↓' },
  'market.sortChange': { en: 'Change 48h ↓', es: 'Cambio 48h ↓' },
  'market.sortProfit': { en: 'Trader profit ↓', es: 'Beneficio trader ↓' },
  'market.sortName': { en: 'Name A→Z', es: 'Nombre A→Z' },
  'market.loading': { en: 'Loading items…', es: 'Cargando objetos…' },
  'market.items': { en: 'items', es: 'objetos' },
  'market.livePrices': { en: 'live {mode} prices', es: 'precios {mode} en vivo' },

  // Table headers
  'table.item': { en: 'Item', es: 'Objeto' },
  'table.avg24': { en: 'Avg 24h', es: 'Prom 24h' },
  'table.low24': { en: 'Low 24h', es: 'Mín 24h' },
  'table.high24': { en: 'High 24h', es: 'Máx 24h' },
  'table.lastLow': { en: 'Last Low', es: 'Último mín' },
  'table.change48': { en: 'Δ 48h', es: 'Δ 48h' },
  'table.bestTrader': { en: 'Best Trader', es: 'Mejor trader' },

  // Item detail
  'item.back': { en: '← Market', es: '← Mercado' },
  'item.loading': { en: 'Loading item…', es: 'Cargando objeto…' },
  'item.notFound': { en: 'Item not found.', es: 'Objeto no encontrado.' },
  'item.wiki': { en: 'wiki ↗', es: 'wiki ↗' },
  'item.generateBuild': { en: '⚒ Generate build', es: '⚒ Generar build' },
  'item.priceHistory': { en: 'Price history', es: 'Historial de precios' },
  'item.buyFromTraders': { en: 'Buy from traders', es: 'Comprar a comerciantes' },
  'item.sellToTraders': { en: 'Sell to traders', es: 'Vender a comerciantes' },
  'item.notBought': { en: 'Not bought by traders.', es: 'No comprado por comerciantes.' },
  'item.notSold': { en: 'Not sold by traders.', es: 'No vendido por comerciantes.' },
  'item.obtainThrough': { en: 'Obtain through', es: 'Obtener mediante' },

  // Demand/Liquidity
  'demand.offers': { en: 'Flea offers ({range}): now', es: 'Ofertas en flea ({range}): ahora' },
  'demand.avg': { en: 'avg', es: 'medio' },
  'demand.min': { en: 'min', es: 'mín' },
  'demand.max': { en: 'max', es: 'máx' },
  'demand.liquidity': { en: 'liquidity', es: 'liquidez' },
  'demand.low': { en: 'Low', es: 'Baja' },
  'demand.medium': { en: 'Medium', es: 'Media' },
  'demand.high': { en: 'High', es: 'Alta' },
  'demand.noData': { en: 'No offer data for this range.', es: 'Sin datos de ofertas para este rango.' },

  // Guns page
  'guns.subtitle': { en: 'weapons · with build generator', es: 'armas · con generador de builds' },
  'guns.description': { en: 'pick a weapon and generate the best quality/price build', es: 'elige un arma y genera la mejor build calidad / precio' },
  'guns.filter': { en: 'Filter weapons…', es: 'Filtrar armas…' },
  'guns.generateBuild': { en: '⚒ generate build →', es: '⚒ generar build →' },
  'guns.noBuilds': { en: 'no builds', es: 'sin builds' },

  // Forge page
  'forge.loading': { en: 'Loading weapon…', es: 'Cargando arma…' },
  'forge.subtitle': { en: 'Firearm Optimization, Ranking & Generation Engine', es: 'Motor de Optimización, Ranking y Generación de Armas' },
  'forge.viewItem': { en: 'view item ↗', es: 'ver item ↗' },
  'forge.settings': { en: 'Generator settings', es: 'Ajustes del generador' },
  'forge.suppressed': { en: 'Suppressed', es: 'Supresor' },
  'forge.buyable': { en: 'Buyable', es: 'Comprable' },
  'forge.mags': { en: 'Mags', es: 'Cargadores' },
  'forge.scope': { en: 'Scope', es: 'Mira' },
  'forge.tactical': { en: 'Tactical', es: 'Táctico' },
  'forge.blocked': { en: 'Blocked items', es: 'Items bloqueados' },
  'forge.forced': { en: 'Forced items', es: 'Items forzados' },
  'forge.builds': { en: 'Quality / price builds', es: 'Builds calidad / precio' },
  'forge.maxBudget': { en: 'Max budget', es: 'Presupuesto máximo' },
  'forge.selectedBuild': { en: 'Selected build', es: 'Build seleccionada' },
  'forge.quickPick': { en: 'Quick pick', es: 'Selector rápido' },
  'forge.bestBudget': { en: 'Best budget', es: 'Mejor presupuesto' },
  'forge.lowestRecoil': { en: 'Lowest recoil', es: 'Menor recoil' },
  'forge.highestErgo': { en: 'Highest ergo', es: 'Mayor ergo' },
  'forge.cheapest': { en: 'Cheapest', es: 'Más barata' },
  'forge.prev': { en: 'Previous', es: 'Anterior' },
  'forge.next': { en: 'Next', es: 'Siguiente' },
  'forge.assembly': { en: 'Assembly · connected parts', es: 'Montaje · piezas conectadas' },
  'forge.allBuilds': { en: 'All builds', es: 'Todas las builds' },
  'forge.priceUp': { en: 'price ↑', es: 'precio ↑' },
  'forge.recoilDown': { en: 'recoil ↓', es: 'retroceso ↓' },
  'forge.ergoDown': { en: 'ergo ↓', es: 'ergo ↓' },
  'forge.notInForge': { en: 'This weapon is not yet in FORGE.', es: 'Esta arma todavía no está en FORGE.' },
  'forge.disclaimer': {
    en: 'Magazine, scope, tactical, suppressor, blocked and forced filters are applied before rebuilding the ranked list. Approximate figures: some internal mod conflicts are still ignored.',
    es: 'Los filtros de cargador, scope, táctico, supresor, bloqueados y forzados se aplican antes de reconstruir la lista rankeada. Cifras aproximadas: todavía se ignoran algunos conflictos internos entre mods.'
  },

  // Ammo page
  'ammo.filter': { en: 'Filter ammo…', es: 'Filtrar munición…' },
  'ammo.allCalibers': { en: 'All calibers', es: 'Todos los calibres' },

  // Barter page
  'barter.filter': { en: 'Search items or traders…', es: 'Buscar objetos o comerciantes…' },
  'barter.allTraders': { en: 'All traders', es: 'Todos los comerciantes' },

  // Craft page
  'craft.filter': { en: 'Search items…', es: 'Buscar objetos…' },
  'craft.allStations': { en: 'All stations', es: 'Todas las estaciones' },

  // Search
  'search.placeholder': { en: 'Search items, traders, quests… (Ctrl+K)', es: 'Buscar objetos, traders, misiones… (Ctrl+K)' },

  // Footer
  'footer.data': { en: 'Data from tarkov.dev · Not affiliated with BSG · Built with Astro', es: 'Datos de tarkov.dev · No afiliado con BSG · Hecho con Astro' },

  // Common
  'common.base': { en: 'Base', es: 'Base' },
};

export function getLang(): Lang {
  if (typeof window === 'undefined') return 'en';
  return (localStorage.getItem('tdb-lang') || (navigator.language.startsWith('es') ? 'es' : 'en')) as Lang;
}

export function t(key: string, lang?: Lang): string {
  const l = lang || getLang();
  return translations[key]?.[l] || translations[key]?.['en'] || key;
}
