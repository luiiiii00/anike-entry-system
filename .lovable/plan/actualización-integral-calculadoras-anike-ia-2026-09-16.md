# Actualización integral: Calculadoras + ANIKE IA

Auditoría de solo lectura del estado actual y plan de implementación. Sin cambios de código todavía.

## 1) Hallazgos actuales

### A. Calculadora pre-trade (riesgo / lotaje / apalancamiento)
- `computeRisk()` (`src/lib/scoring.ts`) ya distingue `exact` / `orientative` / `unavailable`, evita NaN/Infinity, usa distancias con signo para LONG/SHORT y lista los datos que faltan. Correcto, no requiere cambios matemáticos.
- **Hallazgo real:** el formulario de Nueva Evaluación nunca pide *tamaño de contrato* ni *valor por punto/tick*. `computeRisk` se invoca solo con `{ market }`, por lo que en Forex, Futuros, CFD e Índices el lotaje queda **siempre ORIENTATIVO**, incluso cuando el trader conoce la especificación. La capacidad ya existe en el motor pero no hay dónde introducir el dato.
- No existe cálculo de apalancamiento/margen en pre-trade (solo en post-trade). Hoy el trader no ve qué margen implicaría el tamaño calculado.
- El resultado se muestra mezclado: entradas, cálculos y advertencias comparten el mismo bloque visual; solo `SizingStatus` separa la exactitud.

### B. Fibonacci y SL 0,75
- `fiboProjection()` calcula 0,38 / 0,50 / 0,618 / 0,75 desde los extremos declarados, respeta LONG/SHORT y devuelve `null` si el impulso es inválido. Correcto.
- El botón "usar SL Fibonacci" escribe `slFibo` **y sobrescribe `stop`**. Los datos guardados son fuente (`swingHigh`, `swingLow`, `slFibo`), así que el servidor sigue siendo autoridad. No hay error matemático.
- **Hallazgo:** no se muestra qué nivel está usando el trader ni la distancia del SL 0,75 respecto a la entrada, ni advertencia cuando el `stop` manual difiere del 0,75 sugerido.

### C. Calculadora Post-Trade
- `posttrade-analytics.ts` (833 líneas) está completo y probado: resultado LONG/SHORT, P/L bruto/neto, comisiones, R real, R:R plan vs real, EMA50 entrada/cierre, MFE/MAE con eficiencia, scorecard de 6 áreas y diagnóstico. Los derivados sensibles se recalculan en `posttrade.functions.ts`.
- **Hallazgo:** `buildAiPostTradeContext()` existe pero **nadie lo consume**. Toda la riqueza analítica del post-trade nunca llega a ANIKE IA.
- La UI de la calculadora presenta campos en un solo flujo largo; no separa "datos introducidos / cálculos / advertencias / orientativo vs exacto" como pides.

### D. ANIKE IA
- Clave protegida en servidor (`process.env.LOVABLE_API_KEY` dentro de handlers). Correcto y se mantiene.
- Prompt de sistema ya es exigente y educativo, pero **el prompt de datos está incompleto respecto al CORE actual**:
  - `ai.functions.ts` no envía `final_state` aunque `EvalRow` lo soporta → `finalStateBlock()` **reconstruye** el estado en lugar de usar el que decidió el servidor. Riesgo real de contradecir la decisión del sistema.
  - No se envían los **gates** (Estructura 70 / Zona 60 / Confirmación 60 / Riesgo 80 / Recorrido 60), ni el `percent` por bloque, ni score interno vs visible, ni el umbral 80.
  - No se envía la **precisión del lotaje** ni el `setup` con su nombre oficial S01–S05 (va el ID crudo).
  - En POST_TRADE se envían columnas planas, no el análisis (scorecard, MFE/MAE, EMA50 cierre, desviaciones plan vs real).
