# Roadmap — Auditoría del motor de trading

## Completado: corrección integral del motor (evaluación → decisión → Journal → cierre → estadísticas)

1. **Estado de operación (fuente única de verdad)** — hecho
   - Helpers `isCompleted`, `isRegistered`, `isNoTrade`, `isClosed`, `partition` en `src/lib/stats.ts`; usados en todas las agregaciones.
   - `equityCurve`, `scoreVsResult`, `rDistribution`, `byAsset`, `longVsShort` ahora sólo usan operaciones cerradas.

2. **Estadísticas** — hecho
   - `avgScore` promedia sólo scores reales (ya no convierte null en 0).
   - `longVsShort` y `byAsset` sólo cuentan cerradas; el dinero ausente no se suma como 0.
   - `totalMoney`, `avgMoney`, `netPnl`, `avgRoi` derivan de valores existentes en operaciones cerradas.
   - `approved` documentado: clasificación ≠ NO TRADE (validez del setup, no ejecución).

3. **R/R y resultados** — hecho
   - `computeRisk(risk, direction)` deriva R/R con signo: TP del lado equivocado da R/R negativo; entrada = stop → null.
   - `posttrade.ts`: guardas de finitud (`fin`), riesgo 0 sin división, porcentajes null cuando falta capital/margen.

4. **Hard rules / decisión** — hecho
   - Cliente: no se puede guardar `decision="registrado"` con estado DESCARTADA (se degrada a no_trade + aviso).
   - Servidor: `savePostTradeFn` rechaza cerrar operaciones NO TRADE / con reglas críticas o freno emocional.

5. **Numeración** — hecho (atómica)
   - El número definitivo lo asigna el trigger `assign_trade_no` mediante `private.next_trade_no()` (INSERT ... ON CONFLICT DO UPDATE ... RETURNING sobre `private.trade_counters`, bloqueo de fila por usuario) + índice único parcial `(user_id, trade_no)`.
   - `nextTradeNumber(userId)` es sólo previsualización en el asistente.
   - Atomicidad demostrada con 25 inserciones concurrentes reales: `tests/trade_no_concurrency.sh` + `tests/trade_no_concurrency.sql`.

6. **Pruebas** — hecho
   - `tests/engine.test.ts` (bun test): 19 casos — NO TRADE con datos residuales, score null, abierta sin resultado, resultado 0, pérdida, ganancia, LONG, SHORT, R/R inválido, riesgo 0, datos incompletos, borradores.

## Limitaciones que permanecen
- Valores orientativos en FUTURES/CFD (tick value y contract_size dependen del instrumento).
- Numeración de operaciones sin bloqueo en BD.
