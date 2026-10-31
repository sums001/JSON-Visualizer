// Deterministic sample datasets that exercise every view.

function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const hex = (r, n) => Array.from({ length: n }, () => Math.floor(r() * 16).toString(16)).join('');
const day = (base, offset) => new Date(base + offset * 86400000).toISOString();

function markets() {
  const r = rng(7);
  const cities = ['London', 'Tokyo', 'Lagos', 'Lima', 'Oslo', 'Seoul', 'Austin', 'Mumbai', 'Cairo', 'Denver', 'Perth', 'Madrid'];
  const base = Date.UTC(2026, 3, 1);
  return cities.map((city, i) => {
    const start = base + Math.floor(r() * 120) * 86400000;
    const nMarkets = 6 + Math.floor(r() * 9);
    const lo = 4 + Math.floor(r() * 18);
    const closed = r() > 0.55;
    const ms = Array.from({ length: nMarkets }, (_, j) => {
      const vol = Math.round(r() ** 2 * 60000 * 100) / 100;
      const p = Math.round(r() * 1000) / 1000;
      return {
        id: String(500000 + i * 100 + j),
        question: `Will the highest temperature in ${city} be ${lo + j}°C?`,
        groupItemTitle: j === 0 ? `${lo}°C or below` : j === nMarkets - 1 ? `${lo + j}°C or higher` : `${lo + j}°C`,
        conditionId: `0x${hex(r, 40)}`,
        outcomes: '["Yes", "No"]',
        outcomePrices: JSON.stringify([String(p), String(Math.round((1 - p) * 1000) / 1000)]),
        volume: String(vol),
        volumeNum: vol,
        liquidity: Math.round(r() * 9000 * 100) / 100,
        bestBid: Math.round(p * 0.98 * 1000) / 1000,
        bestAsk: Math.min(1, Math.round(p * 1.02 * 1000) / 1000),
        spread: Math.round(r() * 30) / 1000,
        active: !closed,
        closed,
        acceptingOrders: !closed && r() > 0.2,
        negRisk: true,
        createdAt: new Date(start - 86400000 * 2).toISOString(),
        endDate: new Date(start + 86400000).toISOString(),
        umaResolutionStatus: closed ? 'resolved' : r() > 0.7 ? 'proposed' : null,
        rewards: { minSize: 50, maxSpread: 4.5, rates: r() > 0.6 ? [{ asset: 'USDC', dailyRate: Math.round(r() * 50) }] : [] },
      };
    });
    const volume = ms.reduce((s, m) => s + m.volumeNum, 0);
    return {
      id: String(37000 + i * 13),
      ticker: `highest-temperature-in-${city.toLowerCase()}`,
      slug: `highest-temperature-in-${city.toLowerCase()}-on-${new Date(start).toISOString().slice(0, 10)}`,
      title: `Highest temperature in ${city} on ${new Date(start).toUTCString().slice(5, 11)}?`,
      description: `This market resolves to the temperature range that contains the highest temperature recorded at the primary station in ${city}.`,
      category: pick(r, ['Weather', 'Weather', 'Climate', 'Science']),
      image: `https://images.example.com/weather/${city.toLowerCase()}.png`,
      startDate: new Date(start).toISOString(),
      endDate: new Date(start + 86400000 * (1 + Math.floor(r() * 3))).toISOString(),
      active: !closed,
      closed,
      featured: r() > 0.8,
      restricted: r() > 0.5,
      volume: Math.round(volume * 100) / 100,
      openInterest: Math.round(volume * (0.2 + r() * 0.6) * 100) / 100,
      commentCount: Math.floor(r() ** 3 * 400),
      negRiskMarketID: `0x${hex(r, 40)}`,
      markets: ms,
      series: [{ id: String(10000 + i), slug: `${city.toLowerCase()}-daily-weather`, recurrence: 'daily', active: true }],
      tags: [
        { id: '84', label: 'Weather', slug: 'weather' },
        { id: String(100 + i), label: city, slug: city.toLowerCase() },
        ...(r() > 0.5 ? [{ id: '21', label: 'Recurring', slug: 'recurring' }] : []),
      ],
      eventMetadata: r() > 0.4 ? { station: `${city.slice(0, 3).toUpperCase()}-${Math.floor(r() * 90 + 10)}`, unit: 'celsius', source: null } : null,
    };
  });
}