- Historial: 30 evaluaciones sin distinguir estado/registrada/cerrada; agrupa setups por ID crudo; suma R por setup sin mínimo de muestras.
- Límite "diario": es una ventana móvil de 24 h contada por filas en `ai_reviews`, mientras el panel de admin dice "límite diario". Además cada reintento fallido no consume, pero cada análisis repetido sí.
- Llamada al modelo: `fetch` no streaming a `/v1/chat/completions` con `google/gemini-3.7-flash`, cabecera `Authorization: Bearer`, sin propagación de `X-Lovable-AIG-Run-ID`. Una respuesta larga puede agotar el tiempo de la petición.
- UX: el panel solo aparece en el detalle de la operación y en la revisión semanal; no hay análisis PRE_TRADE desde el propio wizard. El historial de análisis muestra únicamente el más reciente ("VER ANÁLISIS"), sin lista de versiones anteriores.

## 2) Arquitectura y UX propuestas

### Calculadoras — patrón único de presentación
Un mismo esqueleto visual para pre-trade y post-trade, con cuatro zonas explícitas y separadas:
1. **DATOS INTRODUCIDOS** — solo lo que escribió el trader, en modo lectura.
2. **CÁLCULOS** — cada resultado con su etiqueta de exactitud (`EXACTO` / `ORIENTATIVO — NO EJECUTABLE` / `NO DISPONIBLE`) reutilizando `SizingStatus`.
3. **ADVERTENCIAS** — geometría inválida, riesgo sobre el límite, SL distinto del 0,75, datos faltantes.
4. **QUÉ FALTA PARA UN CÁLCULO EXACTO** — lista de datos ausentes; nunca se inventan especificaciones del instrumento.

Nuevos campos **opcionales** de especificación (tamaño de contrato, valor por punto/tick) en la calculadora pre-trade. Si el trader no los aporta, el resultado sigue siendo ORIENTATIVO, sin valores por defecto inventados.

### ANIKE IA — de "seca" a mentor razonado
- **Contexto estructurado nuevo** (`buildEngineContext`): estado final real guardado, score interno y visible, umbral 80, tabla de gates con cumplido/fallado, reglas HARD con su significado, setup oficial con nombre, R:R vs mínimo 1:2, riesgo usado vs límite, precisión del lotaje, y en post-trade el `buildAiPostTradeContext()` completo.
- **Salida ampliada** manteniendo compatibilidad: se conservan los cinco campos actuales (`summary`, `what_worked`, `what_failed`, `what_learned`, `next_time`) y se añaden dos opcionales:
  - `why` — por qué el sistema llegó a ese estado, ligando score + gates + HARD + setup + riesgo.
  - `contradictions` — contradicciones detectadas entre bloques (contexto vs entrada, score alto vs gate incumplido, buen setup vs R:R insuficiente, plan correcto vs ejecución impulsiva).
- **Reglas de coherencia reforzadas en el prompt:** la IA nunca puede sugerir que una CONDICIONAL o NO TRADE podría ejecutarse, ni recalcular score/estado. Solo explica lo que el motor ya decidió.
- **UX del panel:** secciones plegables (Lectura → Por qué → Contradicciones → Lo que funcionó → Lo que no → Aprendizaje → Acciones), historial de análisis anteriores con fecha y tipo, y estado de límite claro ("te quedan N de M análisis en las últimas 24 h").
- **Análisis PRE_TRADE accesible** desde la pantalla de resultado de la evaluación, con aviso de que no es una recomendación de entrada.

## 3) Cambios por archivo

