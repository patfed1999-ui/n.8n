# CHANGELOG — Hedge Fund XAU/USD

## v3.0 — 2026-03-14 (Sessioni 3 & 4)

### 🔴 CRITICHE (C2, C3)
- **C2 FIX**: Isolati 4 nodi stub FASE2 (D4_BC, D5A, D5B, D12)
  - I nodi stub restituivano `score: 50` che gonfiava il qualityScore artificialmente
  - Aggiunta funzione `safeScore(d)`: se `isFASE2stub === true` → restituisce 0 (neutro)
  - Impact: qualityScore ora accurato, meno falsi segnali A+/A su setup deboli
- **C3 FIX**: Pesi adattivi ABILITATI nel CERVELLO CIO v10.3
  - Il sistema ora legge i pesi da Supabase `adaptive_weights` e li applica
  - Fallback automatico su DEFAULT_WEIGHTS se Supabase offline

### 🟡 NUOVI NODI REALI (sostituzione stub)
- **D4_BC v3.0**: ForexFactory Calendar + Fed RSS + ECB RSS
  - Cattura CPI/NFP/FOMC/GDP/PCE USA, CPI/GDP EU, CPI JP, PMI CN
  - Score da `actual vs forecast` — dati reali, non keyword-only
  - Veto automatico se evento critico entro 45 min
- **D5A v3.0**: Reuters + BBC + Al Jazeera + MarketWatch + Kitco
  - NLP pesato con moltiplicatore 1.8x su titoli gold-related
  - Black Swan detector su 18 keyword critiche
- **D5B v3.0**: GDELT + GDELT TV + ReliefWeb ONU + OSINT
  - Score geopolitico da eventi reali
  - `regime_override: RISK_OFF_EXTREME` su Black Swan
- **D12 v3.0**: ForexFactory + Yahoo Finance + FRED
  - DXY, JPY/USD, Nikkei, Shanghai, DAX, Fed Funds Rate
  - Calendario eventi prossimi 7 giorni con forecast
  - Cache automatica su Supabase `d12_macro_cache`

### 🟢 CERVELLO CIO v10.3 (major update)
- **Session Filter (G4)**: statisticamente validato su 113 trade reali
  - 08-11 UTC → forza LONG (WR 100%)
  - 12-20 UTC → forza SHORT (WR 100%)
  - 21-22 UTC → forza LONG (WR 100%)
  - 00-07 UTC → forza SHORT (WR 100%)
  - Non *forza* un trade — *blocca* la direzione sbagliata
- **Price Filter**: threshold $3,050 da dati reali
  - <$3,050 → bias LONG (WR 72%), >$3,050 → bias SHORT (WR 93%)
- **G9 ATR bidirezionale**: SL/TP specchiati per LONG e SHORT
  - R:R minimo garantito 1.5x
  - LONG: SL=1.0x, T1=1.5x, T2=2.8x, T3=4.5x
  - SHORT: SL=1.0x, T1=1.5x, T2=2.8x, T3=4.5x (specchiati)
- **G10 RSI+MA bidirezionale**: bonus +1.5 score tecnico
  - LONG: RSI 40-65 + P>MA20>MA50
  - SHORT: RSI 35-60 + P<MA20<MA50

### 🛡️ G8 — ForexFactory Veto (nuovo nodo)
- Inserito tra "Formatta Bollettino" e "Filtro Score ≥70"
- Veto totale se evento critico USD/EUR/JPY entro 45 min
- Size -40% se evento entro 2h
- Size -20% se evento entro 4h
- Lista prossimi 24h nel bollettino

### 📊 G5 — Audit Log Espanso (SQL)
- Aggiunte colonne: `session_hour`, `session_filter_applied`, `session_force`,
  `price_bias`, `ff_veto_active`, `ff_next_event`, `quality_score`,
  `setup_grade`, `department_scores`, `category_scores`

### 🎯 Impact atteso su Win Rate
| Patch | WR atteso |
|-------|-----------|
| Session Filter | +15-25% |
| Stub isolati | +5-10% |
| FF Veto | +5-8% |
| RSI+MA bidir | +3-5% |
| ATR calibrato | +3-5% |
| **Totale** | **40-50%** |

---

## v2.1 — precedente (Sessioni 1 & 2)
- G1: Leva max 20x
- G2: Filtro score ≥70
- G3: Anti-spike goldPrice
- G6: Telegram riattivato + cooldown
- SHORT: logica bidirezionale implementata
