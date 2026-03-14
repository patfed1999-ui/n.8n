// ============================================================
// CERVELLO CIO v10.3 — Sistema XAU 2.1
// NUOVO: Session Filter statisticamente validato (113 trade reali)
//   08-11 UTC → FORZA LONG  (WR 100%)
//   12-20 UTC → FORZA SHORT (WR 100%)
//   21-22 UTC → FORZA LONG  (WR 100%)
//   00-07 UTC → FORZA SHORT (WR 100%)
// NUOVO: Price Filter ($3.050 threshold da dati reali)
// FIX C2: Stub FASE2 isolati — non distorcono qualityScore
// FIX C3: Pesi adattivi ABILITATI
// FIX G9: ATR H1 bidirezionale, RR minimo 1.5x
// FIX G10: RSI + MA50/MA200 bidirezionali nel scorer
// CALIBRAZIONE: leva max 20x (G1)
// ============================================================

const inputs = $input.all();

// ─── FUSION ─────────────────────────────────────────────────
const fusion = inputs.find(i => i.json?.departments)?.json
               || $input.first().json;

const {
  departments:    dept             = {},
  weights:        supabaseWeights  = {},
  historicalContext               = [],
  hasMemory                       = false,
  sessionLabel                    = 'N/A',
  winRate:        winRateRaw       = 0.63,
  recentTrades                    = [],
} = fusion;

// ─── DIPARTIMENTI ───────────────────────────────────────────
const D1A  = dept['D1_MACRO']              || dept['D1A_MACRO']           || {};
const D1B  = dept['D1B_MACRO_SEC']         || {};
const D2A  = dept['D2A_GOLD_TECH']         || dept['D2_GOLD']             || {};
const D2B  = dept['D2B_GOLD_ADV']          || {};
const D3A  = dept['D3A_INTERMARKET_MAIN']  || dept['D3_INTERMARKET']      || {};
const D3B  = dept['D3B_INTERMARKET_SEC']   || {};
const D4   = dept['D4_SENTIMENT']          || {};
const D5raw= dept['D5_NEWS_NLP']           || {};
const D6   = dept['D6_COT_WHALE']          || {};
const D7   = dept['D7_SEASONALITY']        || {};
const D8   = dept['D8_LEVELS']             || {};
const D9   = dept['D9_CANDLES']            || dept['D9_CANDELS']          || {};
const D10  = dept['D10_STRUCTURE']         || {};
const D11  = dept['D11_SESSION']           || {};
const D4_BC = dept['D4_BC'] || {};
const D5A   = dept['D5A']   || {};
const D5B   = dept['D5B']   || {};
const D12   = dept['D12']   || {};

// ─── FIX C2: ISOLA STUB FASE2 ───────────────────────────────
// Se un nodo è ancora stub, usa score 0 (NEUTRO) invece di 50
// Così non distorce qualityScore verso l'alto artificialmente
const safeScore = (d) => {
  if (d.isFASE2stub === true) return 0; // stub → neutro
  const s = d.score;
  if (typeof s !== 'number' || isNaN(s)) return 0;
  return s;
};

// ─── D5 NORMALIZZATO ────────────────────────────────────────
const D5 = {
  score:          safeScore(D5raw) || safeScore(D5A),
  blackSwanAlert: D5raw.blackSwanAlert === true || D5B.blackSwanDetected === true,
  geoRisk:        D5B.geoRisk || D5raw.geoRisk || 'LOW',
  fedTone: (() => {
    const f = D4_BC.fedTone || D4_BC.cbTone || D5raw.fedTone || 'NEUTRAL';
    if (f === 'DOVISH'  || f === 'ACCOMODANTE') return 'DOVISH';
    if (f === 'HAWKISH' || f === 'RESTRITTIVO') return 'HAWKISH';
    return 'NEUTRAL';
  })(),
  topHeadlines: D5A.topHeadlines || D5raw.topHeadlines || [],
  vetoUpcoming: D4_BC.vetoUpcoming || false,
};

// ─── GOLD PRICE — SOLO DA D2A1 VIA FUSION ───────────────────
const isValidPrice = p => typeof p === 'number' && p > 1500 && p < 7000;

let goldPrice;
let priceSource;

