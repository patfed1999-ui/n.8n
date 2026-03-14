// ============================================================
// D4_BC — Banche Centrali REALE v3.0
// Sources: ForexFactory Calendar (JSON) + Fed RSS + ECB RSS
// Cattura: US CPI, NFP, FOMC, GDP, PCE + EU CPI, ECB Rate + JP BOJ + CN PMI
// Dovish = bullish oro (score +) | Hawkish = bearish oro (score -)
// ZERO API KEY — fetch() nativo n8n v2
// ============================================================

const FF_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
const now = new Date();
const nowMs = now.getTime();

// ─── PAROLE CHIAVE HAWKISH / DOVISH ──────────────────────────
const HAWKISH_KW = [
  { w: 'rate hike',      v: 1.6 }, { w: 'hike',           v: 1.1 },
  { w: 'tightening',    v: 1.3 }, { w: 'hawkish',         v: 1.5 },
  { w: 'restrictive',   v: 1.2 }, { w: 'above target',    v: 1.0 },
  { w: 'overheat',      v: 1.1 }, { w: 'aggressive',      v: 1.0 },
  { w: 'further hikes', v: 1.4 }, { w: 'remain elevated', v: 1.2 },
];
const DOVISH_KW = [
  { w: 'rate cut',      v: 1.6 }, { w: 'cut rates',       v: 1.5 },
  { w: 'easing',        v: 1.3 }, { w: 'dovish',          v: 1.5 },
  { w: 'stimulus',      v: 1.2 }, { w: 'pause',           v: 1.2 },
  { w: 'pivot',         v: 1.5 }, { w: 'below target',    v: 1.0 },
  { w: 'slowdown',      v: 1.1 }, { w: 'concern',         v: 0.9 },
  { w: 'accommodative', v: 1.2 }, { w: 'lower rates',     v: 1.3 },
  { w: 'data dependent',v: 0.8 }, { w: 'patient',         v: 0.9 },
];

// ─── 1. FOREXFACTORY CALENDAR ─────────────────────────────────
let ffEvents = [];
try {
  const res = await fetch(FF_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible)' },
    signal: AbortSignal.timeout(5000),
  });
  if (res.ok) ffEvents = await res.json();
} catch(e) {}

// Valute rilevanti per oro
const RELEVANT = ['USD', 'EUR', 'JPY', 'CNY', 'GBP', 'AUD'];
const highImpact = ffEvents.filter(ev =>
  RELEVANT.includes(ev.country) && (ev.impact === 'High' || ev.impact === 'Medium')
);

// ─── 2. EVENTI CRITICI PROSSIME 24H ──────────────────────────
const CRITICAL_EVENTS = ['cpi', 'nfp', 'fomc', 'fed rate', 'rate decision',
  'gdp', 'pce', 'payroll', 'non-farm', 'ppi', 'core inflation',
  'boj', 'ecb rate', 'boe rate', 'rba rate', 'pboc', 'employment'];

const upcomingCritical = highImpact.filter(ev => {
  try {
    const evMs = new Date(ev.date).getTime();
    const title = (ev.title || '').toLowerCase();
    const isCritical = CRITICAL_EVENTS.some(k => title.includes(k));
    return isCritical && evMs > nowMs && evMs < (nowMs + 24 * 3600 * 1000);
  } catch(e) { return false; }
});

// Veto se evento critico entro 45 min
const vetoUpcoming = upcomingCritical.some(ev => {
  try {
    const evMs = new Date(ev.date).getTime();
    return evMs > nowMs && evMs < (nowMs + 45 * 60 * 1000);
  } catch(e) { return false; }
});

// ─── 3. EVENTI RECENTI (ultime 4h) CON ACTUAL vs FORECAST ────
const recentEvents = highImpact.filter(ev => {
  try {
    const evMs = new Date(ev.date).getTime();
    return evMs <= nowMs && evMs > (nowMs - 4 * 3600 * 1000) &&
           ev.actual !== undefined && ev.actual !== '';
  } catch(e) { return false; }
});

// Score da dati macroeconomici usciti vs attese
let dataScore = 0;
const dataReasons = [];

