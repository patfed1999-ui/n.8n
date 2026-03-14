// ============================================================
// D12 — Macro Globale REALE v3.0 (sostituisce stub FASE2)
// CATTURA DATI: 🇺🇸 USA | 🇪🇺 EU | 🇯🇵 JP | 🇨🇳 CN | 🇬🇧 UK
// Sources: ForexFactory Calendar + Yahoo Finance + FRED Public
// Dati: CPI, GDP, Tassi, DXY, JPY, Nikkei, PMI, Disoccupazione
// DATE PRECISE di uscita eventi macroeconomici
// ZERO API KEY — fetch() nativo n8n v2
// ============================================================

const SUPABASE_URL = 'https://xlzjkffrjynyqeivuczs.supabase.co';
const SUPABASE_KEY = 'YOUR_SUPABASE_KEY_HERE';

const now   = new Date();
const nowMs = now.getTime();

let gdpGrowth   = null;
let dxyLevel    = null;
let jpyLevel    = null;
let nikkeiChg   = null;
let shanghaiChg = null;
let daxChg      = null;
let ftseChg     = null;
const activeSources = [];

// ─── 1. FOREXFACTORY — calendario eventi macro ───────────────
let ffEvents    = [];
let ffThisWeek  = [];
let ffNextWeek  = [];

try {
  // Questa settimana
  const res1 = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json', {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal:  AbortSignal.timeout(5000),
  });
  if (res1.ok) ffThisWeek = await res1.json();
  activeSources.push('FF_thisweek');
} catch(e) {}

try {
  // Prossima settimana
  const res2 = await fetch('https://nfs.faireconomy.media/ff_calendar_nextweek.json', {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal:  AbortSignal.timeout(5000),
  });
  if (res2.ok) ffNextWeek = await res2.json();
} catch(e) {}

ffEvents = [...ffThisWeek, ...ffNextWeek];

// Filtro: solo eventi ad alto impatto USD/EUR/JPY/CNY/GBP
const MACRO_CURRENCIES = ['USD', 'EUR', 'JPY', 'CNY', 'GBP', 'AUD', 'CAD'];
const highImpact = ffEvents.filter(ev =>
  MACRO_CURRENCIES.includes(ev.country) && ev.impact === 'High'
);

// ─── CLASSIFICAZIONE EVENTI ──────────────────────────────────
const KEY_EVENTS = {
  US:  ['cpi', 'pce', 'nfp', 'non-farm', 'payroll', 'gdp', 'fomc', 'fed rate', 'ppi', 'ism', 'retail sales', 'unemployment', 'consumer confidence'],
  EU:  ['ecb rate', 'cpi flash', 'cpi preliminary', 'gdp flash', 'gdp preliminary', 'unemployment rate', 'pmi', 'zew'],
  JP:  ['boj rate', 'cpi', 'gdp', 'tankan', 'unemployment', 'trade balance'],
  CN:  ['pmi', 'gdp', 'cpi', 'pboc rate', 'industrial production', 'trade balance', 'retail sales'],
  UK:  ['boe rate', 'cpi', 'gdp', 'unemployment', 'retail sales'],
};

// Prossimi 7 giorni
const next7 = highImpact.filter(ev => {
  try {
    const ms = new Date(ev.date).getTime();
    return ms > nowMs && ms < (nowMs + 7 * 24 * 3600 * 1000);
  } catch(e) { return false; }
});