function missions() {
  const r = rng(42);
  const agencies = ['Helios Space', 'Northstar', 'Aurora Labs', 'Kepler Union', 'Meridian'];
  const statuses = ['active', 'complete', 'planned', 'lost', 'active', 'complete'];
  const targets = ['Mars', 'Moon', 'Europa', 'Venus', 'L2', 'Titan', 'Asteroid belt', 'LEO'];
  const first = ['Ari', 'Noor', 'Kai', 'Lena', 'Tomas', 'Yuki', 'Ines', 'Ravi', 'Mila', 'Oren', 'Sade', 'Juno'];
  const roles = ['commander', 'pilot', 'engineer', 'geologist', 'medic'];
  const list = Array.from({ length: 48 }, (_, i) => {
    const launch = Date.UTC(2004, 0, 1) + Math.floor(r() * 9000) * 86400000;
    const status = pick(r, statuses);
    const crewed = r() > 0.6;
    const duration = Math.floor(30 + r() ** 1.5 * 3000);
    return {
      id: `M-${(1000 + i * 7).toString(36).toUpperCase()}`,
      name: `${pick(r, ['Lyra', 'Vega', 'Orion', 'Talos', 'Nyx', 'Aether', 'Halcyon', 'Corvus'])} ${Math.floor(r() * 9) + 1}`,
      agency: pick(r, agencies),
      target: pick(r, targets),
      status,
      launchDate: new Date(launch).toISOString().slice(0, 10),
      endDate: status === 'active' || status === 'planned' ? null : new Date(launch + duration * 86400000).toISOString().slice(0, 10),
      budgetMillions: Math.round((80 + r() ** 2 * 2400) * 10) / 10,
      payloadKg: Math.round(200 + r() * 18000),
      crewed,
      crew: crewed ? Array.from({ length: 2 + Math.floor(r() * 4) }, (_, j) => ({ name: `${pick(r, first)} ${String.fromCharCode(65 + Math.floor(r() * 26))}.`, role: roles[j % roles.length], evaHours: Math.round(r() * 120) })) : [],
      launchSite: { name: pick(r, ['Equatorial Pad 3', 'Northern Range', 'Coastal Complex 9', 'Desert Station']), lat: Math.round((r() * 120 - 60) * 1000) / 1000, lng: Math.round((r() * 340 - 170) * 1000) / 1000 },
      orbit: { apoapsisKm: Math.round(300 + r() * 40000), periapsisKm: Math.round(200 + r() * 800), inclinationDeg: Math.round(r() * 980) / 10 },
      instruments: Array.from({ length: 1 + Math.floor(r() * 5) }, () => pick(r, ['spectrometer', 'magnetometer', 'radar', 'lidar', 'imager', 'seismometer', 'dust analyzer'])),
      successRate: Math.round(r() * 1000) / 1000,
      patchColor: `#${hex(r, 6)}`,
    };
  });
  return {
    catalog: 'Fictional deep-space mission registry',
    version: '3.2.0',
    generatedAt: '2026-10-01T09:30:00Z',
    license: null,
    missions: list,
    agencies: agencies.map((name, i) => ({ name, founded: 1990 + i * 5, hq: { city: pick(r, ['Geneva', 'Nairobi', 'Osaka', 'Quito', 'Reykjavik']), employees: Math.round(800 + r() * 20000) } })),
  };
}

function tokens() {
  const r = rng(3);
  const scale = (h) =>
    Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((s, i) => [s, `hsl(${h} ${70 - i * 2}% ${96 - i * 9}%)`]));
  return {
    $schema: 'https://design-tokens.example.org/schema.json',
    name: 'Nebula Design System',
    meta: { owner: 'design-platform', updated: '2026-09-14', deprecated: false, contributors: ['amira', 'joon', 'felix'] },
    color: {
      brand: { primary: '#7c3aed', secondary: '#06b6d4', accent: '#f472b6', ink: '#0b1020' },
      palette: { violet: scale(262), cyan: scale(190), rose: scale(340), amber: scale(38), slate: scale(220) },
      semantic: {
        success: { fg: '#16a34a', bg: '#dcfce7', border: null },
        warning: { fg: '#d97706', bg: '#fef3c7', border: '#fbbf24' },
        danger: { fg: '#dc2626', bg: '#fee2e2', border: '#f87171' },
      },
    },
    typography: {
      families: { sans: 'Inter, system-ui', mono: 'JetBrains Mono, monospace', display: 'Space Grotesk' },
      scale: Array.from({ length: 9 }, (_, i) => ({ step: i - 2, size: Math.round(12 * 1.2 ** (i - 2) * 100) / 100, lineHeight: Math.round((1.6 - i * 0.04) * 100) / 100 })),
      weights: { regular: 400, medium: 500, semibold: 600, bold: 700 },
    },
    spacing: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`s${i}`, i * 4])),
    radius: { none: 0, sm: 4, md: 8, lg: 14, pill: 9999 },
    motion: { durations: { fast: 120, base: 220, slow: 420 }, easing: { standard: 'cubic-bezier(.2,0,0,1)', emphasized: 'cubic-bezier(.3,0,0,1.2)' } },
    components: Object.fromEntries(
      ['button', 'card', 'input', 'tooltip', 'modal', 'tabs', 'toast', 'badge'].map((c) => [
        c,
        {
          variants: Array.from({ length: 2 + Math.floor(r() * 4) }, (_, i) => ({
            name: ['primary', 'ghost', 'outline', 'danger', 'subtle'][i],
            padding: [Math.floor(r() * 4) * 4 + 4, Math.floor(r() * 6) * 4 + 8],
            states: { hover: { opacity: 0.9 }, active: { scale: 0.98 }, disabled: r() > 0.5 ? { opacity: 0.4 } : null },
          })),
          a11y: { minTarget: 44, focusRing: r() > 0.3 },
        },
      ]),
    ),
  };
}

export const SAMPLES = [
  { id: 'markets', name: 'Prediction markets', file: 'markets.json', blurb: 'API response · events → markets → tags', build: markets, view: 'tree' },
  { id: 'missions', name: 'Space missions', file: 'missions.json', blurb: 'Records with dates, numbers & geo', build: missions, view: 'table' },
  { id: 'tokens', name: 'Design tokens', file: 'tokens.json', blurb: 'Deep config with colors & mixed types', build: tokens, view: 'graph' },
];
