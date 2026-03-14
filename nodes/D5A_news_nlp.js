// ============================================================
// D5A — News NLP REALE v3.0 (sostituisce stub FASE2)
// Sources: Reuters, BBC, Al Jazeera, MarketWatch, Kitco, Bloomberg
// NLP pesato su titoli — focus gold/USD/macro bullish/bearish
// ZERO API KEY — fetch() nativo n8n v2
// ============================================================

const KEYWORDS = {
  bullish: [
    { w: 'war',          v: 1.5 }, { w: 'conflict',      v: 1.4 },
    { w: 'sanctions',    v: 1.3 }, { w: 'nuclear',        v: 2.0 },
    { w: 'recession',    v: 1.4 }, { w: 'gold demand',    v: 1.6 },
    { w: 'safe haven',   v: 1.5 }, { w: 'rate cut',       v: 1.4 },
    { w: 'attack',       v: 1.4 }, { w: 'tensions',       v: 1.3 },
    { w: 'debt crisis',  v: 1.5 }, { w: 'bank run',       v: 1.7 },
    { w: 'stagflation',  v: 1.4 }, { w: 'invasion',       v: 1.6 },
    { w: 'escalation',   v: 1.4 }, { w: 'tariff',         v: 1.3 },
    { w: 'trade war',    v: 1.4 }, { w: 'gold rally',     v: 1.4 },
    { w: 'gold hits',    v: 1.3 }, { w: 'gold record',    v: 1.5 },
    { w: 'gold surge',   v: 1.4 }, { w: 'dollar weak',    v: 1.3 },
    { w: 'dollar falls', v: 1.2 }, { w: 'uncertainty',    v: 1.1 },
    { w: 'default',      v: 1.4 }, { w: 'crisis',         v: 1.2 },
    { w: 'fed cut',      v: 1.4 }, { w: 'fed pivot',      v: 1.5 },
    { w: 'risk off',     v: 1.3 }, { w: 'flight to',      v: 1.3 },
    { w: 'geopolit',     v: 1.2 }, { w: 'missile',        v: 1.5 },
    { w: 'explosion',    v: 1.4 }, { w: 'shoot down',     v: 1.3 },
    { w: 'cpi beats',    v: 1.2 }, { w: 'inflation high',  v: 1.2 },
  ],
  bearish: [
    { w: 'rate hike',       v: 1.4 }, { w: 'dollar strong',  v: 1.3 },
    { w: 'gold drops',      v: 1.4 }, { w: 'gold falls',     v: 1.4 },
    { w: 'gold sell',       v: 1.3 }, { w: 'ceasefire',      v: 1.3 },
    { w: 'fed hike',        v: 1.4 }, { w: 'tightening',     v: 1.2 },
    { w: 'peace deal',      v: 1.2 }, { w: 'risk on',        v: 1.2 },
    { w: 'de-escalation',   v: 1.2 }, { w: 'agreement',      v: 1.0 },
    { w: 'strong economy',  v: 1.1 }, { w: 'recovery',       v: 0.9 },
    { w: 'gold pressure',   v: 1.2 }, { w: 'gold retreats',  v: 1.2 },
    { w: 'dollar rises',    v: 1.1 }, { w: 'hawkish',        v: 1.3 },
  ],
};

// Moltiplicatore se il titolo riguarda direttamente l'oro
const GOLD_MULTIPLIER = 1.8;
const GOLD_TERMS = ['gold', 'xau', 'bullion', 'precious metal', 'safe haven asset'];

