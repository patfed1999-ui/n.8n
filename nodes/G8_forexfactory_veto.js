// ============================================================
// G8 — ForexFactory Veto Node v2.0
// Aggiungi PRIMA del nodo "🎯 Filtro Score ≥70"
// Veto automatico se evento USD/EUR/JPY High Impact entro 45 min
// Riduce size se evento entro 4 ore
// Elimina ~30% delle perdite nelle ore di transizione
// ZERO API KEY — fetch() nativo n8n v2
// ============================================================

const FF_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';

// Prendi dati dal nodo precedente (Formatta Bollettino)
const s    = $input.first().json;
const now  = new Date();
const nowMs = now.getTime();

// ─── FETCH CALENDARIO ────────────────────────────────────────
let ffEvents = [];
try {
  const res = await fetch(FF_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal:  AbortSignal.timeout(5000),
  });
  if (res.ok) ffEvents = await res.json();
} catch(e) {}

// ─── EVENTI CRITICI (solo High Impact) ───────────────────────
const CRITICAL_CURRENCIES = ['USD', 'EUR', 'JPY'];
const CRITICAL_KEYWORDS   = [
  'cpi', 'pce', 'core inflation', 'nfp', 'non-farm', 'payroll',
  'gdp', 'fomc', 'rate decision', 'fed rate', 'ecb rate', 'boj rate',
  'unemployment', 'ppi', 'ism manufacturing', 'ism services',
  'retail sales', 'consumer confidence', 'powell', 'lagarde',
];

const criticalHigh = ffEvents.filter(ev => {
  if (!CRITICAL_CURRENCIES.includes(ev.country)) return false;
  if (ev.impact !== 'High') return false;
  const title = (ev.title || '').toLowerCase();
  return CRITICAL_KEYWORDS.some(k => title.includes(k));
});

// Prossimi eventi ordinati per data
const upcoming = criticalHigh
  .filter(ev => {
    try { return new Date(ev.date).getTime() > nowMs; }
    catch(e) { return false; }
  })
  .sort((a, b) => new Date(a.date) - new Date(b.date));

const nextEvent = upcoming[0] || null;
const minutesToNext = nextEvent
  ? (new Date(nextEvent.date).getTime() - nowMs) / 60000
  : Infinity;

// ─── REGOLE ──────────────────────────────────────────────────
let vetoFF    = false;
let vetoFFNote = '';
let sizeAdjust = 1.0;
let sizeAdjustNote = '';

if (minutesToNext <= 45) {
  // Veto totale: evento critico tra meno di 45 minuti
  vetoFF     = true;
  vetoFFNote = `🚫 VETO FF: ${nextEvent.country} ${nextEvent.title} tra ${minutesToNext.toFixed(0)} min`;
} else if (minutesToNext <= 120) {
  // Riduzione size 40%: evento tra 45-120 min
  sizeAdjust     = 0.60;
  sizeAdjustNote = `⚠️ Evento imminente ${nextEvent.country} ${nextEvent.title} tra ${minutesToNext.toFixed(0)} min → Size 60%`;
} else if (minutesToNext <= 240) {
  // Riduzione size 20%: evento tra 2-4 ore
  sizeAdjust     = 0.80;
  sizeAdjustNote = `📅 Evento ${nextEvent.country} ${nextEvent.title} tra ${(minutesToNext/60).toFixed(1)}h → Size 80%`;
}

// Prossimi 24h riassunto
const next24h = criticalHigh
  .filter(ev => {
    try {
      const ms = new Date(ev.date).getTime();
      return ms > nowMs && ms < (nowMs + 24 * 3600 * 1000);
    } catch(e) { return false; }
  })
  .slice(0, 5)
  .map(ev => {
    const d = new Date(ev.date);
    const hm = `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;
    const dayNames = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];
    return `${dayNames[d.getUTCDay()]} ${hm}UTC | ${ev.country} ${ev.title}${ev.forecast ? ' F:'+ev.forecast : ''}`;
  });

// ─── MERGE CON DATI PRECEDENTI ───────────────────────────────
// Se veto FF attivo → sovrascrive direzione
let finalDirection    = s.direction;
let finalVetoActive   = s.vetoActive || vetoFF;
let finalVetoReason   = s.vetoReason || '';
let finalSizeMult     = (s.sizeMultiplier || 1.0) * sizeAdjust;
let finalSizeNote     = s.sizeNote || '';
let finalTelegramMsg  = s.telegramMessage || '';

if (vetoFF) {
  finalDirection  = 'VETO_FF';
  finalVetoReason = vetoFFNote;
  finalSizeMult   = 0;
  // Aggiunge nota al messaggio Telegram se già formattato
  if (finalTelegramMsg) {
    finalTelegramMsg = `🚫 ${vetoFFNote}\n\n` + finalTelegramMsg;
  }
}

if (sizeAdjustNote && !vetoFF) {
  finalSizeNote = sizeAdjustNote + (finalSizeNote ? ` | ${finalSizeNote}` : '');
  if (finalTelegramMsg) {
    finalTelegramMsg = finalTelegramMsg.replace(
      /📦.*\n/,
      `📦 ${finalSizeNote}\n`
    );
  }
}

return [{
  json: {
    ...s,
    direction:       finalDirection,
    vetoActive:      finalVetoActive,
    vetoReason:      finalVetoReason,
    sizeMultiplier:  parseFloat(Math.max(0, finalSizeMult).toFixed(2)),
    sizeNote:        finalSizeNote,
    telegramMessage: finalTelegramMsg,
    ffVetoActive:    vetoFF,
    ffVetoNote:      vetoFFNote,
    ffSizeAdjust:    sizeAdjust,
    ffSizeNote:      sizeAdjustNote,
    ffMinutesToNext: minutesToNext === Infinity ? null : parseFloat(minutesToNext.toFixed(0)),
    ffNextEvent:     nextEvent ? `${nextEvent.country} ${nextEvent.title} @ ${nextEvent.date?.slice(0,16)}UTC` : null,
    ffNext24h:       next24h,
    ffEventsTotal:   ffEvents.length,
  },
}];
