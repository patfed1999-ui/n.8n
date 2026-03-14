// ============================================================
// D5B — OSINT Geopolitico REALE v3.0 (sostituisce stub FASE2)
// Sources: GDELT Project API + ReliefWeb ONU + ACLED + Crisis24
// Black Swan Detector — regime_override RISK_OFF_EXTREME
// ZERO API KEY — fetch() nativo n8n v2
// ============================================================

const BLACK_SWAN_KW = [
  'nuclear strike', 'nuclear attack', 'nuclear war', 'world war', 'ww3',
  'market crash', 'financial crisis', 'bank collapse', 'pandemic',
  'terrorist attack', 'assassination', 'coup', 'martial law',
  'sovereign default', 'flash crash', 'circuit breaker',
  'catastrophic', 'catastrophe', 'systemic',
];

const GEO_BULLISH_KW = [
  'conflict', 'war', 'sanctions', 'military', 'escalation', 'invasion',
  'strike', 'crisis', 'tension', 'embargo', 'blockade', 'troops',
  'offensive', 'missile', 'explosion', 'attack', 'protest', 'unrest',
  'riot', 'drone', 'artillery', 'airstrike', 'shooting', 'weapons',
  'ceasefire failed', 'coup', 'cyber attack', 'hack', 'espionage',
  'trade war', 'tariffs', 'retaliation', 'pipeline', 'strait',
];

const GEO_BEARISH_KW = [
  'ceasefire', 'peace deal', 'agreement', 'de-escalation', 'withdrawal',
  'talks', 'diplomacy', 'treaty', 'accord', 'resolution', 'truce',
  'normalize', 'rapprochement',
];

let events = [];
let blackSwanDetected  = false;
let blackSwanReason    = '';
const fetchedSources   = [];
const allTitles        = [];

// ─── FONTE 1: GDELT — articoli ultimi 60 min ─────────────────
try {
  const q = encodeURIComponent('gold OR war OR sanctions OR conflict OR nuclear OR fed OR crisis');
  const res = await fetch(
    `https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=artlist&maxrecords=30&format=json&timespan=60min`,
    { signal: AbortSignal.timeout(5000) }
  );
  if (res.ok) {
    const obj = await res.json();
    for (const a of (obj.articles || [])) {
      if (a.title) { events.push({ title: a.title, src: 'gdelt' }); allTitles.push(a.title); }
    }
    if (events.length > 0) fetchedSources.push('gdelt');
  }
} catch(e) {}

// ─── FONTE 2: GDELT TV — breaking news ultimi 120 min ────────
try {
  const q = encodeURIComponent('gold sanctions war nuclear');
  const res = await fetch(
    `https://api.gdeltproject.org/api/v2/tv/tv?query=${q}&mode=clipgallery&maxrecords=15&format=json&timespan=120min`,
    { signal: AbortSignal.timeout(5000) }
  );
  if (res.ok) {
    const obj = await res.json();
    for (const c of (obj.clips || [])) {
      if (c.snippet) {
        const t = c.snippet.slice(0, 200);
        events.push({ title: t, src: 'gdelt_tv' });
        allTitles.push(t);
      }
    }
    if ((obj.clips || []).length > 0) fetchedSources.push('gdelt_tv');
  }
} catch(e) {}

// ─── FONTE 3: ReliefWeb ONU ───────────────────────────────────
try {
  const res = await fetch(
    'https://reliefweb.int/updates/rss.xml?source=UN+OCHA&type=News',
    { signal: AbortSignal.timeout(4000) }
  );
  if (res.ok) {
    const xml = await res.text();
    let count = 0;
    for (const m of xml.matchAll(/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/gs)) {
      const t = m[1].replace(/<[^>]+>/g, '').trim();
      if (t.length > 10) { events.push({ title: t, src: 'reliefweb' }); allTitles.push(t); count++; }
    }
    if (count > 0) fetchedSources.push('reliefweb');
  }
} catch(e) {}