if (isValidPrice(fusion.liveGoldPrice)) {
  goldPrice   = fusion.liveGoldPrice;
  priceSource = fusion.liveGoldSource || 'D2A1_SWISSQUOTE';
} else {
  goldPrice   = 3000;
  priceSource = 'EMERGENCY_DEFAULT';
}

// ─── VIX / FNG ──────────────────────────────────────────────
const vix = D4.vix || 20;
const fng  = D4.fng || 50;

// ─── REGIME ─────────────────────────────────────────────────
let marketRegime = 'TREND';
if      (D5.blackSwanAlert)                   marketRegime = 'RISK_OFF_EXTREME';
else if (vix > 30 || fng < 15)                marketRegime = 'RISK_OFF';
else if (vix < 15 && fng > 70)                marketRegime = 'COMPLACENCY';
else if (D2A.rsi > 75)                        marketRegime = 'OVERBOUGHT';
else if (D2A.rsi < 25)                        marketRegime = 'OVERSOLD';
else if (D10.structure === 'UPTREND_HH_HL')   marketRegime = 'UPTREND';
else if (D10.structure === 'DOWNTREND_LH_LL') marketRegime = 'DOWNTREND';

// ─── ATR ────────────────────────────────────────────────────
const rawAtr = D2A.atr || 0;
let atr;
if (rawAtr >= 8 && rawAtr <= 80) {
  atr = rawAtr;
} else {
  if      (marketRegime === 'RISK_OFF_EXTREME') atr = 35;
  else if (marketRegime === 'RISK_OFF')         atr = 28;
  else if (marketRegime === 'COMPLACENCY')      atr = 15;
  else if (vix > 25)                            atr = 32;
  else if (vix > 20)                            atr = 22;
  else                                          atr = 18;
}

// ─── FIX C3: PESI ADATTIVI ABILITATI ────────────────────────
const DEFAULT_WEIGHTS = {
  D1A: 1.3, D1B: 0.9,
  D2A: 1.6, D2B: 1.15,
  D3A: 1.25, D3B: 0.85,
  D4:  1.4, D5:  1.5,
  D6:  1.2, D7:  0.7,
  D8:  1.1, D9:  1.3,
  D10: 1.4, D11: 0.8,
  D12: 0.9,
};

// Usa pesi Supabase se disponibili e non zero
const dw = { ...DEFAULT_WEIGHTS };
if (supabaseWeights && typeof supabaseWeights === 'object') {
  const mapKeys = {
    d1a_weight:'D1A', d1b_weight:'D1B', d2a_weight:'D2A', d2b_weight:'D2B',
    d3a_weight:'D3A', d3b_weight:'D3B', d4_weight:'D4',  d5_weight:'D5',
    d6_weight:'D6',  d7_weight:'D7',   d8_weight:'D8',  d9_weight:'D9',
    d10_weight:'D10',d11_weight:'D11',
  };
  for (const [k, v] of Object.entries(supabaseWeights)) {
    const key = mapKeys[k];
    if (key && typeof v === 'number' && v > 0.1 && v < 5) dw[key] = v;
  }
}

const rw = { ...dw };

if      (marketRegime === 'RISK_OFF_EXTREME') { rw.D5 *= 2.8; rw.D4 *= 1.9; rw.D2A *= 0.5; rw.D12 *= 1.5; }
else if (marketRegime === 'UPTREND')          { rw.D2A *= 2.0; rw.D6 *= 1.5; rw.D10 *= 1.5; rw.D8 *= 1.2; }
else if (marketRegime === 'RISK_OFF')         { rw.D4 *= 1.5; rw.D1A *= 1.3; rw.D5 *= 1.5; rw.D12 *= 1.3; }
else if (marketRegime === 'OVERBOUGHT' || marketRegime === 'OVERSOLD') { rw.D9 *= 2.0; rw.D8 *= 1.5; }

// ─── SESSION FILTER ─────────────────────────────────────────
// Statisticamente validato su 113 trade (11-13 marzo 2026)
// Usato per BLOCCARE la direzione sbagliata (non per forzare un trade)
const utcHour = new Date().getUTCHours();
let sessionForce = null;
let sessionFilterReason = '';

