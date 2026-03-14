# 🏛️ HEDGE FUND XAU/USD — Istruzioni Aggiornamento v3.0
## Da incollare in n8n — Sessioni 3 & 4 complete

---

## RIEPILOGO PATCH APPLICATE

| Patch | Nodo | Stato |
|-------|------|-------|
| C2 — Stub FASE2 isolati | D4_BC, D5A, D5B, D12 | ✅ IMPLEMENTATO |
| C3 — Pesi adattivi abilitati | CERVELLO CIO v10.3 | ✅ IMPLEMENTATO |
| G4 — Filtro sessione statistico | CERVELLO CIO v10.3 | ✅ IMPLEMENTATO |
| G8 — ForexFactory Veto | Nuovo nodo G8 | ✅ IMPLEMENTATO |
| G9 — ATR H1 bidirezionale | CERVELLO CIO v10.3 | ✅ IMPLEMENTATO |
| G10 — RSI+MA bidirezionale | CERVELLO CIO v10.3 | ✅ IMPLEMENTATO |
| D4_BC — Dati reali | nodes/D4_BC_banche_centrali.js | ✅ IMPLEMENTATO |
| D5A — News NLP reale | nodes/D5A_news_nlp.js | ✅ IMPLEMENTATO |
| D5B — OSINT reale | nodes/D5B_osint_geopolitico.js | ✅ IMPLEMENTATO |
| D12 — Macro globale reale | nodes/D12_macro_globale.js | ✅ IMPLEMENTATO |

---

## STEP 1 — AGGIORNA D4_BC (Banche Centrali)

1. Apri n8n → workflow master
2. Cerca nodo **"🏦 D4_BC — Banche Centrali [F2]"**
3. Doppio click → tab **Code**
4. **CANCELLA tutto** il contenuto
5. Incolla il contenuto di: `nodes/D4_BC_banche_centrali.js`
6. Click **Save**

---

## STEP 2 — AGGIORNA D5A (News NLP)

1. Cerca nodo **"📰 D5A — News NLP Potenziato [F2]"**
2. Doppio click → tab **Code**
3. **CANCELLA tutto** il contenuto
4. Incolla il contenuto di: `nodes/D5A_news_nlp.js`
5. Click **Save**

---

## STEP 3 — AGGIORNA D5B (OSINT Geopolitico)

1. Cerca nodo **"🌍 D5B — SitDeck OSINT [F2]"**
2. Doppio click → tab **Code**
3. **CANCELLA tutto** il contenuto
4. Incolla il contenuto di: `nodes/D5B_osint_geopolitico.js`
5. Click **Save**

---

## STEP 4 — AGGIORNA D12 (Macro Globale)

1. Cerca nodo **"🌐 D12 — Macro Globale [F2]"**
2. Doppio click → tab **Code**
3. **CANCELLA tutto** il contenuto
4. Incolla il contenuto di: `nodes/D12_macro_globale.js`
5. Click **Save**

---

## STEP 5 — AGGIORNA CERVELLO CIO (CRITICO!)

1. Cerca nodo **"🧠 CERVELLO CIO v7."**
2. Doppio click → tab **Code**
3. **CANCELLA tutto** il contenuto
4. Incolla il contenuto di: `nodes/CERVELLO_CIO_v10_3.js`
5. Rinomina il nodo in: **"🧠 CERVELLO CIO v10.3"**
6. Click **Save**

---

## STEP 6 — AGGIUNGI NODO G8 (ForexFactory Veto)

Questo nodo va inserito **tra** "📝 Formatta Bollettino1" e "🎯 Filtro Score ≥70"

1. Click destro nella canvas → **Add Node** → **Code**
2. Nomina il nodo: **"🛡️ G8 — ForexFactory Veto"**
3. Incolla il contenuto di: `nodes/G8_forexfactory_veto.js`
4. **Scollega** il collegamento tra "📝 Formatta Bollettino1" e "🎯 Filtro Score ≥70"
5. **Collega** "📝 Formatta Bollettino1" → "🛡️ G8 — ForexFactory Veto"
6. **Collega** "🛡️ G8 — ForexFactory Veto" → "🎯 Filtro Score ≥70"
7. Imposta **"Continue On Error"** = ON sul nodo G8
8. Click **Save**

