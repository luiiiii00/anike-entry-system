/** `na: true` marca una opción "No aplica": no penaliza ni suma, se excluye del cálculo. */
export type Option = { v: string; label: string; pts: number; na?: boolean };
export type Question = { id: string; label: string; hint?: string; options: Option[] };
export type SectionId =
  | "comercio"
  | "contexto"
  | "estructura"
  | "zona"
  | "confirmacion"
  | "riesgo"
  | "recorrido"
  | "ejecucion"
  | "disciplina"
  | "resultados";

export type Section = {
  id: SectionId;
  step: string;
  title: string;
  weight: number;
  /** Bloques que solo se completan después de cerrar la operación: no penalizan antes de tener resultado. */
  postTrade?: boolean;
  groups: { title?: string; questions: Question[] }[];
};

const yn = (yes = 1, no = 0): Option[] => [
  { v: "si", label: "Sí", pts: yes },
  { v: "no", label: "No", pts: no },
];

/** Sí / No / No aplica — "No aplica" nunca penaliza (se excluye del cálculo). */
const ynNa = (yes = 1, no = 0.3): Option[] => [
  ...yn(yes, no),
  { v: "na", label: "No aplica", pts: 0, na: true },
];

const NA_OPTION: Option = { v: "na", label: "No aplica", pts: 0, na: true };

/** Sí / No / Dudoso */
const ynd = (yes = 1, no = 0, doubt = 0.4): Option[] => [
  { v: "si", label: "Sí", pts: yes },
  { v: "no", label: "No", pts: no },
  { v: "dudoso", label: "Dudoso", pts: doubt },
];

const PATTERN_STATE: Option[] = [
  { v: "confirmado", label: "Confirmado", pts: 1 },
  { v: "formacion", label: "En formación", pts: 0.4 },
  { v: "invalidado", label: "Invalidado", pts: 0 },
  NA_OPTION,
];

export const INSTRUMENTS = ["BTC", "ETH", "SOL", "Forex", "Índices", "Otro"];

/** Niveles oficiales de Fibonacci de ANIKE EJEPIKA. 0,75 es el SL predeterminado. */
export const FIBO_LEVELS = [
  { v: "0_38", label: "0,38", ratio: 0.38 },
  { v: "0_50", label: "0,50", ratio: 0.5 },
  { v: "0_618", label: "0,618", ratio: 0.618 },
  { v: "0_75", label: "0,75", ratio: 0.75 },
] as const;

/** Nivel predeterminado de Stop Loss (sugerido, nunca ejecutado automáticamente). */
export const FIBO_SL_RATIO = 0.75;