const RSS_FEEDS = [
  { url: 'https://feeds.reuters.com/reuters/businessNews',       name: 'Reuters Business' },
  { url: 'https://feeds.reuters.com/reuters/worldNews',          name: 'Reuters World' },
  { url: 'https://www.aljazeera.com/xml/rss/all.xml',            name: 'Al Jazeera' },
  { url: 'https://feeds.bbci.co.uk/news/world/rss.xml',          name: 'BBC World' },
  { url: 'https://feeds.bbci.co.uk/news/business/rss.xml',       name: 'BBC Business' },
  { url: 'https://www.marketwatch.com/rss/topstories',           name: 'MarketWatch' },
  { url: 'https://www.kitco.com/rss/kitcogoldnews.xml',          name: 'Kitco Gold' },
  { url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', name: 'DJ TopStories' },
];

const headlines = [];
const sourcesOk  = [];
const sourcesErr = [];

for (const feed of RSS_FEEDS) {
  try {
    const res = await fetch(feed.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GoldBot/3.0)' },
      signal: AbortSignal.timeout(4500),
    });
    if (!res.ok) { sourcesErr.push(feed.name); continue; }
    const xml = await res.text();
    let count = 0;
    for (const m of xml.matchAll(/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/gs)) {
      const t = m[1].replace(/<[^>]+>/g, '').trim();
      if (t.length > 12 && t.length < 350) { headlines.push(t); count++; }
    }
    if (count > 0) sourcesOk.push(feed.name);
  } catch(e) { sourcesErr.push(feed.name); }
}

// ─── NLP ─────────────────────────────────────────────────────
let bullishScore = 0;
let bearishScore = 0;
const matchedBullish = [];
const matchedBearish = [];
const goldHeadlines  = [];

for (const title of headlines) {
  const text = title.toLowerCase();
  const isGold = GOLD_TERMS.some(t => text.includes(t));
  const mult = isGold ? GOLD_MULTIPLIER : 1.0;

  if (isGold) goldHeadlines.push(title.slice(0, 90));

  for (const kw of KEYWORDS.bullish) {
    if (text.includes(kw.w)) { bullishScore += kw.v * mult; matchedBullish.push(kw.w); }
  }
  for (const kw of KEYWORDS.bearish) {
    if (text.includes(kw.w)) { bearishScore += kw.v * mult; matchedBearish.push(kw.w); }
  }
}

const total = bullishScore + bearishScore;
// Score normalizzato [-5, +5] per compatibilità CERVELLO CIO
const rawNlp   = total > 0 ? (bullishScore - bearishScore) / total : 0;
const nlpScore = parseFloat((rawNlp * 5).toFixed(3));

const topBullish = [...new Set(matchedBullish)].slice(0, 5);
const topBearish = [...new Set(matchedBearish)].slice(0, 5);
const topGold    = [...new Set(goldHeadlines)].slice(0, 5);

const sentiment = nlpScore > 0.5 ? 'BULLISH' : nlpScore < -0.5 ? 'BEARISH' : 'NEUTRAL';

// Black Swan quick detect
const blackSwanTerms = ['nuclear', 'world war', 'ww3', 'market crash', 'bank collapse', 'martial law'];
const blackSwanAlert = headlines.some(h =>
  blackSwanTerms.some(t => h.toLowerCase().includes(t))
);

return [{
  json: {
    dept: 'D5_NEWS_NLP',
    score:        nlpScore,
    bullishScore: parseFloat(bullishScore.toFixed(1)),
    bearishScore: parseFloat(bearishScore.toFixed(1)),
    sentiment,
    blackSwanAlert,
    headlineCount: headlines.length,
    goldHeadlines: topGold,
    topHeadlines:  topGold.length > 0 ? topGold : headlines.slice(0, 3),
    topBullish,
    topBearish,
    sourcesOk,
    sourcesErr,
    isFASE2stub: false,
    reasons: blackSwanAlert
      ? [`🚨 D5A: BLACK SWAN rilevato — alert massimo`]
      : nlpScore > 0.5
        ? [`D5A: News bullish XAU (${topBullish.slice(0,3).join(', ')}) | ${topGold[0]?.slice(0,60) || ''}`]
        : nlpScore < -0.5
          ? [`D5A: News bearish (${topBearish.slice(0,3).join(', ')})`]
          : [`D5A: Sentiment neutrale — ${headlines.length} titoli da ${sourcesOk.length} fonti`],
  },
}];