---

## STEP 7 — AGGIORNA SUPABASE (G5 — Audit Log Espanso)

Esegui questa query SQL nel Supabase SQL Editor:

```sql
-- Aggiungi colonne mancanti all'audit_log
ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS atr_value         NUMERIC,
  ADD COLUMN IF NOT EXISTS vix_value         NUMERIC,
  ADD COLUMN IF NOT EXISTS fng_value         INTEGER,
  ADD COLUMN IF NOT EXISTS macro_score       INTEGER,
  ADD COLUMN IF NOT EXISTS tech_score        INTEGER,
  ADD COLUMN IF NOT EXISTS sent_score        INTEGER,
  ADD COLUMN IF NOT EXISTS inter_score       INTEGER,
  ADD COLUMN IF NOT EXISTS session_hour      INTEGER,
  ADD COLUMN IF NOT EXISTS quality_score     INTEGER,
  ADD COLUMN IF NOT EXISTS setup_grade       TEXT,
  ADD COLUMN IF NOT EXISTS session_filter_applied BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS session_force     TEXT,
  ADD COLUMN IF NOT EXISTS price_bias        TEXT,
  ADD COLUMN IF NOT EXISTS ff_veto_active    BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ff_next_event     TEXT,
  ADD COLUMN IF NOT EXISTS trade_outcome     TEXT,
  ADD COLUMN IF NOT EXISTS department_scores JSONB,
  ADD COLUMN IF NOT EXISTS category_scores   JSONB;

-- Crea tabella cache D12 (se non esiste)
CREATE TABLE IF NOT EXISTS d12_macro_cache (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  score           NUMERIC,
  macro_regime    TEXT,
  dxy_level       NUMERIC,
  jpy_level       NUMERIC,
  nikkei_chg      NUMERIC,
  shanghai_chg    NUMERIC,
  dax_chg         NUMERIC,
  fed_rate        NUMERIC,
  active_sources  TEXT[],
  high_impact_count INTEGER,
  timestamp       TIMESTAMPTZ DEFAULT NOW()
);
```

---

## STEP 8 — TEST END-TO-END (G7)

1. **Test ore 08-11 UTC** (sessione Londra):
   - Esegui manualmente il workflow
   - Verifica: `sessionForce = "LONG"`, SHORT bloccati
   - Controlla `sessionFilterApplied = true` se score diceva SHORT

2. **Test ore 12-20 UTC** (sessione NY):
   - Esegui manualmente
   - Verifica: `sessionForce = "SHORT"`, LONG bloccati

3. **Verifica Supabase audit_log**:
   - Controlla che `session_hour`, `ff_veto_active`, `session_filter_applied` siano popolati

4. **Verifica qualityScore**:
   - Con stub isolati (C2), il qualityScore non dovrebbe più essere gonfiato artificialmente
   - Aspettati valori più bassi ma più accurati (50-70 range normale)

---

## IMPATTO ATTESO SUL WIN RATE

| Fonte di miglioramento | WR atteso |
|------------------------|-----------|
| Session Filter (G4) — blocca direzione sbagliata | +15-25% |
| Stub isolati (C2) — qualityScore più accurato | +5-10% |
| ForexFactory Veto (G8) — evita news macro | +5-8% |
| RSI+MA bidirezionale (G10) | +3-5% |
| ATR H1 calibrato (G9) — R:R ≥ 1.5x | +3-5% |
| **TOTALE STIMATO** | **WR 40-50%** |

---

## NOTE IMPORTANTI

- **PRICE_THRESHOLD** nel CERVELLO CIO è settata a `$3050` — aggiorna manualmente se il prezzo si sposta stabilmente >$200
- **Session Filter** usa UTC — assicurati che il server n8n sia sincronizzato su UTC
- I nodi D4_BC, D5A, D5B, D12 ora fanno chiamate reali HTTP — potrebbero rallentare di 2-4s il ciclo totale (normale)
- **Continue On Error = ON** già impostato su D4_BC, D5B, D12 — se una fonte è offline, lo score è 0 (neutro) e il workflow continua