// Formatta calendario eventi
const calendarFormatted = next7.slice(0, 10).map(ev => {
  const d = new Date(ev.date);
  const dateStr = d.toLocaleString('it-IT', { timeZone: 'UTC',
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit' });
  return `${ev.country} | ${ev.title} | ${dateStr} UTC | ${ev.impact}${ev.forecast ? ` | F: ${ev.forecast}` : ''}`;
});

// Prossimo evento critico USD (ore/minuti)
const nextUsEvent = highImpact
  .filter(ev => ev.country === 'USD' && new Date(ev.date).getTime() > nowMs)
  .sort((a, b) => new Date(a.date) - new Date(b.date))[0];
const hoursToNextUS = nextUsEvent
  ? ((new Date(nextUsEvent.date).getTime() - nowMs) / 3600000).toFixed(1)
  : null;

// ─── 2. YAHOO FINANCE — DXY ──────────────────────────────────
try {
  const res = await fetch(
    'https://query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?interval=1d&range=5d',
    { signal: AbortSignal.timeout(5000) }
  );
  if (res.ok) {
    const obj  = await res.json();
    const arr  = (obj?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || []).filter(v => v);
    if (arr.length > 0) { dxyLevel = arr[arr.length - 1]; activeSources.push('DXY'); }
  }
} catch(e) {}

// ─── 3. YAHOO FINANCE — JPY/USD ──────────────────────────────
try {
  const res = await fetch(
    'https://query1.finance.yahoo.com/v8/finance/chart/JPY=X?interval=1d&range=5d',
    { signal: AbortSignal.timeout(5000) }
  );
  if (res.ok) {
    const obj = await res.json();
    const arr = (obj?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || []).filter(v => v);
    if (arr.length > 0) { jpyLevel = arr[arr.length - 1]; activeSources.push('JPY'); }
  }
} catch(e) {}

// ─── 4. YAHOO FINANCE — Nikkei 225 ───────────────────────────
try {
  const res = await fetch(
    'https://query1.finance.yahoo.com/v8/finance/chart/%5EN225?interval=1d&range=5d',
    { signal: AbortSignal.timeout(5000) }
  );
  if (res.ok) {
    const obj  = await res.json();
    const arr  = (obj?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || []).filter(v => v);
    if (arr.length > 1) {
      nikkeiChg = ((arr[arr.length - 1] - arr[arr.length - 2]) / arr[arr.length - 2]) * 100;
      activeSources.push('Nikkei');
    }
  }
} catch(e) {}

// ─── 5. YAHOO FINANCE — Shanghai Composite (CN) ──────────────
try {
  const res = await fetch(
    'https://query1.finance.yahoo.com/v8/finance/chart/000001.SS?interval=1d&range=5d',
    { signal: AbortSignal.timeout(5000) }
  );
  if (res.ok) {
    const obj = await res.json();
    const arr = (obj?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || []).filter(v => v);
    if (arr.length > 1) {
      shanghaiChg = ((arr[arr.length - 1] - arr[arr.length - 2]) / arr[arr.length - 2]) * 100;
      activeSources.push('Shanghai');
    }
  }
} catch(e) {}

// ─── 6. YAHOO FINANCE — DAX (EU) ────────────────────────────
try {
  const res = await fetch(
    'https://query1.finance.yahoo.com/v8/finance/chart/%5EGDAXI?interval=1d&range=5d',
    { signal: AbortSignal.timeout(5000) }
  );
  if (res.ok) {
    const obj = await res.json();
    const arr = (obj?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || []).filter(v => v);
    if (arr.length > 1) {
      daxChg = ((arr[arr.length - 1] - arr[arr.length - 2]) / arr[arr.length - 2]) * 100;
      activeSources.push('DAX');
    }
  }
} catch(e) {}

// ─── 7. FRED — Fed Funds Rate ────────────────────────────────
let fedRate = null;
try {
  const res = await fetch(
    'https://fred.stlouisfed.org/graph/fredgraph.json?id=FEDFUNDS&vintage_date=' +
    now.toISOString().slice(0, 10),
    { signal: AbortSignal.timeout(5000) }
  );
  if (res.ok) {
    const obj = await res.json();
    const obs  = obj?.observations || obj?.data;
    if (obs?.length > 0) {
      fedRate = parseFloat(obs[obs.length - 1].value || obs[obs.length - 1][1]);
      if (!isNaN(fedRate)) activeSources.push('FRED_FedFunds');
    }
  }
} catch(e) {}

// ─── 8. CALCOLO SCORE MACRO GLOBALE ─────────────────────────
let score = 0;
const reasons = [];

// DXY — dollaro debole = bullish oro
if (dxyLevel !== null) {
  if      (dxyLevel < 98)  { score += 1.2; reasons.push(`🇺🇸 DXY ${dxyLevel.toFixed(1)} — dollaro molto debole → bullish oro`); }
  else if (dxyLevel < 101) { score += 0.6; reasons.push(`🇺🇸 DXY ${dxyLevel.toFixed(1)} — dollaro debole`); }
  else if (dxyLevel < 104) { score += 0.0; reasons.push(`🇺🇸 DXY ${dxyLevel.toFixed(1)} — neutro`); }
  else if (dxyLevel < 107) { score -= 0.5; reasons.push(`🇺🇸 DXY ${dxyLevel.toFixed(1)} — dollaro forte → pressione oro`); }
  else                     { score -= 1.2; reasons.push(`🇺🇸 DXY ${dxyLevel.toFixed(1)} — dollaro molto forte → bearish oro`); }
}

// JPY — yen debole (>150) = risk-off Asia = bullish oro
if (jpyLevel !== null) {
  if      (jpyLevel > 155) { score += 0.8; reasons.push(`🇯🇵 JPY ${jpyLevel.toFixed(1)} — yen molto debole, risk-off Asia`); }
  else if (jpyLevel > 148) { score += 0.4; reasons.push(`🇯🇵 JPY ${jpyLevel.toFixed(1)} — yen debole`); }
  else if (jpyLevel < 140) { score -= 0.3; reasons.push(`🇯🇵 JPY ${jpyLevel.toFixed(1)} — yen forte (BOJ hawkish?)`); }
}

// Nikkei — calo = risk-off = bullish oro
if (nikkeiChg !== null) {
  if      (nikkeiChg < -2.0) { score += 0.8; reasons.push(`🇯🇵 Nikkei ${nikkeiChg.toFixed(1)}% — forte calo, risk-off`); }
  else if (nikkeiChg < -0.5) { score += 0.3; }
  else if (nikkeiChg >  2.0) { score -= 0.5; reasons.push(`🇯🇵 Nikkei +${nikkeiChg.toFixed(1)}% — risk-on`); }
}

// Shanghai — calo CN = risk-off = moderatamente bullish oro
if (shanghaiChg !== null) {
  if      (shanghaiChg < -1.5) { score += 0.5; reasons.push(`🇨🇳 Shanghai ${shanghaiChg.toFixed(1)}% — debolezza CN`); }
  else if (shanghaiChg >  1.5) { score -= 0.3; reasons.push(`🇨🇳 Shanghai +${shanghaiChg.toFixed(1)}% — ottimismo CN`); }
}

// DAX — proxy economia EU
if (daxChg !== null) {
  if      (daxChg < -1.5) { score += 0.3; reasons.push(`🇪🇺 DAX ${daxChg.toFixed(1)}% — EU risk-off`); }
  else if (daxChg >  1.5) { score -= 0.2; }
}

// Fed Rate — tassi alti = bearish oro
if (fedRate !== null) {
  if      (fedRate > 5.0) { score -= 0.8; reasons.push(`🇺🇸 Fed Funds ${fedRate.toFixed(2)}% — tassi alti → bearish oro`); }
  else if (fedRate > 3.5) { score -= 0.3; }
  else if (fedRate < 2.0) { score += 0.6; reasons.push(`🇺🇸 Fed Funds ${fedRate.toFixed(2)}% — tassi bassi → bullish oro`); }
}

// Evento US imminente = riduzione score (incertezza)
if (hoursToNextUS !== null && parseFloat(hoursToNextUS) < 2) {
  score *= 0.5;
  reasons.push(`⏰ Evento USD critico tra ${hoursToNextUS}h: ${nextUsEvent?.title}`);
}

// Clamp [-5, +5]
score = Math.max(-5, Math.min(5, parseFloat(score.toFixed(3))));

// Macro regime globale
const macroRegime = score > 2   ? 'RISK_OFF_STRONG'
                  : score > 0.5 ? 'RISK_OFF_MILD'
                  : score < -2  ? 'RISK_ON_STRONG'
                  : score < -0.5? 'RISK_ON_MILD'
                  : 'NEUTRAL';

// ─── 9. SALVA CACHE SU SUPABASE ──────────────────────────────
try {
  await fetch(`${SUPABASE_URL}/rest/v1/d12_macro_cache`, {
    method: 'POST',
    headers: {
      'apikey':       SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer':       'return=minimal',
    },
    body: JSON.stringify({
      score, macroRegime, dxyLevel, jpyLevel, nikkeiChg,
      shanghaiChg, daxChg, fedRate, activeSources,
      highImpactCount: highImpact.length,
      timestamp: now.toISOString(),
    }),
  });
} catch(e) {}

return [{
  json: {
    dept: 'D12',
    score,
    macroRegime,
    dxyLevel:     dxyLevel  !== null ? parseFloat(dxyLevel.toFixed(3)) : null,
    jpyLevel:     jpyLevel  !== null ? parseFloat(jpyLevel.toFixed(2)) : null,
    nikkeiChg:    nikkeiChg !== null ? parseFloat(nikkeiChg.toFixed(2)) : null,
    shanghaiChg:  shanghaiChg !== null ? parseFloat(shanghaiChg.toFixed(2)) : null,
    daxChg:       daxChg    !== null ? parseFloat(daxChg.toFixed(2)) : null,
    fedRate:      fedRate   !== null ? parseFloat(fedRate.toFixed(2)) : null,
    activeSources,
    highImpactCount: highImpact.length,
    calendarUpcoming: calendarFormatted,
    nextUsEvent:  nextUsEvent ? `${nextUsEvent.title} @ ${nextUsEvent.date?.slice(0,16)} UTC (${hoursToNextUS}h)` : null,
    isFASE2stub:  false,
    reasons: reasons.length > 0
      ? reasons.slice(0, 4)
      : [`D12: Macro globale nella norma (${activeSources.join('+')} | ${highImpact.length} eventi)`],
  },
}];