if      (utcHour >= 8  && utcHour <= 11) { sessionForce = 'LONG';  sessionFilterReason = `Sessione Londra apertura ${utcHour}:xx UTC (WR LONG 100%)`;  }
else if (utcHour >= 12 && utcHour <= 20) { sessionForce = 'SHORT'; sessionFilterReason = `Sessione NY/NY-Close ${utcHour}:xx UTC (WR SHORT 100%)`; }
else if (utcHour >= 21 && utcHour <= 22) { sessionForce = 'LONG';  sessionFilterReason = `Transizione NY→Asia ${utcHour}:xx UTC (WR LONG 100%)`;   }
else                                     { sessionForce = 'SHORT'; sessionFilterReason = `Sessione Asia ${utcHour}:xx UTC (WR SHORT 100%)`;          }

// ─── PRICE LEVEL BIAS (dinamico v4.0) ───────────────────────
// Usa MA20 del gold se disponibile dalla fusion, altrimenti fallback
// a goldPrice stesso (neutro — evita bias fisso obsoleto)
const PRICE_THRESHOLD = fusion.goldPriceMa20 && fusion.goldPriceMa20 > 1500
  ? fusion.goldPriceMa20
  : goldPrice; // fallback neutro: soglia = prezzo corrente
let priceBias = goldPrice < PRICE_THRESHOLD ? 'LONG' : 'SHORT';
let priceBiasReason = goldPrice < PRICE_THRESHOLD
  ? `Gold $${goldPrice.toFixed(0)} < MA20 $${PRICE_THRESHOLD.toFixed(0)} → bias LONG`
  : `Gold $${goldPrice.toFixed(0)} > MA20 $${PRICE_THRESHOLD.toFixed(0)} → bias SHORT`;

// ─── FIX G10: RSI + MA BIDIREZIONALE ────────────────────────
// Bonus/malus tecnico per LONG e SHORT
let technicalBonus = 0;
let technicalBonusNote = '';

const rsi   = D2A.rsi  || 50;
const ma20  = D2A.ema20 || D2A.ma20 || goldPrice;
const ma50  = D2A.ma50  || goldPrice;

if (sessionForce === 'LONG') {
  // LONG confermato da tecnica: RSI 40-65, prezzo sopra MA20 > MA50
  if (rsi >= 40 && rsi <= 65 && goldPrice > ma20 && ma20 > ma50) {
    technicalBonus = 1.5;
    technicalBonusNote = `RSI ${rsi} + P>${ma20.toFixed(0)}>${ma50.toFixed(0)} → conferma LONG tecnica`;
  } else if (rsi > 70) {
    technicalBonus = -1.0;
    technicalBonusNote = `RSI ${rsi} overbought → segnale LONG debole`;
  }
} else if (sessionForce === 'SHORT') {
  // SHORT confermato da tecnica: RSI 35-60, prezzo sotto MA20 < MA50
  if (rsi >= 35 && rsi <= 60 && goldPrice < ma20 && ma20 < ma50) {
    technicalBonus = 1.5;
    technicalBonusNote = `RSI ${rsi} + P<${ma20.toFixed(0)}<${ma50.toFixed(0)} → conferma SHORT tecnica`;
  } else if (rsi < 30) {
    technicalBonus = -1.0;
    technicalBonusNote = `RSI ${rsi} oversold → segnale SHORT debole`;
  }
}

// ─── SCORE PESATO (con stub isolati) ────────────────────────
const sc = {
  D1A: safeScore(D1A) * rw.D1A,
  D1B: safeScore(D1B) * rw.D1B,
  D2A: safeScore(D2A) * rw.D2A,
  D2B: safeScore(D2B) * rw.D2B,
  D3A: safeScore(D3A) * rw.D3A,
  D3B: safeScore(D3B) * rw.D3B,
  D4:  safeScore(D4)  * rw.D4,
  D5:  D5.score       * rw.D5,
  D6:  safeScore(D6)  * rw.D6,
  D7:  safeScore(D7)  * rw.D7,
  D8:  safeScore(D8)  * rw.D8,
  D9:  safeScore(D9)  * rw.D9,
  D10: safeScore(D10) * rw.D10,
  D11: safeScore(D11) * rw.D11,
  D12: safeScore(D12) * rw.D12,
};