export const SECTIONS: Section[] = [
  {
    id: "comercio",
    step: "00",
    title: "Comercio",
    weight: 5,
    groups: [
      {
        questions: [
          {
            id: "co_instrument",
            label: "Instrumento:",
            options: [
              { v: "BTC", label: "BTC", pts: 1 },
              { v: "ETH", label: "ETH", pts: 1 },
              { v: "SOL", label: "SOL", pts: 1 },
              { v: "Forex", label: "Forex", pts: 1 },
              { v: "Indices", label: "Índices", pts: 1 },
              { v: "Otro", label: "Otro", pts: 1 },
            ],
          },
          {
            id: "co_conditions",
            label: "¿El mercado presenta condiciones adecuadas para operar?",
            hint: "Una condición favorable no es una señal de entrada: solo habilita la evaluación.",
            options: ynd(1, 0, 0.4),
          },
        ],
      },
    ],
  },
  {
    id: "contexto",
    step: "01",
    title: "Contexto",
    weight: 10,
    groups: [
      {
        title: "Temporalidad principal: 1D",
        questions: [
          {
            id: "ctx_direction",
            label: "¿Cuál es la dirección predominante?",
            options: [
              { v: "alcista", label: "Alcista", pts: 1 },
              { v: "bajista", label: "Bajista", pts: 1 },
              { v: "lateral", label: "Lateral", pts: 0.4 },
              { v: "transicion", label: "Transición", pts: 0.4 },
            ],
          },
          {
            id: "ctx_swings",
            label: "¿Cómo está formando el precio sus máximos y mínimos?",
            options: [
              { v: "crecientes", label: "Máximos y mínimos crecientes", pts: 1 },
              { v: "decrecientes", label: "Máximos y mínimos decrecientes", pts: 1 },
              { v: "lateral", label: "Estructura lateral", pts: 0.4 },
              { v: "indefinida", label: "Estructura indefinida", pts: 0.2 },
            ],
          },
          {
            id: "ctx_aligned",
            label: "¿La operación está alineada con el contexto?",
            options: [
              { v: "si", label: "Sí", pts: 1 },
              { v: "no", label: "No", pts: 0 },
              { v: "parcial", label: "Parcialmente", pts: 0.5 },
            ],
          },
          {
            id: "ctx_levels",
            label: "¿Existen niveles importantes de soporte/resistencia?",
            options: yn(1, 0.2),
          },
          {
            id: "ctx_near_zone",
            label: "¿El precio se encuentra cerca de una zona importante?",
            options: yn(1, 0.2),
          },
        ],
      },
    ],
  },
  {
    id: "estructura",
    step: "02",
    title: "Estructura",
    weight: 25,
    groups: [
      {
        title: "02.1 Estructura 1H",
        questions: [
          {
            id: "h1_structure",
            label: "¿Qué estructura presenta actualmente el precio?",
            options: [
              { v: "alcista", label: "Alcista", pts: 1 },
              { v: "bajista", label: "Bajista", pts: 1 },
              { v: "lateral", label: "Lateral", pts: 0.4 },
              { v: "cambio", label: "Cambio de estructura", pts: 0.7 },
              { v: "no_definida", label: "No definida", pts: 0 },
            ],
          },
          {
            id: "h1_struct",
            label: "¿La estructura confirma la dirección de la operación?",
            options: [
              { v: "si", label: "Sí", pts: 1 },
              { v: "no", label: "No", pts: 0 },
              { v: "parcial", label: "Parcialmente", pts: 0.5 },
            ],
          },
        ],
      },
      {
        title: "02.2 Patrones de cambio",
        questions: [
          {
            id: "h1_pattern_change",
            label: "¿Cuál es el patrón de cambio que estás viendo?",
            hint: "Registra únicamente lo que observas. Seleccionar un patrón no implica que exista una señal.",
            options: [
              { v: "doble_techo", label: "Doble techo — alcista a bajista", pts: 1 },
              { v: "doble_suelo", label: "Doble suelo — bajista a alcista", pts: 1 },
              { v: "triple_techo", label: "Triple techo — alcista a bajista", pts: 1 },
              { v: "triple_suelo", label: "Triple suelo — bajista a alcista", pts: 1 },
              { v: "hch", label: "Hombro cabeza hombro — alcista a bajista", pts: 1 },
              { v: "hch_inv", label: "Hombro cabeza hombro invertido — bajista a alcista", pts: 1 },
              { v: "cuna_asc", label: "Cuña ascendente — posible rotura bajista", pts: 1 },
              { v: "cuna_desc", label: "Cuña descendente — posible rotura alcista", pts: 1 },
              { v: "suelo_redondeado", label: "Suelo redondeado — bajista a alcista", pts: 1 },
              { v: "techo_redondeado", label: "Techo redondeado — alcista a bajista", pts: 1 },
              { v: "pua_bajista", label: "Púa bajista — alcista a bajista", pts: 1 },
              { v: "pua_alcista", label: "Púa alcista — bajista a alcista", pts: 1 },
              NA_OPTION,
            ],
          },
          {
            id: "h1_pattern_change_state",
            label: "¿El patrón está confirmado?",
            hint: "Un patrón observado no es lo mismo que un patrón confirmado.",
            options: PATTERN_STATE,
          },
        ],
      },
      {
        title: "02.3 Patrones de continuidad",
        questions: [
          {
            id: "h1_pattern_cont",
            label: "¿Cuál es el patrón de continuidad que estás viendo?",
            hint: "Son elementos de análisis, no una señal de entrada automática.",
            options: [
              {
                v: "tri_simetrico",
                label: "Triángulo simétrico — continuidad alcista o bajista según tendencia",
                pts: 1,
              },
              { v: "tri_asc", label: "Triángulo ascendente — posible continuidad alcista", pts: 1 },
              { v: "tri_desc", label: "Triángulo descendente — posible continuidad bajista", pts: 1 },
              { v: "banderin_alcista", label: "Banderín alcista — posible continuidad alcista", pts: 1 },
              { v: "banderin_bajista", label: "Banderín bajista — posible continuidad bajista", pts: 1 },
              {
                v: "bandera_rect_alcista",
                label: "Bandera rectangular alcista — posible continuidad alcista",
                pts: 1,
              },
              {
                v: "bandera_rect_bajista",
                label: "Bandera rectangular bajista — posible continuidad bajista",
                pts: 1,
              },
              {
                v: "rectangulo",
                label: "Rectángulo — continuidad alcista o bajista según tendencia",
                pts: 1,
              },
              NA_OPTION,
            ],
          },
          {
            id: "h1_pattern_cont_state",
            label: "¿El patrón está confirmado?",
            options: PATTERN_STATE,
          },
        ],
      },
      {
        title: "02.4 Fibonacci",
        questions: [
          {
            id: "h1_fibo",
            label: "¿En qué nivel de retroceso de Fibonacci se encuentra el precio?",
            hint: "0,75 es el nivel predeterminado de referencia para el Stop Loss. No entrar únicamente porque el precio tocó Fibonacci, especialmente 0,50.",
            options: [
              { v: "0_38", label: "0,38", pts: 0.8 },
              { v: "0_50", label: "0,50", pts: 1 },
              { v: "0_618", label: "0,618", pts: 1 },
              { v: "0_75", label: "0,75", pts: 0.7 },
              NA_OPTION,
            ],
          },
        ],
      },
      {
        title: "02.6 Reacción en Fibonacci",
        questions: [
          {
            id: "h1_fibo_react",
            label: "¿El precio está reaccionando en la zona de Fibonacci?",
            options: [...ynd(1, 0, 0.4), NA_OPTION],
          },
          {
            id: "h1_fibo_weak",
            label: "¿Existe pérdida de fuerza durante el retroceso?",
            hint: "El agotamiento del retroceso es un confirmador, no un gatillo de entrada.",
            options: [...ynd(1, 0.2, 0.5), NA_OPTION],
          },
        ],
      },
      {
        title: "02.7 Divergencia RSI — 1H",
        questions: [
          {
            id: "h1_rsi_div",
            label: "¿Existe divergencia entre el precio y el RSI?",
            hint: "Si el precio testea el nivel de Fibonacci pero el RSI no hace nuevos mínimos/máximos, el agotamiento del retroceso puede ser una señal de pérdida de fuerza. Una divergencia no es una señal de entrada.",
            options: [
              { v: "alcista", label: "Divergencia alcista", pts: 1 },
              { v: "bajista", label: "Divergencia bajista", pts: 1 },
              { v: "no_existe", label: "Sin divergencia", pts: 0.4 },
              NA_OPTION,
            ],
          },
          {
            id: "h1_rsi_div_fibo",
            label: "¿La divergencia aparece cerca del nivel de Fibonacci?",
            options: ynNa(1, 0.3),
          },
        ],
      },
      {
        title: "02.8 MACD — 1H",
        questions: [
          {
            id: "h1_macd",
            label: "¿El histograma del MACD empieza a perder fuerza en la zona de Fibonacci?",
            hint: "Revisa que el histograma del MACD empiece a perder fuerza justo en la zona de Fibonacci.",
            options: ynNa(1, 0.3),
          },
        ],
      },
    ],
  },
  {
    id: "zona",
    step: "03",
    title: "Zona",
    weight: 10,
    groups: [
      {
        questions: [
          {
            id: "z_type",
            label: "¿Qué zona está siendo testeada?",
            options: [
              { v: "soporte", label: "Soporte", pts: 1 },
              { v: "resistencia", label: "Resistencia", pts: 1 },
              { v: "sop_res", label: "Soporte convertido en resistencia", pts: 1 },
              { v: "res_sop", label: "Resistencia convertida en soporte", pts: 1 },
              { v: "intermedia", label: "Zona intermedia", pts: 0.2 },
              NA_OPTION,
            ],
          },
          {
            id: "z_relevance",
            label: "¿La zona tiene relevancia dentro del contexto 1D/1H?",
            options: [
              { v: "alta", label: "Alta", pts: 1 },
              { v: "media", label: "Media", pts: 0.6 },
              { v: "baja", label: "Baja", pts: 0.2 },
            ],
          },
          {
            id: "z_reacted",
            label: "¿El precio está reaccionando en la zona?",
            options: ynd(1, 0, 0.4),
          },
          {
            id: "z_space",
            label: "¿Existe espacio suficiente hasta la próxima zona de reacción?",
            options: ynd(1, 0, 0.4),
          },
          { id: "z_clear", label: "¿Estoy entrando en una zona clara?", options: yn() },
          { id: "z_mid", label: "¿Estoy evitando entrar en mitad del rango?", options: yn() },
        ],
      },
    ],
  },
  {
    id: "confirmacion",
    step: "04",
    title: "Confirmación",
    weight: 20,
    groups: [
      {
        title: "04.1 Ruptura de diagonal · 5M",
        questions: [
          { id: "cf5_diag_break", label: "¿La diagonal fue rota?", options: yn() },
          {
            id: "cf5_close",
            label: "¿La vela de 5M cerró fuera de la diagonal?",
            hint: "Una ruptura intravela no es confirmación. El cierre de la vela es un criterio independiente.",
            options: yn(),
          },
        ],
      },
      {
        title: "04.3 Retesteo",
        questions: [
          {
            id: "cf5_retest",
            label: "¿Existe retesteo después de la ruptura?",
            options: ynNa(1, 0.4),
          },
          {
            id: "cf5_retest_ok",
            label: "¿El retesteo respeta la nueva estructura?",
            options: [...ynd(1, 0, 0.4), NA_OPTION],
          },
        ],
      },
      {
        title: "04.4 MACD — 5M",
        questions: [
          {
            id: "cf5_macd",
            label: "Una vez rota la diagonal, ¿la entrada está validada por el MACD?",
            hint: "Una vez rota la diagonal, valida la entrada con el cruce de líneas del MACD. Es un confirmador, no una orden de entrada.",
            options: ynNa(1, 0.2),
          },
          {
            id: "cf5_macd_cross",
            label: "¿Existe cruce de MACD con su línea de señal?",
            options: ynNa(1, 0.3),
          },
        ],
      },
      {
        title: "04.5 RSI — 5M",
        questions: [
          {
            id: "cf5_rsi",
            label: "¿El RSI permite una entrada sin perseguir el movimiento?",
            hint: "El RSI sirve para evitar comprar/vender justo cuando la ruptura ya dejó el movimiento sobreextendido.",
            options: ynd(1, 0, 0.4),
          },
          {
            id: "cf5_rsi_extended",
            label: "¿El movimiento ya está sobrecomprado/sobrevendido?",
            options: yn(0, 1),
          },
        ],
      },
      {
        title: "04.6 Vela de confirmación",
        questions: [
          {
            id: "cf_price_action",
            label: "¿La acción del precio de la vela confirma la dirección?",
            options: [
              { v: "si", label: "Sí", pts: 1 },
              { v: "no", label: "No", pts: 0 },
              { v: "dudosa", label: "Dudosa", pts: 0.4 },
              NA_OPTION,
            ],
          },
          {
            id: "cf_signal",
            label: "Tipo de vela:",
            hint: "Un patrón de vela individual no es una señal automática.",
            options: [
              { v: "rechazo", label: "Rechazo", pts: 1 },
              { v: "impulso", label: "Impulso", pts: 1 },
              { v: "envolvente", label: "Envolvente", pts: 1 },
              { v: "pin_bar", label: "Pin bar", pts: 1 },
              { v: "indecision", label: "Indecisión", pts: 0.3 },
              { v: "otra", label: "Otra", pts: 0.5 },
              NA_OPTION,
            ],
          },
        ],
      },
      {
        title: "04.7 Volumen",
        questions: [
          {
            id: "cf5_volume",
            label: "¿El volumen acompaña la ruptura?",
            hint: "El volumen es confirmador, no un gatillo independiente.",
            options: [
              { v: "si", label: "Sí", pts: 1 },
              { v: "no", label: "No", pts: 0.2 },
              { v: "dudoso", label: "Dudoso", pts: 0.5 },
              { v: "no_disponible", label: "No disponible", pts: 0, na: true },
              NA_OPTION,
            ],
          },
          {
            id: "cf_basis",
            label: "La entrada se basa en:",
            options: [
              { v: "objetivo", label: "Algo objetivo", pts: 1 },
              { v: "intuicion", label: "Intuición", pts: 0 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "riesgo",
    step: "05",
    title: "Riesgo",
    weight: 10,
    groups: [
      {
        title: "05.1 Stop Loss",
        questions: [
          {
            id: "r_sl_fibo_ok",
            label: "¿El SL predeterminado en 0,75 es compatible con la estructura?",
            hint: "El nivel 0,75 es el SL predeterminado sugerido. El sistema nunca coloca órdenes reales.",
            options: [
              { v: "si", label: "Sí", pts: 1 },
              { v: "no", label: "No", pts: 0 },
              { v: "revision", label: "Requiere revisión", pts: 0.4 },
            ],
          },
          {
            id: "r_invalidation",
            label: "¿Sé exactamente dónde mi idea queda invalidada?",
            options: yn(),
          },
          {
            id: "r_stop_logic",
            label: "Mi stop:",
            options: [
              { v: "logica", label: "Tiene lógica", pts: 1 },
              { v: "por_poner", label: 'Está puesto "por poner"', pts: 0 },
            ],
          },
        ],
      },
      {
        title: "05.2 Riesgo y R/R",
        questions: [
          {
            id: "r_limit",
            label: "¿El riesgo por operación está dentro del límite establecido?",
            options: yn(),
          },
          {
            id: "r_rr",
            label: "¿Cuál es la relación riesgo/beneficio?",
            hint: "R/R mínimo recomendado = 1:2. Se calcula automáticamente si existen entrada, SL y TP.",
            options: [
              { v: "menor_1", label: "< 1:1", pts: 0 },
              { v: "1_1", label: "1:1", pts: 0.3 },
              { v: "1_15", label: "1:1,5", pts: 0.6 },
              { v: "1_2", label: "≥ 1:2", pts: 1 },
            ],
          },
          {
            id: "r_loss_ok",
            label: "¿La pérdida de este trade es aceptable para mi cuenta?",
            options: yn(),
          },
        ],
      },
    ],
  },
  {
    id: "recorrido",
    step: "06",
    title: "Recorrido",
    weight: 5,
    groups: [
      {
        questions: [
          {
            id: "rc_target",
            label: "¿Cuál es el objetivo lógico?",
            options: [
              { v: "max_anterior", label: "Máximo anterior", pts: 1 },
              { v: "min_anterior", label: "Mínimo anterior", pts: 1 },
              { v: "prox_resistencia", label: "Próxima resistencia", pts: 1 },
              { v: "prox_soporte", label: "Próximo soporte", pts: 1 },
              { v: "liquidez", label: "Zona de liquidez", pts: 1 },
              { v: "otro", label: "Otro", pts: 0.5 },
            ],
          },
          {
            id: "rc_room",
            label: "¿Existe recorrido suficiente hasta el objetivo?",
            options: ynd(1, 0, 0.4),
          },
          {
            id: "rc_rr2",
            label: "¿El recorrido permite mantener R/R ≥ 1:2?",
            options: yn(),
          },
        ],
      },
    ],
  },
  {
    id: "ejecucion",
    step: "07",
    title: "Ejecución",
    weight: 5,
    groups: [
      {
        questions: [
          {
            id: "ex_conditions",
            label: "¿Todas las condiciones principales fueron cumplidas antes de entrar?",
            options: [
              { v: "si", label: "Sí", pts: 1 },
              { v: "no", label: "No", pts: 0 },
              { v: "parcial", label: "Parcialmente", pts: 0.5 },
            ],
          },
          {
            id: "m5_timing",
            label: "¿La entrada se realizó después de la confirmación?",
            options: [
              { v: "despues", label: "Sí", pts: 1 },
              { v: "antes", label: "No", pts: 0 },
            ],
          },
          {
            id: "ex_plan",
            label: "¿La entrada fue ejecutada según el plan?",
            options: yn(),
          },
          {
            id: "ex_respect",
            label: "¿Voy a respetar el plan sin moverlo por impulso?",
            options: yn(),
          },
        ],
      },
    ],
  },
  {
    id: "disciplina",
    step: "08",
    title: "Disciplina",
    weight: 5,
    groups: [
      {
        questions: [
          {
            id: "ds_why",
            label: "¿Estoy entrando porque el sistema lo permite o por FOMO?",
            options: [
              { v: "senal", label: "Sistema", pts: 1 },
              { v: "impulso", label: "FOMO", pts: 0 },
            ],
          },
          {
            id: "ds_revenge",
            label: "¿Estoy intentando recuperar una pérdida?",
            options: yn(0, 1),
          },
          {
            id: "ds_rules",
            label: "¿Estoy modificando las reglas para justificar la entrada?",
            options: yn(0, 1),
          },
          {
            id: "ds_plan",
            label: "¿Estoy respetando mi plan?",
            options: [
              { v: "cumple", label: "Sí", pts: 1 },
              { v: "forzando", label: "No", pts: 0 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "resultados",
    step: "09",
    title: "Resultados",
    weight: 5,
    postTrade: true,
    groups: [
      {
        questions: [
          {
            id: "rs_result",
            label: "Resultado de la operación:",
            options: [
              { v: "ganadora", label: "Ganadora", pts: 1 },
              { v: "perdedora", label: "Perdedora", pts: 1 },
              { v: "break_even", label: "Break Even", pts: 1 },
            ],
          },
          {
            id: "rs_process",
            label: "¿La calidad del proceso fue la esperada, más allá del resultado?",
            options: [
              { v: "si", label: "Sí", pts: 1 },
              { v: "no", label: "No", pts: 0 },
              { v: "parcial", label: "Parcialmente", pts: 0.5 },
            ],
          },
        ],
      },
    ],
  },
];

export const SECTION_BY_ID = Object.fromEntries(SECTIONS.map((s) => [s.id, s])) as Record<
  SectionId,
  Section
>;

export const WIZARD_STEPS = [
  { key: "trade", step: "00", title: "Comercio" },
  ...SECTIONS.filter((s) => s.id !== "comercio" && s.id !== "resultados").map((s) => ({
    key: s.id,
    step: s.step,
    title: s.title,
  })),
  { key: "resultado", step: "09", title: "Resultados" },
];

/**
 * Preguntas de bloques y criterios retirados (Volatilidad / Momentum / Fibonacci antiguo).
 * Solo se usan para VISUALIZAR evaluaciones antiguas ya guardadas.
 * No forman parte del wizard ni del cálculo del score.
 */
export const LEGACY_SECTIONS: { id: string; title: string; questions: Question[] }[] = [
  {
    id: "legacy_checklist",
    title: "Criterios retirados (histórico)",
    questions: [
      { id: "ctx_trend", label: "El token está en:", options: [] },
      { id: "ctx_day", label: "Estoy viendo un día de:", options: [] },
      { id: "ctx_range_pos", label: "Dónde está el precio respecto al rango del día:", options: [] },
      { id: "d_levels", label: "¿Hay pisos y techos relevantes? (diario)", options: [] },
      { id: "d_candles", label: "Dirección de las últimas 2 velas (diario):", options: [] },
      { id: "d_zone", label: "¿El precio choca con una zona importante? (diario)", options: [] },
      { id: "h1_zone", label: "¿Estoy entrando cerca de una zona lógica? (1H)", options: [] },
      { id: "h1_react", label: "¿Hay reacción clara en soporte/resistencia? (1H)", options: [] },
      { id: "m5_signal", label: "¿Tengo una señal de activación real? (5M)", options: [] },
      { id: "m5_break", label: "¿Hubo ruptura de estructura o diagonal? (5M)", options: [] },
      { id: "z_side", label: "Estoy operando:", options: [] },
      { id: "z_vol", label: "Hay volatilidad:", options: [] },
      { id: "cf_vol_favors", label: "La volatilidad favorece:", options: [] },
      { id: "cf_entry_phase", label: "Estoy entrando en:", options: [] },
      { id: "r_stop_tight", label: "¿Mi stop está demasiado cerca para la volatilidad?", options: [] },
      { id: "r_space", label: "¿Hay espacio suficiente para moverse a favor?", options: [] },
      { id: "r_reward", label: "¿Lo que podría ganar compensa lo que arriesgo?", options: [] },
      { id: "rc_obstacle", label: "¿Zona contraria relevante antes del objetivo?", options: [] },
      { id: "rc_session", label: "¿El recorrido es alcanzable en la sesión actual?", options: [] },
      { id: "ex_favor", label: "¿Qué haré si el precio va a favor?", options: [] },
      { id: "ex_lateral", label: "¿Qué haré si el precio se queda lateral?", options: [] },
      { id: "ex_against", label: "¿Qué haré si el precio va en contra?", options: [] },
      { id: "ds_motive", label: "Estoy operando por:", options: [] },
      { id: "ds_explain", label: "¿Podría explicar esta entrada en una frase?", options: [] },
      { id: "v_candles", label: "Las velas se están haciendo:", options: [] },
      { id: "v_market", label: "El mercado:", options: [] },
      { id: "v_atr_level", label: "ATR (nivel):", options: [] },
      { id: "v_atr_dir", label: "ATR (dirección):", options: [] },
      { id: "v_bb", label: "Bandas de Bollinger:", options: [] },
      { id: "v_range", label: "Rango del día:", options: [] },
      { id: "mo_force", label: "¿El movimiento actual todavía tiene fuerza?", options: [] },
      { id: "mo_candles", label: "Las velas mantienen:", options: [] },
      { id: "mo_levels", label: "El precio:", options: [] },
      { id: "mo_wicks", label: "¿Hay mechas que muestran rechazo?", options: [] },
      { id: "mo_shorter", label: "¿Cada avance es más corto que el anterior?", options: [] },
      { id: "mo_fails", label: "¿Hay fallos de continuación?", options: [] },
      { id: "mo_rsi", label: "RSI acompaña:", options: [] },
      { id: "mo_macd", label: "MACD: ¿El histograma se está achicando?", options: [] },
      { id: "mo_volume", label: "Volumen: ¿Acompaña el movimiento?", options: [] },
    ],
  },
];

export const SETUPS = ["Continuación", "Reversión", "Ruptura", "Retesteo", "Otro"];
export const MARKETS = ["Crypto", "Forex", "Índices", "Acciones", "Futuros", "Otro"];
export const SESSIONS = ["Asia", "Londres", "Nueva York", "Overlap", "Fuera de sesión"];
