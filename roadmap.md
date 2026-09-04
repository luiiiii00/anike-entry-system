# Roadmap — Auditoría del motor de trading

## En curso: corrección integral del motor (evaluación → decisión → Journal → cierre → estadísticas)

Hallazgos preliminares del análisis (pendientes de corregir):

1. **Estado de operación (fuente única de verdad)**
   - [ ] Definir helpers centrales (p. ej. en `src/lib/stats.ts` o `src/lib/db.ts`): `isRegistered`, `isClosed`, `isNoTrade` y usarlos en toda la app.
   - [ ] `equityCurve`/`scoreVsResult`/`rDistribution` filtran por `result_r !== null` pero NO excluyen `decision !== "registrado"` (un NO TRADE con result_r entraría). Unificar.

2. **Estadísticas (`src/lib/stats.ts`)**
   - [ ] `avgScore`: usa `e.score ?? 0` sobre TODAS las completadas → convierte null en 0. Debe promediar sólo evaluaciones con score real.
   - [ ] `longVsShort`: usa todas las completadas y `result_r ?? 0` → debe usar sólo cerradas (registradas con result_r ≠ null).
   - [ ] `byAsset`: suma `result_money ?? 0` (inventa 0) y no filtra por registradas.
   - [ ] `totalMoney`: suma `result_money ?? 0` sobre cerradas por R — si money es null no debe sumarse como 0 (definir `closedMoney`).
   - [ ] `approved`: hoy = clasificación ≠ NO TRADE. Hacer explícita la definición (finalState APROBADA/CONDICIONAL vs clasificación) y documentarla sin cambiar semántica estratégica.
   - [ ] `buildInsights`: revisar filtros (usa closed sin excluir no-registradas).

3. **R/R y resultados (`src/lib/posttrade.ts`, `computeRisk` en scoring.ts)**
   - [ ] `computeRisk`: `rr` no respeta LONG/SHORT (usa Math.abs en ambas patas) → un TP al lado equivocado da RR positivo. Derivar con dirección cuando esté disponible.
   - [ ] `riskAmount` en posttrade usa `Math.abs(entry - stopLoss)` — validación ya fuerza el lado correcto, OK, pero revisar guardas NaN/Infinity y división por 0.

4. **Riesgo / lotaje**
   - [ ] Auditar coherencia capital/riesgo%/distancia SL/positionSize; marcar cálculos orientativos como tales (contract_size, tick value en FUTURES/CFD).

5. **Hard rules / decisión**
   - [ ] Verificar que `blocked` (hard rules o emotional) siempre produce NO TRADE/DESCARTADA y que el guardado servidor/cliente no permita `decision="registrado"` para DESCARTADA.

6. **Integridad de datos**
   - [ ] Campos derivados (score, classification, decision, result_r, net_pnl, roi_margin, planned_rr, realized_rr, risk_amount, risk_percent): centralizar/validar antes de guardar (`nueva.tsx` guarda desde cliente; posttrade ya recalcula en servidor).

7. **Numeración**
   - [ ] `nextTradeNumber()` en `src/lib/db.ts`: máximo global bajo RLS (por usuario en la práctica), pero con carrera concurrente. Preferible: numeración por usuario en servidor/DB (trigger o función) compatible con datos históricos.

8. **Pruebas**
   - [ ] Build + tests. Casos límite: NO TRADE, CONDICIONAL, score null, abierta sin resultado, resultado 0, pérdida, ganancia, LONG, SHORT, R/R inválido, riesgo 0, datos incompletos.

Archivos a revisar/tocar: `src/lib/stats.ts`, `src/lib/scoring.ts`, `src/lib/posttrade.ts`, `src/lib/db.ts`, `src/lib/posttrade.functions.ts`, `src/routes/_authenticated/nueva.tsx`, `journal.tsx`, `stats.tsx`, `dashboard.tsx`, `trade.$id.tsx`, `src/components/PostTradeCalculator.tsx`, `src/lib/ai.functions.ts` (si consume stats).