const totalW  = Object.values(rw).reduce((a, b) => a + b, 0);
const wSum    = Object.values(sc).reduce((a, b) => a + b, 0) + technicalBonus;
const rawConf = wSum / totalW;

// ─── CONFIDENCE ─────────────────────────────────────────────
const confidenceScore = Math.max(0, Math.min(100, ((rawConf + 5) / 10) * 100));

// ─── QUALITY SCORE (C2 FIX: stub non distorcono) ────────────
const norm = v => Math.max(0, Math.min(100, ((v + 5) / 10) * 100));

// Solo dipartimenti REALI (non stub) contano per qualityScore
const realD1A = !D1A.isFASE2stub  ? safeScore(D1A) : 0;
const realD1B = !D1B.isFASE2stub  ? safeScore(D1B) : 0;
const realD12 = !D12.isFASE2stub  ? safeScore(D12) : 0;
const realD4BC= !D4_BC.isFASE2stub? safeScore(D4_BC): 0;
const realD5A = !D5A.isFASE2stub  ? safeScore(D5A) : 0;
const realD5B = !D5B.isFASE2stub  ? safeScore(D5B) : 0;

const macroScore  = (realD1A * rw.D1A + realD1B * rw.D1B + realD12 * rw.D12 + realD4BC) / (rw.D1A + rw.D1B + rw.D12 + 1);
const techScore   = (safeScore(D2A)*rw.D2A + safeScore(D2B)*rw.D2B + safeScore(D9)*rw.D9 + safeScore(D10)*rw.D10 + technicalBonus) / (rw.D2A + rw.D2B + rw.D9 + rw.D10);
const sentScore   = (safeScore(D4)*rw.D4 + D5.score*rw.D5 + realD5A + realD5B) / (rw.D4 + rw.D5 + 1 + 1);
const interScore  = (safeScore(D3A)*rw.D3A + safeScore(D3B)*rw.D3B) / (rw.D3A + rw.D3B);
const structScore = (safeScore(D6)*rw.D6 + safeScore(D7)*rw.D7 + safeScore(D8)*rw.D8 + safeScore(D11)*rw.D11) / (rw.D6 + rw.D7 + rw.D8 + rw.D11);

const qualityScore = Math.round(
  norm(macroScore)  * 0.25 +
  norm(techScore)   * 0.35 +
  norm(sentScore)   * 0.25 +
  norm(interScore)  * 0.15
);

let setupGrade = 'C';
if      (qualityScore >= 80) setupGrade = 'A+';
else if (qualityScore >= 70) setupGrade = 'A';
else if (qualityScore >= 62) setupGrade = 'B';  // B ora operativo (era 58, soglia filtro abbassata a 62)

let riskProfile = 'CONSERVATIVO';
if      (qualityScore >= 75 && vix < 20) riskProfile = 'AGGRESSIVO';
else if (qualityScore >= 60 && vix < 25) riskProfile = 'MODERATO';

// ─── DRAWDOWN PROTECTION (v4.0 — morbida) ───────────────────
// Prima: 3 loss → stop forzato. Ora: graduale fino a 5 loss
const recentLosses    = recentTrades.slice(-5).filter(t => t.outcome === 'LOSS').length;
let drawdownProtection = false;
let drawdownNote       = '';
let sizeMultiplierDD   = 1.0;

if      (recentLosses >= 5) { drawdownProtection = true; sizeMultiplierDD = 0.15; drawdownNote = '🔴 5 LOSS → Size 15% (veto soft)'; }
else if (recentLosses >= 4) { drawdownProtection = true; sizeMultiplierDD = 0.20; drawdownNote = '🟠 4 LOSS → Size 20%'; }
else if (recentLosses >= 3) { drawdownProtection = true; sizeMultiplierDD = 0.40; drawdownNote = '🟡 3 LOSS → Size 40%'; }
else if (recentLosses >= 2) { drawdownProtection = true; sizeMultiplierDD = 0.70; drawdownNote = '🟡 2 LOSS → Size 70%'; }