for (const ev of recentEvents) {
  try {
    const clean = s => parseFloat((s || '0')
      .replace(/[KkMm]$/, m => m === 'K' || m === 'k' ? '000' : '000000')
      .replace('%', '').replace(',', '') || '0');
    const actual   = clean(ev.actual);
    const forecast = clean(ev.forecast);
    const title    = (ev.title || '').toLowerCase();
    const beat     = actual > forecast;
    const miss     = actual < forecast;

    // US data
    if (ev.country === 'USD') {
      if (title.includes('cpi') || title.includes('core inflation') || title.includes('pce')) {
        // Inflazione USA alta → Fed hawkish → bearish oro
        const delta = beat ? -0.40 : 0.40;
        dataScore += delta;
        dataReasons.push(`🇺🇸 CPI/PCE USA ${beat ? '⬆️ SOPRA' : '⬇️ SOTTO'} attese (${ev.actual} vs ${ev.forecast}) → ${beat ? 'bearish' : 'bullish'} oro`);
      } else if (title.includes('non-farm') || title.includes('payroll') || title.includes('nfp')) {
        const delta = beat ? -0.30 : 0.25;
        dataScore += delta;
        dataReasons.push(`🇺🇸 NFP ${beat ? '⬆️ FORTE' : '⬇️ DEBOLE'} (${ev.actual} vs ${ev.forecast}) → ${beat ? 'bearish' : 'bullish'} oro`);
      } else if (title.includes('gdp')) {
        const delta = beat ? -0.20 : 0.30;
        dataScore += delta;
        dataReasons.push(`🇺🇸 GDP USA ${beat ? 'forte' : 'debole'} (${ev.actual})`);
      } else if (title.includes('unemployment') || title.includes('jobless')) {
        // Disoccupazione alta → bad economy → bullish oro
        dataScore += beat ? 0.20 : -0.15;
        dataReasons.push(`🇺🇸 Disoccupazione ${beat ? '⬆️ alta' : 'bassa'}`);
      }
    }
    // EU / ECB data
    if (ev.country === 'EUR') {
      if (title.includes('cpi') || title.includes('inflation')) {
        dataScore += beat ? -0.20 : 0.25;
        dataReasons.push(`🇪🇺 CPI EU ${beat ? 'sopra' : 'sotto'} attese`);
      } else if (title.includes('gdp')) {
        dataScore += beat ? -0.10 : 0.20;
        dataReasons.push(`🇪🇺 GDP EU ${beat ? 'solido' : 'debole'}`);
      }
    }
    // JP / BOJ data
    if (ev.country === 'JPY') {
      if (title.includes('cpi')) {
        dataScore += beat ? 0.15 : -0.10; // JP inflation alta → BOJ hawkish → yen forte → lieve bearish oro
        dataReasons.push(`🇯🇵 CPI JP ${beat ? 'sopra' : 'sotto'}`);
      }
    }
    // CN data
    if (ev.country === 'CNY') {
      if (title.includes('pmi') || title.includes('gdp') || title.includes('trade')) {
        // Cina forte → risk-on → lieve bearish oro
        dataScore += beat ? -0.15 : 0.20;
        dataReasons.push(`🇨🇳 ${ev.title} ${beat ? 'forte' : 'debole'}`);
      }
    }
  } catch(e) {}
}

// ─── 4. RSS BANCHE CENTRALI ───────────────────────────────────
const RSS_URLS = [
  'https://www.federalreserve.gov/feeds/press_all.xml',
  'https://www.ecb.europa.eu/rss/fst.html',
];

let hawkish = 0, dovish = 0;
const matchedH = [], matchedD = [];

for (const url of RSS_URLS) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) continue;
    const xml = await res.text();
    const titles = [];
    for (const m of xml.matchAll(/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/gs)) {
      const t = m[1].replace(/<[^>]+>/g, '').trim();
      if (t.length > 8) titles.push(t.toLowerCase());
    }
    for (const t of titles) {
      for (const kw of HAWKISH_KW) if (t.includes(kw.w)) { hawkish += kw.v; matchedH.push(kw.w); }
      for (const kw of DOVISH_KW)  if (t.includes(kw.w)) { dovish  += kw.v; matchedD.push(kw.w); }
    }
  } catch(e) {}
}

// ─── 5. SCORE FINALE ─────────────────────────────────────────
const total = hawkish + dovish;
const cbRaw = total > 0 ? (dovish - hawkish) / total : 0;
// Normalizza: [-1, +1] → [-5, +5] per compatibilità con gli altri dipartimenti
const finalScore = Math.max(-5, Math.min(5,
  (cbRaw * 3) + (dataScore * 2)
));

const cbTone = finalScore > 0.5 ? 'DOVISH' : finalScore < -0.5 ? 'HAWKISH' : 'NEUTRAL';

// Tabella eventi in arrivo (stringa leggibile)
const upcomingStr = upcomingCritical.slice(0, 4).map(ev =>
  `${ev.country} ${ev.title} @ ${ev.date?.slice(11, 16) || 'N/A'} UTC`
);

// Settimana prossima: eventi importanti
const nextWeekCritical = highImpact
  .filter(ev => new Date(ev.date).getTime() > nowMs)
  .slice(0, 5)
  .map(ev => `${ev.country} ${ev.title}`);

return [{
  json: {
    dept: 'D4_BC',
    score: parseFloat(finalScore.toFixed(3)),
    cbTone,
    fedTone: cbTone,
    hawkishScore:    parseFloat(hawkish.toFixed(1)),
    dovishScore:     parseFloat(dovish.toFixed(1)),
    dataScore:       parseFloat(dataScore.toFixed(2)),
    vetoUpcoming,
    upcomingCritical: upcomingStr,
    nextWeekEvents:   nextWeekCritical,
    recentDataEvents: dataReasons,
    ffEventsTotal:    ffEvents.length,
    highImpactCount:  highImpact.length,
    isFASE2stub: false,
    reasons: vetoUpcoming
      ? [`D4_BC: 🚫 VETO — Evento critico <45min: ${upcomingStr[0] || 'N/A'}`]
      : finalScore > 0.5
        ? [`D4_BC: 🕊️ Banche centrali DOVISH (${finalScore.toFixed(2)}) — supporto oro | ${dataReasons[0] || matchedD.slice(0,2).join(', ')}`]
        : finalScore < -0.5
          ? [`D4_BC: 🦅 Banche centrali HAWKISH (${finalScore.toFixed(2)}) — pressione oro | ${dataReasons[0] || matchedH.slice(0,2).join(', ')}`]
          : [`D4_BC: Banche centrali neutrali | ${highImpact.length} eventi alta/media imp. questa settimana`],
  },
}];
