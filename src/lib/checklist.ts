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

/**
 * Estado de un patrón (5 factores oficiales de ANIKE EJEPIKA).
 * Los valores `formacion` e `invalidado` se conservan: los usan las HARD rules
 * y los avisos CONDICIONAL del motor.
 */
const PATTERN_STATE: Option[] = [
  { v: "confirmado", label: "Confirmado", pts: 1 },
  { v: "fuerte", label: "Confirmación fuerte pero no completa", pts: 0.75 },
  { v: "formacion", label: "En proceso de confirmación", pts: 0.5 },
  { v: "debil", label: "Señal débil", pts: 0.25 },
  { v: "invalidado", label: "Invalidado / sin confirmación", pts: 0 },
];

/** Escala oficial de factores: 1,00 / 0,75 / 0,50 / 0,25 / 0,00. No existe "No aplica". */
const f5 = (l1: string, l2: string, l3: string, l4: string, l5: string): Option[] => [
  { v: "excelente", label: l1, pts: 1 },
  { v: "fuerte", label: l2, pts: 0.75 },
  { v: "parcial", label: l3, pts: 0.5 },
  { v: "debil", label: l4, pts: 0.25 },
  { v: "ausente", label: l5, pts: 0 },
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

/**
 * Definición base del cuestionario. `SECTIONS` (lo que ve el usuario y lo que
 * usa el cálculo) se deriva de aquí quitando cualquier opción "No aplica":
 * regla ANIKE EJEPIKA — toda pregunta del cuestionario ACTIVO es obligatoria.
 */
const SECTIONS_SOURCE: Section[] = [
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
            label: "¿El patrón de cambio está confirmado?",
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
              {
                v: "tri_desc",
                label: "Triángulo descendente — posible continuidad bajista",
                pts: 1,
              },
              {
                v: "banderin_alcista",
                label: "Banderín alcista — posible continuidad alcista",
                pts: 1,
              },
              {
                v: "banderin_bajista",
                label: "Banderín bajista — posible continuidad bajista",
                pts: 1,
              },
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

/** Valor histórico "no aplica" ya guardado en evaluaciones antiguas (sólo lectura). */
export const HISTORICAL_NA_VALUE = "na";

/**
 * Elimina las opciones "No aplica" del cuestionario activo. No borra datos:
 * las respuestas históricas con valor "na" siguen leyéndose tal cual.
 */
function withoutNaOptions(sections: Section[]): Section[] {
  return sections.map((section) => ({
    ...section,
    groups: section.groups.map((group) => ({
      ...group,
      questions: group.questions.map((question) => ({
        ...question,
        options: question.options.filter((option) => !option.na),
      })),
    })),
  }));
}

export const SECTIONS: Section[] = withoutNaOptions(SECTIONS_SOURCE);

export const SECTION_BY_ID = Object.fromEntries(SECTIONS.map((s) => [s.id, s])) as Record<
  SectionId,
  Section
>;

export const WIZARD_STEPS = [
  { key: "setup", step: "S", title: "Setup" },
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
      {
        id: "ctx_range_pos",
        label: "Dónde está el precio respecto al rango del día:",
        options: [],
      },
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
      {
        id: "r_stop_tight",
        label: "¿Mi stop está demasiado cerca para la volatilidad?",
        options: [],
      },
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

/**
 * REGISTRO MAESTRO de los 5 SETUPS OFICIALES de ANIKE EJEPIKA.
 * `id` es la identificación estable que se persiste en `evaluations.setup`
 * (campo existente reutilizado: no se crea columna nueva).
 * `focus` sólo señala qué criterios del CORE son los más relevantes del setup:
 * NO altera pesos, gates, HARD ni la fórmula del score.
 */
export type OfficialSetupId =
  "REVERSION" | "CONTINUACION" | "RUPTURA_RETESTEO" | "ZONA_FIBONACCI" | "IMPULSO_PULLBACK";

export type OfficialSetup = {
  id: OfficialSetupId;
  code: string;
  name: string;
  label: string;
  description: string;
  /** IDs de preguntas del CORE que este setup debe revisar con prioridad. */
  focus: string[];
};

export const OFFICIAL_SETUPS: OfficialSetup[] = [
  {
    id: "REVERSION",
    code: "S01",
    name: "REVERSIÓN",
    label: "S01 — REVERSIÓN",
    description: "El precio agota su movimiento en zona y gira contra la última dirección.",
    focus: [
      "h1_pattern_change",
      "h1_pattern_change_state",
      "h1_rsi_div",
      "h1_rsi_div_fibo",
      "z_type",
      "z_reacted",
      "cf_price_action",
    ],
  },
  {
    id: "CONTINUACION",
    code: "S02",
    name: "CONTINUACIÓN",
    label: "S02 — CONTINUACIÓN",
    description: "La tendencia principal sigue vigente y el precio retoma su dirección.",
    focus: [
      "ctx_direction",
      "ctx_swings",
      "h1_structure",
      "h1_pattern_cont",
      "h1_pattern_cont_state",
      "h1_macd",
      "rc_room",
    ],
  },
  {
    id: "RUPTURA_RETESTEO",
    code: "S03",
    name: "RUPTURA + RETESTEO",
    label: "S03 — RUPTURA + RETESTEO",
    description:
      "La diagonal o el nivel se rompe y el precio vuelve a validarlo antes de continuar.",
    focus: [
      "cf5_diag_break",
      "cf5_close",
      "cf5_retest",
      "cf5_retest_ok",
      "cf5_volume",
      "z_relevance",
    ],
  },
  {
    id: "ZONA_FIBONACCI",
    code: "S04",
    name: "ZONA + FIBONACCI",
    label: "S04 — ZONA + FIBONACCI",
    description: "Confluencia entre una zona relevante y un retroceso Fibonacci oficial.",
    focus: ["h1_fibo", "h1_fibo_react", "h1_fibo_weak", "z_type", "z_relevance", "r_sl_fibo_ok"],
  },
  {
    id: "IMPULSO_PULLBACK",
    code: "S05",
    name: "IMPULSO + PULLBACK",
    label: "S05 — IMPULSO + PULLBACK",
    description: "Tras un impulso con fuerza, el precio corrige y ofrece entrada a favor.",
    focus: [
      "ctx_swings",
      "h1_structure",
      "h1_fibo",
      "cf5_rsi",
      "cf5_rsi_extended",
      "rc_target",
      "rc_rr2",
    ],
  },
];

export const OFFICIAL_SETUP_IDS = OFFICIAL_SETUPS.map((s) => s.id);

/** Etiqueta legible de un setup guardado. Compatible con evaluaciones históricas. */
export function setupLabel(value: string | null | undefined): string {
  if (!value) return "Setup histórico / no especificado";
  const found = OFFICIAL_SETUPS.find((s) => s.id === value);
  return found ? found.label : value;
}

export function findOfficialSetup(value: string | null | undefined): OfficialSetup | null {
  if (!value) return null;
  return OFFICIAL_SETUPS.find((s) => s.id === value) ?? null;
}

/** Preguntas prioritarias del setup seleccionado (subconjunto del CORE existente). */
export function setupFocusQuestions(value: string | null | undefined): string[] {
  return findOfficialSetup(value)?.focus ?? [];
}

/**
 * Patrones individuales (no son setups): siguen siendo criterios de la evaluación.
 * Se conserva sólo para leer datos históricos y para las preferencias antiguas.
 */
export const SETUP_GROUPS: { title: string; items: string[] }[] = [
  {
    title: "Estructura y ejecución",
    items: [
      "Continuación de tendencia",
      "Reversión en zona",
      "Cambio de estructura",
      "Ruptura de diagonal",
      "Retesteo de ruptura",
      "Retroceso Fibonacci 0,38",
      "Retroceso Fibonacci 0,50",
      "Retroceso Fibonacci 0,618",
      "Divergencia RSI",
      "MACD pierde fuerza en zona",
      "Otro",
    ],
  },
  {
    title: "Patrones de cambio",
    items: [
      "Doble techo",
      "Doble suelo",
      "Triple techo",
      "Triple suelo",
      "Hombro cabeza hombro",
      "Hombro cabeza hombro invertido",
      "Cuña ascendente",
      "Cuña descendente",
      "Suelo redondeado",
      "Techo redondeado",
      "Púa alcista",
      "Púa bajista",
    ],
  },
  {
    title: "Patrones de continuidad",
    items: [
      "Triángulo simétrico",
      "Triángulo ascendente",
      "Triángulo descendente",
      "Banderín alcista",
      "Banderín bajista",
      "Bandera rectangular alcista",
      "Bandera rectangular bajista",
      "Rectángulo",
    ],
  },
];

export const SETUPS = OFFICIAL_SETUP_IDS;

export const MARKETS = ["Crypto", "Forex", "Índices", "Acciones", "Futuros", "Otro"];
export const SESSIONS = ["Asia", "Londres", "Nueva York", "Overlap", "Fuera de sesión"];

/* ===========================================================================
 * MATRIZ OFICIAL SETUP → PREGUNTAS (única fuente de verdad)
 * ---------------------------------------------------------------------------
 * Toda pregunta del cuestionario debe estar declarada EXPLÍCITAMENTE en una de
 * estas tres listas:
 *   1. COMMON_QUESTION_IDS        → común, intencionalmente, a los 5 setups
 *   2. SETUP_EXCLUSIVE_QUESTIONS  → exclusiva de UN setup oficial
 *   3. UNUSED_QUESTION_IDS        → declarada fuera de los 5 setups
 * NO existe fallback: una pregunta sin declarar NO entra en ningún cuestionario
 * y `validateSetupQuestionMatrix()` la reporta como error de configuración.
 * La matriz NO modifica pesos, fórmula del score, gates, HARD rules ni estados.
 * =========================================================================== */

/** Preguntas comunes a los 5 setups, declaradas de forma intencional. */
export const COMMON_QUESTION_IDS: string[] = [
  // Comercio
  "co_instrument",
  "co_conditions",
  // Contexto
  "ctx_direction",
  "ctx_swings",
  "ctx_aligned",
  "ctx_levels",
  "ctx_near_zone",
  // Estructura base
  "h1_structure",
  "h1_struct",
  // Zona
  "z_relevance",
  "z_reacted",
  "z_space",
  "z_clear",
  "z_mid",
  // Confirmación base (incluye los criterios de HARD rules del CORE)
  "cf5_diag_break",
  "cf5_close",
  "cf_signal",
  "cf_basis",
  // Riesgo
  "r_sl_fibo_ok",
  "r_invalidation",
  "r_stop_logic",
  "r_limit",
  "r_rr",
  "r_loss_ok",
  // Recorrido
  "rc_target",
  "rc_room",
  "rc_rr2",
  // Ejecución
  "ex_conditions",
  "m5_timing",
  "ex_plan",
  "ex_respect",
  // Disciplina
  "ds_why",
  "ds_revenge",
  "ds_rules",
  "ds_plan",
  // Resultados (post-cierre)
  "rs_result",
  "rs_process",
];

/** Preguntas EXCLUSIVAS de cada setup oficial. Una pregunta sólo puede figurar en uno. */
export const SETUP_EXCLUSIVE_QUESTIONS: Record<OfficialSetupId, string[]> = {
  REVERSION: [
    "h1_pattern_change",
    "h1_pattern_change_state",
    "h1_rsi_div",
    "h1_rsi_div_fibo",
    "cf_price_action",
  ],
  CONTINUACION: ["h1_pattern_cont", "h1_pattern_cont_state", "h1_macd", "cf5_macd_cross"],
  RUPTURA_RETESTEO: ["cf5_retest", "cf5_retest_ok", "cf5_volume"],
  ZONA_FIBONACCI: ["h1_fibo", "h1_fibo_react", "h1_fibo_weak", "z_type"],
  IMPULSO_PULLBACK: ["cf5_rsi", "cf5_rsi_extended", "cf5_macd"],
};

/**
 * Preguntas del CORE declaradas fuera de los 5 setups oficiales (categoría G).
 * Hoy no existe ninguna: la lista queda explícita para que cualquier alta futura
 * sea una decisión consciente y no un efecto de la ausencia de mapeo.
 */
export const UNUSED_QUESTION_IDS: string[] = [];

/** Pregunta ya resuelta para un setup concreto: `setupId` es explícito. */
export type SetupQuestion = Question & { setupId: OfficialSetupId; sectionId: SectionId };

const ALL_CORE_QUESTIONS: { question: Question; sectionId: SectionId }[] = SECTIONS.flatMap((s) =>
  s.groups.flatMap((g) => g.questions.map((question) => ({ question, sectionId: s.id }))),
);

/**
 * Pertenencia EXPLÍCITA: la pregunta debe estar en la lista de comunes o en la
 * lista exclusiva del setup. No hay ningún `return true` por defecto.
 */
export function belongsExplicitlyToSetup(questionId: string, setupId: string): boolean {
  const exclusive = SETUP_EXCLUSIVE_QUESTIONS[setupId as OfficialSetupId];
  if (!exclusive) return false;
  return COMMON_QUESTION_IDS.includes(questionId) || exclusive.includes(questionId);
}

const SETUP_QUESTIONS: Record<OfficialSetupId, SetupQuestion[]> = Object.fromEntries(
  OFFICIAL_SETUP_IDS.map((setupId) => [
    setupId,
    ALL_CORE_QUESTIONS.filter(({ question }) => belongsExplicitlyToSetup(question.id, setupId)).map(
      ({ question, sectionId }) => ({ ...question, setupId, sectionId }),
    ),
  ]),
) as Record<OfficialSetupId, SetupQuestion[]>;

/**
 * Auditoría de la matriz: detecta preguntas sin declarar, declaradas dos veces o
 * inexistentes. Los tests exigen que devuelva una lista vacía.
 */
export function validateSetupQuestionMatrix(): string[] {
  const problems: string[] = [];
  const all = ALL_CORE_QUESTIONS.map(({ question }) => question.id);
  const exclusiveAll = OFFICIAL_SETUP_IDS.flatMap((id) => SETUP_EXCLUSIVE_QUESTIONS[id]);

  for (const id of all) {
    const declarations =
      (COMMON_QUESTION_IDS.includes(id) ? 1 : 0) +
      exclusiveAll.filter((q) => q === id).length +
      (UNUSED_QUESTION_IDS.includes(id) ? 1 : 0);
    if (declarations === 0) problems.push(`sin declarar en la matriz: ${id}`);
    if (declarations > 1) problems.push(`declarada más de una vez: ${id}`);
  }
  for (const id of [...COMMON_QUESTION_IDS, ...exclusiveAll, ...UNUSED_QUESTION_IDS]) {
    if (!all.includes(id)) problems.push(`declarada pero inexistente en el CORE: ${id}`);
  }
  return problems;
}

/** Devuelve EXCLUSIVAMENTE las preguntas autorizadas del setup. Setup inválido → []. */
export function getQuestionsForSetup(setupId: string | null | undefined): SetupQuestion[] {
  if (!setupId) return [];
  return SETUP_QUESTIONS[setupId as OfficialSetupId] ?? [];
}

/** IDs de preguntas activas del setup (usado por el wizard y por el cálculo). */
export function activeQuestionIds(setupId: string | null | undefined): Set<string> {
  return new Set(getQuestionsForSetup(setupId).map((q) => q.id));
}

/** Grupos de una sección ya filtrados por setup (el wizard sólo renderiza esto). */
export function sectionGroupsForSetup(
  section: Section,
  setupId: string | null | undefined,
): { title?: string; questions: SetupQuestion[] }[] {
  const active = getQuestionsForSetup(setupId);
  const byId = new Map(active.map((q) => [q.id, q]));
  return section.groups
    .map((g) => ({
      ...(g.title ? { title: g.title } : {}),
      questions: g.questions.flatMap((q) => {
        const found = byId.get(q.id);
        return found ? [found] : [];
      }),
    }))
    .filter((g) => g.questions.length > 0);
}

/**
 * Reconstruye las respuestas al cambiar de setup: conserva ÚNICAMENTE las
 * respuestas de preguntas autorizadas por el nuevo setup (asociación por
 * questionId estable, nunca por índice). No inyecta ningún valor.
 */
export function answersForSetup(
  answers: Record<string, string>,
  setupId: string | null | undefined,
): Record<string, string> {
  const active = activeQuestionIds(setupId);
  if (active.size === 0) return {};
  const next: Record<string, string> = {};
  for (const [id, value] of Object.entries(answers)) {
    if (active.has(id)) next[id] = value;
  }
  return next;
}

/**
 * Preguntas ACTIVAS del setup que aún no tienen respuesta. Toda pregunta activa
 * es obligatoria: mientras la lista no esté vacía la evaluación está incompleta.
 * Las preguntas post-cierre (Resultados) no bloquean la evaluación de entrada.
 */
export function missingActiveAnswers(
  answers: Record<string, string>,
  setupId: string | null | undefined,
  options?: { includePostTrade?: boolean },
): string[] {
  const postTradeIds = new Set(
    SECTIONS.filter((s) => s.postTrade).flatMap((s) =>
      s.groups.flatMap((g) => g.questions.map((q) => q.id)),
    ),
  );
  return getQuestionsForSetup(setupId)
    .filter((q) => options?.includePostTrade === true || !postTradeIds.has(q.id))
    .filter((q) => {
      const value = answers[q.id];
      return value === undefined || value === "";
    })
    .map((q) => q.id);
}