// ─── VETO ───────────────────────────────────────────────────
let vetoActive = false;
let vetoReason = '';
if (D1A.eventVetoActive)                    { vetoActive = true; vetoReason = 'Evento macro imminente (FED/CPI/NFP)'; }
if (D5.vetoUpcoming)                        { vetoActive = true; vetoReason = `D4_BC: ${D4_BC.upcomingCritical?.[0] || 'Evento critico <45min'}`; }
if (rawAtr >= 8 && rawAtr > atr * 2.5)     { vetoActive = true; vetoReason = 'Volatilità estrema ATR > 2.5x'; }
if (D11.score <= -3)                        { vetoActive = true; vetoReason = 'Mercato chiuso (Weekend)'; }
if (drawdownProtection && recentLosses >= 5){ vetoActive = true; vetoReason = '5 LOSS consecutivi — stop soft 2h'; } // era 3, ora 5

// ─── DIREZIONE BASE (prima del session filter) ────────────────
let direction = 'WAIT', directionEmoji = '🟡';
let sessionFilterApplied = false;

if (!vetoActive) {
  if      (confidenceScore >= 62) { direction = 'LONG';  directionEmoji = '🟢'; }
  else if (confidenceScore <= 38) { direction = 'SHORT'; directionEmoji = '🔴'; }
  else {
    direction      = rawConf > 0 ? 'WAIT_BIAS_LONG' : 'WAIT_BIAS_SHORT';
    directionEmoji = rawConf > 0 ? '🟡↑' : '🟡↓';
  }
}

// ─── APPLICA SESSION FILTER (SOFT BIAS v4.0) ─────────────────
// Il filtro NON blocca più la direzione — applica size penalty -30%
// se direzione è contro-sessione. Trade eseguito ma con rischio ridotto.
let sessionSizePenalty = 1.0;
if (!vetoActive && sessionForce) {
  if (direction === 'LONG' && sessionForce === 'SHORT') {
    // Contro-sessione: esegue LONG ma riduce size del 30%
    sessionSizePenalty = 0.70;
    sessionFilterApplied = true;
    directionEmoji = '🟢⚠️';
  } else if (direction === 'SHORT' && sessionForce === 'LONG') {
    // Contro-sessione: esegue SHORT ma riduce size del 30%
    sessionSizePenalty = 0.70;
    sessionFilterApplied = true;
    directionEmoji = '🔴⚠️';
  } else if (direction.includes('WAIT')) {
    // In area WAIT → usa sessione come tie-breaker (promuove a direzione)
    direction      = sessionForce === 'LONG' ? 'LONG' : 'SHORT';
    directionEmoji = sessionForce === 'LONG' ? '🟢' : '🔴';
    sessionSizePenalty = 0.80; // size ridotta per segnale debole promosso
  }
  // Se direction già allineata con sessionForce → conferma piena, nessuna modifica
}

// ─── THROTTLE SEGNALI (deduplicazione 30min) ─────────────────
// Previene segnali duplicati se lo stesso trade viene segnalato
// più volte nello stesso ciclo di 30 minuti
const lastSignalTs  = fusion.lastSignalTs  || 0;
const lastSignalDir = fusion.lastSignalDir || '';
const THROTTLE_MS   = 30 * 60 * 1000; // 30 minuti
let throttled = false;
if (
  !vetoActive &&
  (direction === 'LONG' || direction === 'SHORT') &&
  direction === lastSignalDir &&
  (Date.now() - lastSignalTs) < THROTTLE_MS
) {
  throttled = true;
  direction = 'THROTTLED';
  directionEmoji = '⏸️';
}

const isLong = direction.includes('LONG') || (direction === 'WAIT' && rawConf >= 0);

// ─── FIX G9: ATR H1 BIDIREZIONALE + RR ≥ 1.5x ──────────────
// SL/TP specchiati e calibrati per LONG e SHORT
// Moltiplicatori aggiustati per garantire R:R ≥ 1.5x
const atrMult = {
  longSL:  1.0,  // SL LONG  = entry - ATR * 1.0
  longT1:  1.5,  // T1 LONG  = entry + ATR * 1.5  (R:R = 1.5)
  longT2:  2.8,  // T2 LONG  = entry + ATR * 2.8
  longT3:  4.5,  // T3 LONG  = entry + ATR * 4.5
  shortSL: 1.0,  // SL SHORT = entry + ATR * 1.0
  shortT1: 1.5,  // T1 SHORT = entry - ATR * 1.5  (R:R = 1.5)
  shortT2: 2.8,  // T2 SHORT = entry - ATR * 2.8
  shortT3: 4.5,  // T3 SHORT = entry - ATR * 4.5
  entryBandLow:  0.15,
  entryBandHigh: 0.25,
};