// ─── FONTE 4: ACLED Conflict Data ────────────────────────────
try {
  const res = await fetch('https://acleddata.com/feed/', {
    signal: AbortSignal.timeout(4000),
  });
  if (res.ok) {
    const xml = await res.text();
    let count = 0;
    for (const m of xml.matchAll(/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/gs)) {
      const t = m[1].replace(/<[^>]+>/g, '').trim();
      if (t.length > 10) { events.push({ title: t, src: 'acled' }); allTitles.push(t); count++; }
    }
    if (count > 0) fetchedSources.push('acled');
  }
} catch(e) {}

// ─── Fallback se tutto offline ────────────────────────────────
if (events.length === 0) {
  return [{
    json: {
      dept: 'D5B',
      score: 0,
      blackSwanDetected: false,
      blackSwanReason:   '',
      geopoliticalRisk:  0,
      eventCount:        0,
      regime_override:   null,
      fetchSource:       'all_failed',
      isFASE2stub:       false,
      reasons:           ['D5B: Nessuna fonte disponibile — score neutro (rete o API offline)'],
    },
  }];
}

// ─── NLP GEOPOLITICO ─────────────────────────────────────────
let geoScore  = 0;
let bearScore = 0;
const matchedBull = [];
const matchedBear = [];

for (const ev of events) {
  const text = (ev.title || '').toLowerCase();

  // Black Swan check
  for (const kw of BLACK_SWAN_KW) {
    if (text.includes(kw)) {
      blackSwanDetected = true;
      blackSwanReason   = (ev.title || '').slice(0, 150);
      break;
    }
  }

  for (const kw of GEO_BULLISH_KW) {
    if (text.includes(kw)) { geoScore += 0.08; matchedBull.push(kw); }
  }
  for (const kw of GEO_BEARISH_KW) {
    if (text.includes(kw)) { bearScore += 0.06; matchedBear.push(kw); }
  }
}

const geopoliticalRisk = blackSwanDetected
  ? 1.0
  : Math.min(Math.max(geoScore - bearScore, 0), 1.0);

// Score normalizzato [-5, +5]
const rawScore = blackSwanDetected
  ? 5.0
  : geopoliticalRisk > 0.5
    ? parseFloat((geopoliticalRisk * 5).toFixed(2))
    : parseFloat((geopoliticalRisk * 3).toFixed(2));

const score = Math.max(-5, Math.min(5, rawScore - (bearScore * 2)));

const uniqBull = [...new Set(matchedBull)].slice(0, 6);
const uniqBear = [...new Set(matchedBear)].slice(0, 3);
const topTitles = [...new Set(allTitles)].slice(0, 5);

return [{
  json: {
    dept:             'D5B',
    score:            parseFloat(score.toFixed(3)),
    blackSwanDetected,
    blackSwanReason,
    blackSwanAlert:   blackSwanDetected,
    geopoliticalRisk: parseFloat(geopoliticalRisk.toFixed(3)),
    eventCount:       events.length,
    fetchSource:      fetchedSources.join('+') || 'none',
    matchedKeywords:  uniqBull,
    topTitles,
    regime_override:  blackSwanDetected ? 'RISK_OFF_EXTREME' : null,
    geoRisk:          geopoliticalRisk > 0.7 ? 'HIGH' : geopoliticalRisk > 0.3 ? 'MEDIUM' : 'LOW',
    isFASE2stub:      false,
    reasons: blackSwanDetected
      ? [`🚨 D5B: BLACK SWAN RILEVATO — ${blackSwanReason.slice(0, 100)}`]
      : geopoliticalRisk > 0.5
        ? [`D5B: Geo-risk ${(geopoliticalRisk * 100).toFixed(0)}% — ${uniqBull.slice(0,3).join(', ')} | ${fetchedSources.join('+')}`]
        : uniqBear.length > 0
          ? [`D5B: De-escalation (${uniqBear.join(', ')}) — sentiment calmo`]
          : [`D5B: Scenario normale (${fetchedSources.join('+')} | ${events.length} eventi)`],
  },
}];