| Archivo | Cambio |
|---|---|
| `src/lib/scoring.ts` | Sin cambios en pesos, fórmula, gates, umbral, precedencia ni estados. Solo se añade un helper de presentación de riesgo/apalancamiento estimado (puro, no decide nada). |
| `src/routes/_authenticated/nueva.tsx` | Campos opcionales de especificación del instrumento; calculadora reorganizada en las 4 zonas; aviso cuando el `stop` difiere del SL 0,75; acceso al análisis PRE_TRADE. |
| `src/components/SizingStatus.tsx` | Reutilizado sin cambios de lógica; posible variante compacta. |
| `src/lib/evaluations.functions.ts` | Aceptar y persistir la especificación del instrumento como **dato fuente** y pasarla a `computeRisk` en el recálculo del servidor. Ninguna otra regla cambia. |
| `src/components/PostTradeCalculator.tsx` | Reorganización visual en las 4 zonas. Sin tocar fórmulas. |
| `src/components/PostTradeAnalytics.tsx` | Agrupación y jerarquía visual; sin cambios de cálculo. |
| `src/lib/posttrade-analytics.ts` | Solo correcciones si alguna prueba nueva demuestra un error real. |
| `src/lib/ai.server.ts` | Nuevo bloque de contexto del motor (gates, estado real, HARD explicadas, setup oficial, lotaje, contexto post-trade); prompt de sistema ampliado con "explica el por qué" y detección de contradicciones; esquema con `why` y `contradictions`; llamada al gateway alineada (cabecera `Lovable-API-Key`, streaming consumido en servidor, propagación de run id). |
| `src/lib/ai.functions.ts` | Enviar `final_state` y los campos que faltan; historial que distingue registradas/cerradas y usa nombres oficiales de setup con mínimo de muestras; adjuntar contexto post-trade cuando la operación esté cerrada. |
| `src/components/AnikeAi.tsx` | Nueva estructura de secciones, historial de análisis previos, mensajes de límite y error más claros. |
| `src/components/AdminAiSettings.tsx` | Texto correcto del límite (ventana de 24 h) y uso actual visible. |
| `src/lib/ai.ts` | Tipos y mensajes de error para los campos nuevos. |

Ninguna migración prevista: los campos de especificación viven dentro del JSON `risk` ya existente. Si al implementar resultara imprescindible, sería una migración **nueva**, sin editar las históricas.

## 4) Pruebas necesarias

- **Riesgo/lotaje:** con especificación → `exact`; sin especificación en Forex/Futuros/CFD/Índices → `orientative`; datos insuficientes → `unavailable`; sin especificaciones inventadas; NaN/Infinity/0 seguros.
- **Fibonacci:** niveles 0,38/0,50/0,618/0,75 en LONG y SHORT; impulso inválido → sin niveles; SL 0,75 sugerido nunca sustituye la decisión del sistema; aviso de divergencia con el `stop` manual.
- **Post-trade:** las 26 pruebas actuales siguen verdes; nuevas pruebas de que el contexto para IA se construye sin NaN/Infinity y con "no disponible" explícito.
- **ANIKE IA:** el prompt contiene el estado guardado (no reconstruido), los cinco gates, el umbral 80, las HARD y el setup oficial; para CONDICIONAL/NO TRADE nunca aparece lenguaje de ejecución; el contexto post-trade se adjunta solo si la operación está cerrada; la salida tolera ausencia de los campos nuevos.
- **Aislamiento:** pruebas que confirman que pesos, fórmula, gates, umbral, precedencia, estados y matriz S01–S05 no cambian.
- **Verificación final:** suite completa, `tsgo --noEmit`, build y lint de los archivos modificados.

## 5) Lo que NO se tocará

- CORE: pesos, fórmula, normalización 95/5, score interno vs visible, umbral 80, gates, precedencia VALIDACIÓN → HARD → COMPLETITUD → GATES → SCORE → ESTADO, clasificación y estados.
- Matriz Setup → Preguntas S01–S05, su aislamiento y la ausencia de "No aplica".
- Lógica matemática del motor Post-Trade validado (solo interfaz, salvo error demostrado por prueba).
- Autoridad del servidor: el cliente sigue enviando únicamente datos fuente.
- Protección de la clave de IA en servidor.
- Estadísticas históricas, Journal, RLS, seguridad, visibilidad y publicación.

## Decisiones que necesito confirmar

1. **Modelo de IA:** hoy usa `google/gemini-3.7-flash`. Puedo mantenerlo o pasar al modelo por defecto recomendado. Si no indicas nada, lo mantengo y solo corrijo la forma de la llamada.
2. **Campos nuevos de salida (`why`, `contradictions`):** ¿los quieres como campos separados o preferís que el "por qué" viva dentro de `summary` para no ampliar el esquema?