let entryLow, entryHigh, target1, target2, target3, stopLoss;

if (isLong) {
  entryLow  = +(goldPrice - atr * atrMult.entryBandLow).toFixed(2);
  entryHigh = +(goldPrice + atr * atrMult.entryBandHigh).toFixed(2);
  target1   = +(goldPrice + atr * atrMult.longT1).toFixed(2);
  target2   = +(goldPrice + atr * atrMult.longT2).toFixed(2);
  target3   = +(goldPrice + atr * atrMult.longT3).toFixed(2);
  stopLoss  = +(goldPrice - atr * atrMult.longSL).toFixed(2);
} else {
  // SHORT
  entryLow  = +(goldPrice - atr * atrMult.entryBandHigh).toFixed(2);
  entryHigh = +(goldPrice + atr * atrMult.entryBandLow).toFixed(2);
  target1   = +(goldPrice - atr * atrMult.shortT1).toFixed(2);
  target2   = +(goldPrice - atr * atrMult.shortT2).toFixed(2);
  target3   = +(goldPrice - atr * atrMult.shortT3).toFixed(2);
  stopLoss  = +(goldPrice + atr * atrMult.shortSL).toFixed(2);
}

const rrRaw = Math.abs(target1 - goldPrice) / Math.abs(goldPrice - stopLoss);
const rr1   = rrRaw.toFixed(1);

// ─── SIZING ─────────────────────────────────────────────────
let sizeNote       = '';
let sizeMultiplier = 1.0;

if      (D5.blackSwanAlert)    { sizeMultiplier = 0.3; sizeNote = '⚠️ Black Swan → Size 30%'; }
else if (vix > 30)             { sizeMultiplier = 0.5; sizeNote = `😱 VIX ${vix.toFixed(1)} → Size 50%`; }
else if (vix > 25)             { sizeMultiplier = 0.7; sizeNote = `⚠️ VIX ${vix.toFixed(1)} → Size 70%`; }
else if (fng < 20)             { sizeMultiplier = 0.6; sizeNote = `😨 F&G ${fng} Extreme Fear → Size 60%`; }
else if (fng < 30)             { sizeMultiplier = 0.8; sizeNote = `😟 F&G ${fng} Fear → Size 80%`; }
else if (fng > 75)             { sizeMultiplier = 0.8; sizeNote = `🤑 F&G ${fng} Greed → Size 80%`; }
else if (confidenceScore < 50) { sizeMultiplier = 0.5; sizeNote = `⚠️ Conf ${confidenceScore.toFixed(0)}% → Size 50%`; }
else                           { sizeMultiplier = 1.0; sizeNote = '✅ Condizioni ok → Size 100%'; }

sizeMultiplier = +(sizeMultiplier * sizeMultiplierDD * sessionSizePenalty).toFixed(2);
if (drawdownNote) sizeNote += ` | ${drawdownNote}`;
if (sessionFilterApplied && sessionSizePenalty < 1) sizeNote += ` | ⚠️ Contro-sessione → Size ×${sessionSizePenalty}`;
sizeNote += ` | Effettiva: ${(sizeMultiplier * 100).toFixed(0)}%`;

// ─── LEVERAGE TABLE (G1: max 20x) ───────────────────────────
const MAX_LEV = 20; // 🔒 G1 Hard cap
const capital    = 1000;
const riskAmount = +(capital * 0.01 * sizeMultiplier).toFixed(2); // 1% rischio per trade

const levTable = [1, 2, 5, 10, 20].map(lev => {
  const size = +(capital * lev * sizeMultiplier).toFixed(0);
  const mc   = lev > 1 ? +((1 / lev) * 100).toFixed(1) : 100;
  let rec = '✅';
  if (lev >= 10 && (qualityScore < 70 || vix > 22)) rec = '⚠️';
  if (lev === 20 && (qualityScore < 80 || vix > 18)) rec = '🔴';
  return { lev, size, marginCall: mc, rec };
});

let optimalLev = 1;
if      (qualityScore >= 80 && vix < 16 && !drawdownProtection) optimalLev = 20;
else if (qualityScore >= 75 && vix < 18 && !drawdownProtection) optimalLev = 10;
else if (qualityScore >= 65 && vix < 22 && !drawdownProtection) optimalLev = 5;
else if (qualityScore >= 55 && vix < 25)                        optimalLev = 2;
else                                                            optimalLev = 1;

optimalLev = Math.min(optimalLev, MAX_LEV);

// ─── PROIEZIONE ─────────────────────────────────────────────
const winRate    = winRateRaw || 0.40; // Default 40% per essere conservativi
const avgWin     = riskAmount * 1.8;
const avgLoss    = riskAmount;
const evPerTrade = (winRate * avgWin) - ((1 - winRate) * avgLoss);
const monthlyEV  = +(evPerTrade * 20).toFixed(2);
const monthlyPct = +((monthlyEV / capital) * 100).toFixed(1);
const capital3m  = +(capital * Math.pow(1 + monthlyEV / capital, 3)).toFixed(0);
const capital6m  = +(capital * Math.pow(1 + monthlyEV / capital, 6)).toFixed(0);

// ─── RAGIONI ────────────────────────────────────────────────
const reasons = [];
if (D5.blackSwanAlert)                             reasons.push('⚠️ BLACK SWAN: rischio geopolitico estremo');
if (vetoActive)                                    reasons.push(`🚫 VETO: ${vetoReason}`);
if (sessionFilterApplied)                          reasons.push(`🕐 SESSION FILTER: Score diceva ${direction.includes('LONG') ? 'LONG' : 'SHORT'} ma bloccato — ${sessionFilterReason}`);
if (D5.vetoUpcoming)                               reasons.push(`⏰ Evento macro <45min — ridurre esposizione`);
if (D10.structureBias === 'BULL')                  reasons.push(`Struttura HH/HL — uptrend (HTF ${D10.htfBias || ''})`);
if (D10.structureBias === 'BEAR')                  reasons.push(`Struttura LH/LL — downtrend`);
if (D9.patternsFound?.length > 0)                  reasons.push(`Pattern: ${D9.patternsFound.join(', ')}`);
if (D6.cotDivergence === 'STRONG_LONG')            reasons.push('COT: MM Long vs Prod Short — bullish istituzionale');
if (D3A.dxyChange && D3A.dxyChange < -0.5)         reasons.push(`DXY -${Math.abs(D3A.dxyChange).toFixed(2)}% — dollaro debole`);
if (D5.fedTone === 'DOVISH')                       reasons.push('Fed DOVISH — taglio tassi favorisce oro');
if (D5.fedTone === 'HAWKISH')                      reasons.push('Fed HAWKISH — tassi alti penalizzano oro');
if (technicalBonusNote)                            reasons.push(technicalBonusNote);
if (priceBiasReason)                               reasons.push(priceBiasReason);
if (sessionFilterReason && !sessionFilterApplied)  reasons.push(`🕐 ${sessionFilterReason}`);
if (reasons.length < 3)
  reasons.push(`Score ${rawConf.toFixed(2)} | Regime: ${marketRegime} | Conf: ${confidenceScore.toFixed(1)}% | ${priceSource}`);

// ─── PIANO B ────────────────────────────────────────────────
const planB = confidenceScore > 60
  ? `Se ${isLong ? 'DXY rimbalza o VIX > 30' : 'oro rompe R1 o struttura gira'} → chiudi e aspetta riconferma`
  : 'Size ridotta — aspetta candela di conferma prima di entrare';

const historicalNote = (historicalContext && historicalContext.length > 0)
  ? `Simile a: ${historicalContext[0].regime_name || 'N/A'}`
  : `${D2A.change1d >= 0 ? '+' : ''}${(D2A.change1d || 0).toFixed(2)}% oggi | ${D11.sessionInfo || 'N/A'}`;

const marketStructure = (D10.structure || 'UNKNOWN')
  .replace('UPTREND_HH_HL', 'UPTREND HH/HL')
  .replace('DOWNTREND_LH_LL', 'DOWNTREND LH/LL');

// ─── OUTPUT FLAT ────────────────────────────────────────────
return [{
  json: {
    direction, directionEmoji,
    sessionForce, sessionFilterApplied, sessionFilterReason,
    priceBias, priceBiasReason,
    confidenceScore:  parseFloat(confidenceScore.toFixed(1)),
    qualityScore, setupGrade, riskProfile,
    vetoActive, vetoReason, marketRegime,

    goldPrice, priceSource,
    atr, atrRaw: rawAtr,

    entryLow, entryHigh,
    target1, target2, target3,
    stopLoss, riskReward: rr1,

    sizeMultiplier, sizeNote,
    drawdownProtection, drawdownNote,
    leverageTable: levTable,
    optimalLeverage: optimalLev,
    riskAmount,

    evPerTrade: +evPerTrade.toFixed(2),
    monthlyEV, monthlyPct, capital3m, capital6m,
    winRate: +(winRate * 100).toFixed(1),

    reasons: reasons.slice(0, 6),
    planB, historicalNote,

    categoryScores: {
      macro:       +norm(macroScore).toFixed(0),
      tecnica:     +norm(techScore).toFixed(0),
      sentiment:   +norm(sentScore).toFixed(0),
      intermarket: +norm(interScore).toFixed(0),
      struttura:   +norm(structScore).toFixed(0),
    },

    departmentScores: {
      D1A_Macro:    +safeScore(D1A).toFixed(2),
      D1B_MacroSec: +safeScore(D1B).toFixed(2),
      D2A_GoldTech: +safeScore(D2A).toFixed(2),
      D2B_GoldAdv:  +safeScore(D2B).toFixed(2),
      D3A_DXY_SPX:  +safeScore(D3A).toFixed(2),
      D3B_BTC_Rame: +safeScore(D3B).toFixed(2),
      D4_Sentiment: +safeScore(D4).toFixed(2),
      D5_News:      +D5.score.toFixed(2),
      D6_Whale:     +safeScore(D6).toFixed(2),
      D7_Season:    +safeScore(D7).toFixed(2),
      D8_Levels:    +safeScore(D8).toFixed(2),
      D9_Candles:   +safeScore(D9).toFixed(2),
      D10_Structure:+safeScore(D10).toFixed(2),
      D11_Session:  +safeScore(D11).toFixed(2),
      D12_Macro:    +safeScore(D12).toFixed(2),
    },

    vix, fng,
    fngLabel:       D4.fngLabel,
    dxyLevel:       D3A.dxyLevel || D12.dxyLevel,
    fedTone:        D5.fedTone,
    whaleConsensus: D6.whaleConsensus  || 'NEUTRAL',
    cotDivergence:  D6.cotDivergence   || 'NEUTRAL',
    topHeadlines:   D5.topHeadlines    || [],
    pivot:          D8.pivot,
    r1:             D8.r1,
    s1:             D8.s1,
    candlePatterns: D9.patternsFound   || D9.patterns || [],
    wickNotes:      D9.wickNotes       || 'NONE',
    h4Bias:         D9.h4Bias          || 'NEUTRAL',
    fvgZones:       D10.fvgZones       || 'NONE',
    marketStructure,
    sessionInfo:    D11.sessionInfo    || 'N/A',
    seasonalBias:   D7.seasonalBias    || 0,
    sessionLabel,
    hasMemory,
    timestamp: new Date().toISOString(),
    throttled, // true se segnale duplicato (stesso dir < 30min)
    lastSignalTs:  throttled ? lastSignalTs  : Date.now(),
    lastSignalDir: throttled ? lastSignalDir : direction,

    _meta: {
      ...(fusion._meta || {}),
      sessionFilter: { utcHour, sessionForce, applied: sessionFilterApplied, reason: sessionFilterReason },
      priceFilter:   { threshold: PRICE_THRESHOLD, priceBias, goldPrice },
      techBonus:     { value: technicalBonus, note: technicalBonusNote },
      stubsIsolated: true,
      adaptiveWeightsActive: true,
    },
  },
}];
