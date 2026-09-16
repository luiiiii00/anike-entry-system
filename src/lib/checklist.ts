/** `na: true` marca una opción "No aplica": no penaliza ni suma, se excluye del cálculo. */
export type Option = { v: string; label: string; pts: number; na?: boolean };
/** `meta: true` marca una pregunta DESCRIPTIVA (patrón, nivel Fibonacci): nunca puntúa. */
/** Temporalidades oficiales del flujo ANIKE EJEPIKA: 1D → 1H → 5M. */
export type Timeframe = "1D" | "1H" | "5M";
export const TIMEFRAMES: Timeframe[] = ["1D", "1H", "5M"];

export type Question = {
  id: string;
  label: string;
  hint?: string;
  meta?: boolean;
  /** Temporalidad de análisis asociada. Informativa: no altera el cálculo CORE. */
  timeframe?: Timeframe;
  options: Option[];
};
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
            label: "¿El patrón de continuidad está confirmado?",
            options: PATTERN_STATE,
          },
        ],
      },
      {
        title: "02.4 Fibonacci",
        questions: [
          {
            id: "h1_fibo",
            label: "¿Qué nivel Fibonacci oficial está siendo utilizado?",
            hint: "0,75 es principalmente la referencia del SL predeterminado, no una señal de entrada por sí misma.",
            options: [
              { v: "0_618", label: "0,618", pts: 1 },
              { v: "0_50", label: "0,50", pts: 1 },
              { v: "0_38", label: "0,38", pts: 0.75 },
              { v: "0_75", label: "0,75", pts: 0.75 },
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
/**
 * TIMEFRAME DE ANÁLISIS (multi-temporalidad ANIKE EJEPIKA: 1D → 1H → 5M).
 * El timeframe es un ATRIBUTO/CONTEXTO de la pregunta: no duplica preguntas, no
 * cambia pesos, factores, fórmula, gates, HARD rules ni estados. Se determina por
 * el bloque CORE al que pertenece la pregunta (flujo oficial) y puede afinarse
 * por pregunta concreta mediante `QUESTION_TIMEFRAME`.
 */
export const SECTION_TIMEFRAME: Partial<Record<SectionId, Timeframe>> = {
  contexto: "1D",
  estructura: "1H",
  zona: "1H",
  confirmacion: "5M",
  riesgo: "1H",
  recorrido: "1H",
  ejecucion: "5M",
};

/** Excepciones explícitas pregunta → timeframe (prioridad sobre el bloque). */
export const QUESTION_TIMEFRAME: Record<string, Timeframe> = {
  h1_zone: "1H",
  h1_react: "1H",
  m5_signal: "5M",
  m5_break: "5M",
};

/** Timeframe asociado a una pregunta dentro de su bloque CORE. */
export function questionTimeframe(questionId: string, sectionId: SectionId): Timeframe | undefined {
  return QUESTION_TIMEFRAME[questionId] ?? SECTION_TIMEFRAME[sectionId];
}

function withTimeframes(sections: Section[]): Section[] {
  return sections.map((section) => ({
    ...section,
    groups: section.groups.map((group) => ({
      ...group,
      questions: group.questions.map((question) => {
        const timeframe = question.timeframe ?? questionTimeframe(question.id, section.id);
        return timeframe ? { ...question, timeframe } : question;
      }),
    })),
  }));
}

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

/* ===========================================================================
 * CRITERIOS ESPECÍFICOS DE CADA SETUP OFICIAL (S01–S05)
 * ---------------------------------------------------------------------------
 * Cada bloque declara EXPLÍCITAMENTE a qué setup y a qué bloque CORE pertenece.
 * Los pesos CORE, la fórmula, los gates, las HARD rules, el umbral 80 y los
 * estados NO cambian: el setup sólo determina qué criterios se evalúan.
 * =========================================================================== */
type SetupSpecificBlock = {
  setup: OfficialSetupId;
  sectionId: SectionId;
  title: string;
  questions: Question[];
};

/**
 * Opciones de METADATA (descripción). No producen puntos: `meta: true` excluye la
 * pregunta del cálculo del score. Seleccionar un patrón identifica el patrón, no
 * confirma nada por sí mismo.
 */
const metaOptions = (items: { v: string; label: string }[]): Option[] =>
  items.map((i) => ({ v: i.v, label: i.label, pts: 0 }));

const REVERSAL_PATTERNS = metaOptions([
  { v: "doble_techo", label: "Doble techo" },
  { v: "doble_suelo", label: "Doble suelo" },
  { v: "triple_techo", label: "Triple techo" },
  { v: "triple_suelo", label: "Triple suelo" },
  { v: "hch", label: "HCH" },
  { v: "hch_invertido", label: "HCH invertido" },
  { v: "cuna_ascendente", label: "Cuña ascendente" },
  { v: "cuna_descendente", label: "Cuña descendente" },
  { v: "techo_redondeado", label: "Techo redondeado" },
  { v: "suelo_redondeado", label: "Suelo redondeado" },
  { v: "pua_alcista", label: "Púa alcista" },
  { v: "pua_bajista", label: "Púa bajista" },
]);

const CONTINUATION_PATTERNS = metaOptions([
  { v: "triangulo_simetrico", label: "Triángulo simétrico" },
  { v: "triangulo_ascendente", label: "Triángulo ascendente" },
  { v: "triangulo_descendente", label: "Triángulo descendente" },
  { v: "banderin_alcista", label: "Banderín alcista" },
  { v: "banderin_bajista", label: "Banderín bajista" },
  { v: "bandera_alcista", label: "Bandera rectangular alcista" },
  { v: "bandera_bajista", label: "Bandera rectangular bajista" },
  { v: "rectangulo", label: "Rectángulo" },
]);

const FIBO_META_OPTIONS = metaOptions([
  { v: "0_618", label: "0,618" },
  { v: "0_50", label: "0,50" },
  { v: "0_38", label: "0,38" },
  { v: "0_75", label: "0,75" },
]);

/** Escalas reutilizadas por los criterios comunes a los cinco setups. */
const STOP_SCALE = f5(
  "Detrás de la invalidación, con margen correcto",
  "Detrás de la invalidación",
  "Justo en el límite",
  "Demasiado ajustado",
  "No respeta la invalidación",
);
const ROOM_SCALE = f5(
  "Recorrido amplio y libre",
  "Recorrido suficiente",
  "Recorrido justo",
  "Recorrido escaso",
  "No hay recorrido",
);
const ENTRY_SCALE = f5(
  "Entrada tras confirmación, sin perseguir",
  "Entrada correcta con leve retraso",
  "Entrada parcialmente anticipada",
  "Entrada persiguiendo el precio",
  "Entrada anticipada sin confirmación",
);
const PLAN_SCALE = f5(
  "Cumple el plan por completo",
  "Cumple el plan con desviación mínima",
  "Cumple parcialmente",
  "Se desvía del plan",
  "No respeta el plan",
);
const CONFIRM_SCALE = f5("Claramente", "Mayormente", "Parcialmente", "Débilmente", "No confirma");

/**
 * MATRICES MAESTRAS DE LOS SETUPS OFICIALES (S01–S05).
 * Cada criterio declara su setup y su bloque CORE (00–08). Ninguna pregunta
 * pertenece a dos setups. No hay fallback ni mezcla entre matrices.
 */
const SETUP_SPECIFIC: SetupSpecificBlock[] = [
  // ---------------------------------------------------------------- S01
  {
    setup: "REVERSION",
    sectionId: "contexto",
    title: "S01 — REVERSIÓN · Contexto",
    questions: [
      {
        id: "s01_prev_trend",
        label:
          "R1 · ¿Existe una tendencia o estructura previa claramente identificable que pueda ser revertida?",
        options: f5(
          "Sí, claramente identificable",
          "Sí, pero parcialmente definida",
          "Poco clara",
          "Muy débil",
          "No existe",
        ),
      },
    ],
  },
  {
    setup: "REVERSION",
    sectionId: "estructura",
    title: "S01 — REVERSIÓN · Estructura",
    questions: [
      {
        id: "s01_exhaustion",
        label: "R2 · ¿El movimiento previo presenta señales de agotamiento?",
        options: f5(
          "Agotamiento claro",
          "Agotamiento fuerte",
          "Agotamiento parcial",
          "Evidencia débil",
          "No hay agotamiento",
        ),
      },
      {
        id: "s01_key_level",
        label:
          "R3 · ¿Existe un máximo/mínimo relevante que defina la zona crítica de la reversión?",
        options: f5(
          "Nivel claramente definido",
          "Nivel relevante",
          "Nivel moderadamente claro",
          "Nivel poco claro",
          "No existe nivel relevante",
        ),
      },
      {
        id: "s01_structure_change",
        label: "R4 · ¿Existe cambio de estructura confirmado a favor de la nueva dirección?",
        options: f5(
          "Cambio de estructura confirmado",
          "Evidencia fuerte",
          "Cambio parcialmente definido",
          "Primer indicio solamente",
          "No existe cambio",
        ),
      },
      {
        id: "s01_pattern",
        label: "R7 · Patrón de reversión identificado (descriptivo, no puntúa):",
        hint: "Identifica el patrón. No suma ni resta puntos: la puntuación depende de los criterios de evaluación.",
        meta: true,
        options: REVERSAL_PATTERNS,
      },
    ],
  },
  {
    setup: "REVERSION",
    sectionId: "zona",
    title: "S01 — REVERSIÓN · Zona",
    questions: [
      {
        id: "s01_zone_relevant",
        label: "R5 · ¿La reversión ocurre dentro de una zona técnica relevante?",
        options: f5(
          "Zona muy relevante",
          "Zona relevante",
          "Zona moderadamente relevante",
          "Zona poco relevante",
          "No existe zona",
        ),
      },
      {
        id: "s01_zone_reaction",
        label: "R6 · ¿La zona presenta una reacción coherente con una posible reversión?",
        options: f5(
          "Reacción clara",
          "Reacción fuerte",
          "Reacción parcial",
          "Reacción débil",
          "Sin reacción",
        ),
      },
    ],
  },
  {
    setup: "REVERSION",
    sectionId: "confirmacion",
    title: "S01 — REVERSIÓN · Confirmación",
    questions: [
      {
        id: "s01_pattern_confirmed",
        label: "R8 · ¿El patrón o estructura de reversión está confirmado?",
        options: f5(
          "Confirmado",
          "Confirmación fuerte",
          "Parcialmente confirmado",
          "En formación",
          "Sin confirmación",
        ),
      },
      {
        id: "s01_confirm_direction",
        label: "R9 · ¿El precio confirma la nueva dirección antes de la entrada?",
        options: CONFIRM_SCALE,
      },
    ],
  },
  {
    setup: "REVERSION",
    sectionId: "riesgo",
    title: "S01 — REVERSIÓN · Riesgo",
    questions: [
      {
        id: "s01_stop_invalidation",
        label: "R10 · ¿El Stop Loss está detrás de la invalidación lógica de la reversión?",
        options: STOP_SCALE,
      },
    ],
  },
  {
    setup: "REVERSION",
    sectionId: "recorrido",
    title: "S01 — REVERSIÓN · Recorrido",
    questions: [
      {
        id: "s01_room",
        label:
          "R11 · ¿Existe recorrido suficiente hasta el objetivo antes de una zona opuesta relevante?",
        options: ROOM_SCALE,
      },
    ],
  },
  {
    setup: "REVERSION",
    sectionId: "ejecucion",
    title: "S01 — REVERSIÓN · Ejecución",
    questions: [
      {
        id: "s01_entry_after_confirm",
        label: "R12 · ¿La entrada se ejecuta después de la confirmación sin perseguir el precio?",
        options: ENTRY_SCALE,
      },
    ],
  },
  {
    setup: "REVERSION",
    sectionId: "disciplina",
    title: "S01 — REVERSIÓN · Disciplina",
    questions: [
      {
        id: "s01_plan_respect",
        label: "R13 · ¿La operación respeta completamente el plan del setup?",
        options: PLAN_SCALE,
      },
    ],
  },
  // ---------------------------------------------------------------- S02
  {
    setup: "CONTINUACION",
    sectionId: "contexto",
    title: "S02 — CONTINUACIÓN · Contexto",
    questions: [
      {
        id: "s02_trend_defined",
        label: "C1 · ¿Existe una tendencia dominante claramente definida?",
        options: f5(
          "Tendencia muy clara",
          "Tendencia clara",
          "Tendencia moderada",
          "Tendencia débil",
          "No existe tendencia",
        ),
      },
    ],
  },
  {
    setup: "CONTINUACION",
    sectionId: "estructura",
    title: "S02 — CONTINUACIÓN · Estructura",
    questions: [
      {
        id: "s02_swing_sequence",
        label: "C2 · ¿La secuencia de máximos y mínimos mantiene la dirección dominante?",
        options: f5(
          "Secuencia intacta",
          "Secuencia sólida",
          "Secuencia parcial",
          "Secuencia débil",
          "Secuencia rota",
        ),
      },
      {
        id: "s02_correction_valid",
        label: "C3 · ¿La corrección mantiene intacta la estructura principal?",
        options: f5(
          "Mantiene perfectamente",
          "Mantiene con pequeñas desviaciones",
          "Parcialmente",
          "Muy cerca de invalidar",
          "Invalidó la tendencia",
        ),
      },
      {
        id: "s02_pattern",
        label: "C5 · Patrón de continuación identificado (descriptivo, no puntúa):",
        hint: "Identifica el patrón. No modifica el score.",
        meta: true,
        options: CONTINUATION_PATTERNS,
      },
    ],
  },
  {
    setup: "CONTINUACION",
    sectionId: "zona",
    title: "S02 — CONTINUACIÓN · Zona",
    questions: [
      {
        id: "s02_pullback_zone",
        label: "C4 · ¿El retroceso llega a una zona técnica relevante dentro de la tendencia?",
        options: f5(
          "Zona muy relevante",
          "Relevante",
          "Moderadamente relevante",
          "Poco relevante",
          "Sin zona",
        ),
      },
    ],
  },
  {
    setup: "CONTINUACION",
    sectionId: "confirmacion",
    title: "S02 — CONTINUACIÓN · Confirmación",
    questions: [
      {
        id: "s02_pattern_confirmed",
        label: "C6 · ¿El patrón o estructura de continuación está confirmado?",
        options: f5(
          "Confirmado",
          "Confirmación fuerte",
          "Parcialmente confirmado",
          "En formación",
          "Sin confirmación",
        ),
      },
      {
        id: "s02_confirm_direction",
        label: "C7 · ¿El precio confirma la continuación en la dirección de la tendencia?",
        options: CONFIRM_SCALE,
      },
    ],
  },
  {
    setup: "CONTINUACION",
    sectionId: "riesgo",
    title: "S02 — CONTINUACIÓN · Riesgo",
    questions: [
      {
        id: "s02_stop_invalidation",
        label: "C8 · ¿El Stop Loss está detrás de la invalidación de la continuación?",
        options: STOP_SCALE,
      },
    ],
  },
  {
    setup: "CONTINUACION",
    sectionId: "recorrido",
    title: "S02 — CONTINUACIÓN · Recorrido",
    questions: [
      {
        id: "s02_room",
        label:
          "C9 · ¿Existe recorrido suficiente para continuar el movimiento antes de una zona opuesta relevante?",
        options: ROOM_SCALE,
      },
    ],
  },
  {
    setup: "CONTINUACION",
    sectionId: "ejecucion",
    title: "S02 — CONTINUACIÓN · Ejecución",
    questions: [
      {
        id: "s02_entry_after_confirm",
        label:
          "C10 · ¿La entrada se ejecuta después de la confirmación y no durante una corrección incompleta?",
        options: ENTRY_SCALE,
      },
    ],
  },
  {
    setup: "CONTINUACION",
    sectionId: "disciplina",
    title: "S02 — CONTINUACIÓN · Disciplina",
    questions: [
      {
        id: "s02_plan_respect",
        label: "C11 · ¿La operación respeta el plan y las reglas del setup?",
        options: PLAN_SCALE,
      },
    ],
  },
  // ---------------------------------------------------------------- S03
  {
    setup: "RUPTURA_RETESTEO",
    sectionId: "contexto",
    title: "S03 — RUPTURA + RETESTEO · Contexto",
    questions: [
      {
        id: "s03_structure_defined",
        label: "RR1 · ¿Existe una estructura o zona claramente delimitada susceptible de ruptura?",
        options: f5(
          "Claramente definida",
          "Bien definida",
          "Moderadamente definida",
          "Poco clara",
          "No existe",
        ),
      },
    ],
  },
  {
    setup: "RUPTURA_RETESTEO",
    sectionId: "estructura",
    title: "S03 — RUPTURA + RETESTEO · Estructura",
    questions: [
      {
        id: "s03_level_relevant",
        label: "RR2 · ¿El nivel de ruptura es relevante dentro de la estructura actual?",
        options: f5(
          "Nivel muy relevante",
          "Nivel relevante",
          "Relevancia moderada",
          "Poco relevante",
          "Irrelevante",
        ),
      },
      {
        id: "s03_break_displacement",
        label: "RR3 · ¿La ruptura presenta desplazamiento suficiente para considerarse válida?",
        options: f5(
          "Ruptura clara y fuerte",
          "Ruptura clara",
          "Ruptura moderada",
          "Ruptura débil",
          "No existe ruptura válida",
        ),
      },
      {
        id: "s03_break_close",
        label: "RR4 · ¿La ruptura fue confirmada mediante cierre fuera del nivel?",
        options: f5(
          "Cierre claro fuera del nivel",
          "Cierre válido pero débil",
          "Cierre parcialmente válido",
          "Solo penetración intravela",
          "No hubo cierre",
        ),
      },
    ],
  },
  {
    setup: "RUPTURA_RETESTEO",
    sectionId: "zona",
    title: "S03 — RUPTURA + RETESTEO · Zona",
    questions: [
      {
        id: "s03_level_as_retest",
        label: "RR5 · ¿El nivel roto puede actuar como zona de retesteo?",
        options: f5("Claramente", "Sí, con buena estructura", "Parcialmente", "Dudoso", "No"),
      },
      {
        id: "s03_retest_on_level",
        label: "RR6 · ¿El retesteo ocurre realmente sobre el nivel o zona previamente rota?",
        options: f5("Exactamente", "Muy cerca", "Parcialmente", "Alejado", "No existe retesteo"),
      },
    ],
  },
  {
    setup: "RUPTURA_RETESTEO",
    sectionId: "confirmacion",
    title: "S03 — RUPTURA + RETESTEO · Confirmación",
    questions: [
      {
        id: "s03_retest_reaction",
        label: "RR7 · ¿El retesteo presenta rechazo o reacción coherente con la ruptura?",
        options: f5(
          "Reacción clara",
          "Reacción fuerte",
          "Reacción parcial",
          "Reacción débil",
          "Sin reacción",
        ),
      },
      {
        id: "s03_confirm_direction",
        label: "RR8 · ¿El precio confirma la dirección después del retesteo?",
        options: CONFIRM_SCALE,
      },
    ],
  },
  {
    setup: "RUPTURA_RETESTEO",
    sectionId: "riesgo",
    title: "S03 — RUPTURA + RETESTEO · Riesgo",
    questions: [
      {
        id: "s03_stop_invalidation",
        label: "RR9 · ¿El Stop Loss queda detrás de la invalidación del retesteo?",
        options: STOP_SCALE,
      },
    ],
  },
  {
    setup: "RUPTURA_RETESTEO",
    sectionId: "recorrido",
    title: "S03 — RUPTURA + RETESTEO · Recorrido",
    questions: [
      {
        id: "s03_room",
        label: "RR10 · ¿Existe recorrido suficiente hacia el objetivo después de la ruptura?",
        options: ROOM_SCALE,
      },
    ],
  },
  {
    setup: "RUPTURA_RETESTEO",
    sectionId: "ejecucion",
    title: "S03 — RUPTURA + RETESTEO · Ejecución",
    questions: [
      {
        id: "s03_entry_after_confirm",
        label: "RR11 · ¿La entrada se realiza después de la confirmación sin perseguir el precio?",
        options: ENTRY_SCALE,
      },
    ],
  },
  {
    setup: "RUPTURA_RETESTEO",
    sectionId: "disciplina",
    title: "S03 — RUPTURA + RETESTEO · Disciplina",
    questions: [
      {
        id: "s03_plan_respect",
        label: "RR12 · ¿La operación respeta completamente las condiciones del plan?",
        options: PLAN_SCALE,
      },
    ],
  },
  // ---------------------------------------------------------------- S04
  {
    setup: "ZONA_FIBONACCI",
    sectionId: "contexto",
    title: "S04 — ZONA + FIBONACCI · Contexto",
    questions: [
      {
        id: "s04_prev_move",
        label: "ZF1 · ¿Existe un movimiento previo suficientemente claro para aplicar Fibonacci?",
        options: f5(
          "Movimiento muy claro",
          "Movimiento claro",
          "Moderadamente claro",
          "Poco claro",
          "No existe",
        ),
      },
    ],
  },
  {
    setup: "ZONA_FIBONACCI",
    sectionId: "estructura",
    title: "S04 — ZONA + FIBONACCI · Estructura",
    questions: [
      {
        id: "s04_impulse_correct",
        label: "ZF2 · ¿El impulso utilizado para Fibonacci está correctamente identificado?",
        options: f5("Totalmente", "Correctamente", "Parcialmente", "Dudoso", "Incorrecto"),
      },
      {
        id: "s04_structure_sense",
        label: "ZF3 · ¿La estructura mantiene sentido con el retroceso planteado?",
        options: f5("Totalmente", "Mayormente", "Parcialmente", "Débilmente", "No"),
      },
    ],
  },
  {
    setup: "ZONA_FIBONACCI",
    sectionId: "zona",
    title: "S04 — ZONA + FIBONACCI · Zona",
    questions: [
      {
        id: "s04_zone_fibo_match",
        label: "ZF4 · ¿Existe una zona técnica relevante coincidente con el retroceso Fibonacci?",
        options: f5(
          "Coincidencia exacta",
          "Coincidencia clara",
          "Coincidencia parcial",
          "Coincidencia débil",
          "No coincide",
        ),
      },
      {
        id: "s04_fibo_level",
        label: "ZF5 · Nivel Fibonacci utilizado (descriptivo, no puntúa):",
        hint: "Los niveles oficiales son metadata: identifican el retroceso, no puntúan.",
        meta: true,
        options: FIBO_META_OPTIONS,
      },
      {
        id: "s04_confluence_clear",
        label: "ZF6 · ¿La confluencia entre zona y Fibonacci es técnicamente clara?",
        options: f5("Muy clara", "Clara", "Parcial", "Débil", "No existe"),
      },
    ],
  },
  {
    setup: "ZONA_FIBONACCI",
    sectionId: "confirmacion",
    title: "S04 — ZONA + FIBONACCI · Confirmación",
    questions: [
      {
        id: "s04_price_reacting",
        label: "ZF7 · ¿El precio reacciona en la confluencia zona + Fibonacci?",
        options: f5(
          "Reacción clara",
          "Reacción fuerte",
          "Reacción parcial",
          "Reacción débil",
          "Sin reacción",
        ),
      },
      {
        id: "s04_confirm_direction",
        label: "ZF8 · ¿Existe confirmación de la dirección antes de la entrada?",
        options: CONFIRM_SCALE,
      },
      {
        id: "s04_not_only_fibo",
        label:
          "ZF9 · ¿La entrada depende de la confirmación del precio y no únicamente de Fibonacci?",
        options: f5(
          "Confirmación completa",
          "Buena confirmación",
          "Parcial",
          "Depende parcialmente de Fibonacci",
          "Depende únicamente de Fibonacci",
        ),
      },
    ],
  },
  {
    setup: "ZONA_FIBONACCI",
    sectionId: "riesgo",
    title: "S04 — ZONA + FIBONACCI · Riesgo",
    questions: [
      {
        id: "s04_stop_invalidation",
        label: "ZF10 · ¿El Stop Loss está detrás de la invalidación estructural de la zona?",
        options: STOP_SCALE,
      },
    ],
  },
  {
    setup: "ZONA_FIBONACCI",
    sectionId: "recorrido",
    title: "S04 — ZONA + FIBONACCI · Recorrido",
    questions: [
      {
        id: "s04_room",
        label:
          "ZF11 · ¿El objetivo ofrece recorrido suficiente respecto al riesgo y a las zonas opuestas?",
        options: ROOM_SCALE,
      },
    ],
  },
  {
    setup: "ZONA_FIBONACCI",
    sectionId: "ejecucion",
    title: "S04 — ZONA + FIBONACCI · Ejecución",
    questions: [
      {
        id: "s04_entry_after_confirm",
        label: "ZF12 · ¿La entrada se ejecuta después de la confirmación?",
        options: ENTRY_SCALE,
      },
    ],
  },
  {
    setup: "ZONA_FIBONACCI",
    sectionId: "disciplina",
    title: "S04 — ZONA + FIBONACCI · Disciplina",
    questions: [
      {
        id: "s04_plan_respect",
        label: "ZF13 · ¿Se respetan las reglas de aplicación de Fibonacci y el plan?",
        options: PLAN_SCALE,
      },
    ],
  },
  // ---------------------------------------------------------------- S05
  {
    setup: "IMPULSO_PULLBACK",
    sectionId: "contexto",
    title: "S05 — IMPULSO + PULLBACK · Contexto",
    questions: [
      {
        id: "s05_impulse_clear",
        label: "IP1 · ¿Existe un impulso claro y dominante?",
        options: f5("Muy claro", "Claro", "Moderadamente claro", "Débil", "No existe"),
      },
    ],
  },
  {
    setup: "IMPULSO_PULLBACK",
    sectionId: "estructura",
    title: "S05 — IMPULSO + PULLBACK · Estructura",
    questions: [
      {
        id: "s05_impulse_structure",
        label: "IP2 · ¿El impulso genera una estructura coherente con la dirección operada?",
        options: f5(
          "Totalmente coherente",
          "Coherente",
          "Parcialmente coherente",
          "Poco coherente",
          "Incoherente",
        ),
      },
      {
        id: "s05_pullback_valid",
        label: "IP3 · ¿El pullback mantiene la estructura del impulso sin invalidarla?",
        options: f5(
          "Perfectamente",
          "Bien",
          "Parcialmente",
          "Cerca de invalidar",
          "Invalidó el impulso",
        ),
      },
    ],
  },
  {
    setup: "IMPULSO_PULLBACK",
    sectionId: "zona",
    title: "S05 — IMPULSO + PULLBACK · Zona",
    questions: [
      {
        id: "s05_pullback_zone",
        label: "IP4 · ¿El pullback llega a una zona de interés para reanudar el movimiento?",
        options: f5("Zona muy clara", "Zona clara", "Moderadamente clara", "Débil", "No existe"),
      },
    ],
  },
  {
    setup: "IMPULSO_PULLBACK",
    sectionId: "confirmacion",
    title: "S05 — IMPULSO + PULLBACK · Confirmación",
    questions: [
      {
        id: "s05_pullback_rejection",
        label:
          "IP5 · ¿El pullback muestra rechazo o pérdida de presión contra la dirección del impulso?",
        options: f5("Evidencia clara", "Evidencia fuerte", "Parcial", "Débil", "No existe"),
      },
      {
        id: "s05_confirm_resume",
        label: "IP6 · ¿El precio confirma la reanudación del impulso?",
        options: f5("Confirmación clara", "Confirmación fuerte", "Parcial", "Débil", "No confirma"),
      },
    ],
  },
  {
    setup: "IMPULSO_PULLBACK",
    sectionId: "riesgo",
    title: "S05 — IMPULSO + PULLBACK · Riesgo",
    questions: [
      {
        id: "s05_stop_invalidation",
        label: "IP7 · ¿El Stop Loss queda detrás de la invalidación del pullback?",
        options: STOP_SCALE,
      },
    ],
  },
  {
    setup: "IMPULSO_PULLBACK",
    sectionId: "recorrido",
    title: "S05 — IMPULSO + PULLBACK · Recorrido",
    questions: [
      {
        id: "s05_room",
        label: "IP8 · ¿El objetivo permite capturar un recorrido razonable del impulso?",
        options: ROOM_SCALE,
      },
    ],
  },
  {
    setup: "IMPULSO_PULLBACK",
    sectionId: "ejecucion",
    title: "S05 — IMPULSO + PULLBACK · Ejecución",
    questions: [
      {
        id: "s05_entry_no_chase",
        label: "IP9 · ¿La entrada evita perseguir el impulso inicial?",
        options: ENTRY_SCALE,
      },
    ],
  },
  {
    setup: "IMPULSO_PULLBACK",
    sectionId: "disciplina",
    title: "S05 — IMPULSO + PULLBACK · Disciplina",
    questions: [
      {
        id: "s05_plan_respect",
        label: "IP10 · ¿La operación cumple las reglas del plan y no surge por FOMO?",
        options: PLAN_SCALE,
      },
    ],
  },
];

/** Añade a cada bloque CORE los grupos específicos de los setups oficiales. */
function withSetupQuestions(sections: Section[]): Section[] {
  return sections.map((section) => ({
    ...section,
    groups: [
      ...section.groups,
      ...SETUP_SPECIFIC.filter((b) => b.sectionId === section.id).map((b) => ({
        title: b.title,
        questions: b.questions,
      })),
    ],
  }));
}

/** Cuestionario base definido en código (sin ediciones del editor de preguntas). */
export const BASE_SECTIONS: Section[] = withTimeframes(
  withoutNaOptions(withSetupQuestions(SECTIONS_SOURCE)),
);

function sectionsById(sections: Section[]): Record<SectionId, Section> {
  return Object.fromEntries(sections.map((s) => [s.id, s])) as Record<SectionId, Section>;
}

/**
 * Cuestionario ACTIVO. Se deriva del cuestionario base más la capa de ediciones
 * publicada desde el editor de administración (`applyChecklistOverlay`).
 * Es un binding vivo: los módulos que lo importan ven siempre la versión activa.
 */
export let SECTIONS: Section[] = BASE_SECTIONS;

export let SECTION_BY_ID: Record<SectionId, Section> = sectionsById(BASE_SECTIONS);

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

/**
 * SETUP LIBRE: modalidad independiente que utiliza la MATRIZ ORIGINAL de ANIKE
 * EJEPIKA. No es "S01 sin setup": no comparte criterios exclusivos con S01–S05.
 */
export type EvaluationSetup = Omit<OfficialSetup, "id"> & { id: "FREE" | OfficialSetupId };

export const FREE_SETUP: EvaluationSetup = {
  id: "FREE",
  code: "LIBRE",
  name: "SETUP LIBRE",
  label: "SETUP LIBRE",
  description: "Matriz original completa de ANIKE EJEPIKA, sin criterios exclusivos de setup.",
  focus: [],
};

/** Las 6 opciones de evaluación: SETUP LIBRE + los 5 setups oficiales. */
export const EVALUATION_SETUPS: EvaluationSetup[] = [FREE_SETUP, ...OFFICIAL_SETUPS];

/** Etiqueta legible de un setup guardado. Compatible con evaluaciones históricas. */
export function setupLabel(value: string | null | undefined): string {
  if (!value) return "Setup histórico / no especificado";
  const found = EVALUATION_SETUPS.find((s) => s.id === value);
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
 * MATRIZ MAESTRA SETUP → PREGUNTAS (única fuente de verdad)
 * ---------------------------------------------------------------------------
 * Existen 6 matrices independientes:
 *   FREE              → MATRIZ ORIGINAL ANIKE EJEPIKA (todas las preguntas base)
 *   REVERSION … S05   → exclusivamente los criterios de su matriz maestra
 * NO existe fallback: una pregunta que no figure en la matriz de un setup no se
 * muestra ni se calcula en ese setup. La matriz NO modifica pesos, fórmula del
 * score, gates, HARD rules, umbral 80 ni estados.
 * =========================================================================== */

/** Setup de evaluación: SETUP LIBRE (matriz original) o uno de los 5 oficiales. */
export type EvaluationSetupId = "FREE" | OfficialSetupId;

export const EVALUATION_SETUP_IDS: EvaluationSetupId[] = [
  "FREE",
  ...OFFICIAL_SETUP_IDS,
] as EvaluationSetupId[];

function idsOf(sections: Section[]): string[] {
  return sections.flatMap((s) => s.groups.flatMap((g) => g.questions.map((q) => q.id)));
}

/** MATRIZ ORIGINAL: todas las preguntas del cuestionario base ANIKE EJEPIKA. */
const BASE_FREE_QUESTION_IDS: string[] = idsOf(SECTIONS_SOURCE);

/**
 * Criterios presentes en las 6 matrices: identificación de la operación
 * (bloque 00) y resultados post-cierre (bloque 09, fuera del score pre-trade).
 */
const BASE_SHARED_QUESTION_IDS: string[] = [
  "co_instrument",
  "co_conditions",
  "rs_result",
  "rs_process",
];

/** Matriz maestra explícita: setup → questionIds. Sin `if/else` ni fallback. */
const BASE_SETUP_MATRIX: Record<EvaluationSetupId, string[]> = {
  FREE: [...BASE_FREE_QUESTION_IDS],
  ...(Object.fromEntries(
    OFFICIAL_SETUP_IDS.map((setup) => [
      setup,
      [
        ...BASE_SHARED_QUESTION_IDS,
        ...SETUP_SPECIFIC.filter((b) => b.setup === setup).flatMap((b) =>
          b.questions.map((q) => q.id),
        ),
      ],
    ]),
  ) as Record<OfficialSetupId, string[]>),
};

/** Matriz ACTIVA (base ± ediciones publicadas del editor). Binding vivo. */
export let SETUP_MATRIX: Record<EvaluationSetupId, string[]> = { ...BASE_SETUP_MATRIX };

function commonOf(matrix: Record<EvaluationSetupId, string[]>): string[] {
  const first = matrix["FREE"] ?? [];
  return first.filter((id) => EVALUATION_SETUP_IDS.every((s) => matrix[s].includes(id)));
}

function exclusiveOf(
  matrix: Record<EvaluationSetupId, string[]>,
): Record<EvaluationSetupId, string[]> {
  const common = new Set(commonOf(matrix));
  return Object.fromEntries(
    EVALUATION_SETUP_IDS.map((s) => [s, matrix[s].filter((id) => !common.has(id))]),
  ) as Record<EvaluationSetupId, string[]>;
}

/** Preguntas presentes en TODAS las matrices. Binding vivo. */
export let COMMON_QUESTION_IDS: string[] = commonOf(BASE_SETUP_MATRIX);

/** Preguntas propias de cada matriz (todo lo que no es común). Binding vivo. */
export let SETUP_EXCLUSIVE_QUESTIONS: Record<EvaluationSetupId, string[]> =
  exclusiveOf(BASE_SETUP_MATRIX);

/** Pregunta ya resuelta para un setup concreto: `setupId` es explícito. */
export type SetupQuestion = Question & { setupId: EvaluationSetupId; sectionId: SectionId };

function collectCoreQuestions(sections: Section[]): { question: Question; sectionId: SectionId }[] {
  return sections.flatMap((s) =>
    s.groups.flatMap((g) => g.questions.map((question) => ({ question, sectionId: s.id }))),
  );
}

let ALL_CORE_QUESTIONS = collectCoreQuestions(BASE_SECTIONS);

/**
 * Preguntas del CORE que no pertenecen a ninguna matriz activa: sólo se
 * conservan para LEER evaluaciones históricas. Binding vivo.
 */
export let UNUSED_QUESTION_IDS: string[] = [];

/** IDs de preguntas de METADATA (descriptivas): nunca puntúan. Binding vivo. */
export let METADATA_QUESTION_IDS: string[] = ALL_CORE_QUESTIONS.filter(
  ({ question }) => question.meta === true,
).map(({ question }) => question.id);

export function isMetadataQuestion(questionId: string): boolean {
  return METADATA_QUESTION_IDS.includes(questionId);
}

/**
 * Pertenencia EXPLÍCITA a la matriz del setup. No hay ningún `return true`
 * por defecto: una pregunta sin declarar no pertenece a ningún setup.
 */
export function belongsExplicitlyToSetup(questionId: string, setupId: string): boolean {
  const matrix = SETUP_MATRIX[setupId as EvaluationSetupId];
  return matrix === undefined ? false : matrix.includes(questionId);
}

function buildSetupQuestions(
  core: { question: Question; sectionId: SectionId }[],
  matrix: Record<EvaluationSetupId, string[]>,
): Record<EvaluationSetupId, SetupQuestion[]> {
  return Object.fromEntries(
    EVALUATION_SETUP_IDS.map((setupId) => {
      const allowed = new Set(matrix[setupId] ?? []);
      const seen = new Set<string>();
      return [
        setupId,
        core.flatMap(({ question, sectionId }) => {
          if (!allowed.has(question.id) || seen.has(question.id)) return [];
          seen.add(question.id);
          return [{ ...question, setupId, sectionId }];
        }),
      ];
    }),
  ) as Record<EvaluationSetupId, SetupQuestion[]>;
}

let SETUP_QUESTIONS = buildSetupQuestions(ALL_CORE_QUESTIONS, BASE_SETUP_MATRIX);

/**
 * Auditoría de la matriz: detecta duplicados dentro de un setup y declaraciones
 * que no existen en el cuestionario. Los tests exigen una lista vacía.
 */
export function validateSetupQuestionMatrix(): string[] {
  const problems: string[] = [];
  const all = new Set(ALL_CORE_QUESTIONS.map(({ question }) => question.id));
  for (const setupId of EVALUATION_SETUP_IDS) {
    const ids = SETUP_MATRIX[setupId] ?? [];
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) problems.push(`${setupId}: declarada más de una vez: ${id}`);
      seen.add(id);
      if (!all.has(id)) problems.push(`${setupId}: declarada pero inexistente en el CORE: ${id}`);
    }
    if (ids.length === 0) problems.push(`${setupId}: matriz vacía`);
  }
  return [...new Set(problems)];
}

/**
 * Función central de aislamiento: devuelve EXCLUSIVAMENTE las preguntas de la
 * matriz del setup. Setup inválido o ausente → [] (nunca un fallback).
 */
export function getActiveQuestionsBySetup(setupId: string | null | undefined): SetupQuestion[] {
  if (!setupId) return [];
  return SETUP_QUESTIONS[setupId as EvaluationSetupId] ?? [];
}

/** Alias histórico de `getActiveQuestionsBySetup`. */
export function getQuestionsForSetup(setupId: string | null | undefined): SetupQuestion[] {
  return getActiveQuestionsBySetup(setupId);
}

/** IDs de preguntas activas del setup (usado por el wizard y por el cálculo). */
export function activeQuestionIds(setupId: string | null | undefined): Set<string> {
  return new Set(getActiveQuestionsBySetup(setupId).map((q) => q.id));
}

/** IDs PUNTUABLES del setup (sin metadata). */
export function scorableQuestionIds(setupId: string | null | undefined): Set<string> {
  return new Set(
    getActiveQuestionsBySetup(setupId)
      .filter((q) => q.meta !== true)
      .map((q) => q.id),
  );
}

/** Grupos de una sección ya filtrados por setup (el wizard sólo renderiza esto). */
export function sectionGroupsForSetup(
  section: Section,
  setupId: string | null | undefined,
): { title?: string; questions: SetupQuestion[] }[] {
  const active = getActiveQuestionsBySetup(setupId);
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

/** Bloque secuencial de la evaluación (00 → 08). Resultados queda fuera. */
export type EvaluationBlock = {
  id: SectionId;
  step: string;
  title: string;
  groups: { title?: string; questions: SetupQuestion[] }[];
  questions: SetupQuestion[];
};

/**
 * Bloques del flujo secuencial, SIEMPRE en el orden del CORE
 * 00 Comercio → 01 Contexto → … → 08 Disciplina. El bloque 09 Resultados es
 * post-trade y no forma parte del flujo de entrada.
 */
export function evaluationBlocks(setupId: string | null | undefined): EvaluationBlock[] {
  if (!setupId || getActiveQuestionsBySetup(setupId).length === 0) return [];
  return SECTIONS.filter((s) => !s.postTrade).flatMap((section) => {
    const groups = sectionGroupsForSetup(section, setupId);
    const questions = groups.flatMap((g) => g.questions);
    if (questions.length === 0) return [];
    return [{ id: section.id, step: section.step, title: section.title, groups, questions }];
  });
}

/** Preguntas del bloque sin responder (toda pregunta del bloque es obligatoria). */
export function missingInBlock(
  answers: Record<string, string>,
  setupId: string | null | undefined,
  sectionId: SectionId,
): string[] {
  return getActiveQuestionsBySetup(setupId)
    .filter((q) => q.sectionId === sectionId)
    .filter((q) => {
      const value = answers[q.id];
      return value === undefined || value === "";
    })
    .map((q) => q.id);
}

/** El bloque está completo: no se puede avanzar hasta que lo esté. */
export function blockComplete(
  answers: Record<string, string>,
  setupId: string | null | undefined,
  sectionId: SectionId,
): boolean {
  return missingInBlock(answers, setupId, sectionId).length === 0;
}

/**
 * Reconstruye las respuestas al cambiar de setup: conserva ÚNICAMENTE las
 * respuestas de preguntas autorizadas por la nueva matriz (asociación por
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
  return getActiveQuestionsBySetup(setupId)
    .filter((q) => options?.includePostTrade === true || !postTradeIds.has(q.id))
    .filter((q) => {
      const value = answers[q.id];
      return value === undefined || value === "";
    })
    .map((q) => q.id);
}

/* ===========================================================================
 * CAPA DE EDICIÓN DEL CUESTIONARIO (editor de administración)
 * ---------------------------------------------------------------------------
 * Permite corregir el texto de una pregunta, sus opciones y sus factores,
 * añadir criterios nuevos y retirar criterios de un setup SIN tocar código.
 * NO cambia pesos CORE, gates, HARD rules, umbral 80, estados ni la fórmula:
 * sólo determina QUÉ preguntas presenta cada setup y con qué factores.
 * =========================================================================== */

export type OverlayOption = { v: string; label: string; pts: number };

export type OverlayEdit = {
  label?: string;
  hint?: string;
  options?: OverlayOption[];
};

export type OverlayAddedQuestion = {
  id: string;
  sectionId: SectionId;
  /** `COMMON` = presente en las 6 matrices; si no, exclusiva de esa matriz. */
  owner: EvaluationSetupId | "COMMON";
  label: string;
  hint?: string;
  options: OverlayOption[];
};

export type ChecklistOverlay = {
  version: 1;
  /** Ediciones de preguntas existentes, por questionId. */
  edits: Record<string, OverlayEdit>;
  /** Preguntas retiradas del cuestionario activo (se conservan como histórico). */
  disabled: string[];
  /** Preguntas nuevas creadas desde el editor. */
  added: OverlayAddedQuestion[];
};

export const EMPTY_OVERLAY: ChecklistOverlay = {
  version: 1,
  edits: {},
  disabled: [],
  added: [],
};

export const SECTION_IDS: SectionId[] = BASE_SECTIONS.map((s) => s.id);

/** Bloques donde el editor puede crear criterios nuevos (los del cuestionario activo). */
export const EDITABLE_SECTION_IDS: SectionId[] = BASE_SECTIONS.filter(
  (s) => s.id !== "comercio",
).map((s) => s.id);

export const ADDED_GROUP_TITLE = "Criterios añadidos desde el editor";

/** Normaliza una capa leída de la base de datos (tolerante a datos incompletos). */
export function normalizeOverlay(value: unknown): ChecklistOverlay {
  const raw = (value ?? {}) as Partial<ChecklistOverlay>;
  const edits: Record<string, OverlayEdit> = {};
  for (const [id, edit] of Object.entries(raw.edits ?? {})) {
    if (!edit || typeof edit !== "object") continue;
    const next: OverlayEdit = {};
    if (typeof edit.label === "string" && edit.label.trim()) next.label = edit.label.trim();
    if (typeof edit.hint === "string") next.hint = edit.hint;
    if (Array.isArray(edit.options) && edit.options.length > 0) {
      next.options = edit.options
        .filter((o) => o && typeof o.v === "string" && typeof o.label === "string")
        .map((o) => ({ v: o.v, label: o.label, pts: Number(o.pts) }))
        .filter((o) => Number.isFinite(o.pts));
    }
    edits[id] = next;
  }
  const disabled = (Array.isArray(raw.disabled) ? raw.disabled : []).filter(
    (id): id is string => typeof id === "string",
  );
  const added = (Array.isArray(raw.added) ? raw.added : [])
    .filter((q) => q && typeof q.id === "string" && typeof q.label === "string")
    .map((q) => ({
      id: q.id,
      sectionId: q.sectionId,
      owner: q.owner,
      label: q.label,
      ...(typeof q.hint === "string" && q.hint ? { hint: q.hint } : {}),
      options: (Array.isArray(q.options) ? q.options : [])
        .map((o) => ({ v: String(o.v), label: String(o.label), pts: Number(o.pts) }))
        .filter((o) => o.v && o.label && Number.isFinite(o.pts)),
    }))
    .filter(
      (q) =>
        SECTION_IDS.includes(q.sectionId) &&
        (q.owner === "COMMON" || EVALUATION_SETUP_IDS.includes(q.owner as EvaluationSetupId)) &&
        q.options.length >= 2,
    ) as OverlayAddedQuestion[];
  return { version: 1, edits, disabled, added };
}

export type ChecklistCatalog = {
  sections: Section[];
  sectionById: Record<SectionId, Section>;
  /** Matriz resultante: setup → questionIds. */
  matrix: Record<EvaluationSetupId, string[]>;
  common: string[];
  exclusive: Record<EvaluationSetupId, string[]>;
  unused: string[];
  metadata: string[];
  setupQuestions: Record<EvaluationSetupId, SetupQuestion[]>;
};

/** Construye el catálogo resultante de aplicar una capa de edición. Función pura. */
export function buildChecklistCatalog(overlayInput?: ChecklistOverlay | null): ChecklistCatalog {
  const overlay = normalizeOverlay(overlayInput ?? EMPTY_OVERLAY);
  const baseIds = new Set(collectCoreQuestions(BASE_SECTIONS).map(({ question }) => question.id));
  const added = overlay.added.filter((q) => !baseIds.has(q.id));

  const edited: Section[] = BASE_SECTIONS.map((section) => {
    const extra = added.filter((q) => q.sectionId === section.id);
    return {
      ...section,
      groups: [
        ...section.groups.map((group) => ({
          ...group,
          questions: group.questions.map((question) => {
            const edit = overlay.edits[question.id];
            if (!edit) return question;
            return {
              ...question,
              ...(edit.label ? { label: edit.label } : {}),
              ...(edit.hint !== undefined ? { hint: edit.hint } : {}),
              ...(edit.options && edit.options.length > 0 ? { options: edit.options } : {}),
            };
          }),
        })),
        ...(extra.length > 0
          ? [
              {
                title: ADDED_GROUP_TITLE,
                questions: extra.map((q) => ({
                  id: q.id,
                  label: q.label,
                  ...(q.hint ? { hint: q.hint } : {}),
                  options: q.options,
                })),
              },
            ]
          : []),
      ],
    };
  });

  // El timeframe se reasigna siempre desde el bloque CORE: las preguntas nuevas
  // heredan la temporalidad de su bloque y nunca se duplican por timeframe.
  const sections: Section[] = withTimeframes(edited);

  const disabled = new Set(overlay.disabled);
  const matrix = Object.fromEntries(
    EVALUATION_SETUP_IDS.map((setupId) => [
      setupId,
      [
        ...(BASE_SETUP_MATRIX[setupId] ?? []).filter((id) => !disabled.has(id)),
        ...added.filter((q) => q.owner === "COMMON" || q.owner === setupId).map((q) => q.id),
      ],
    ]),
  ) as Record<EvaluationSetupId, string[]>;

  const core = collectCoreQuestions(sections);
  const declared = new Set(EVALUATION_SETUP_IDS.flatMap((s) => matrix[s]));
  const unused = core.map(({ question }) => question.id).filter((id) => !declared.has(id));
  const metadata = core
    .filter(({ question }) => question.meta === true)
    .map(({ question }) => question.id);

  return {
    sections,
    sectionById: sectionsById(sections),
    matrix,
    common: commonOf(matrix),
    exclusive: exclusiveOf(matrix),
    unused,
    metadata,
    setupQuestions: buildSetupQuestions(core, matrix),
  };
}

/**
 * Activa una capa de edición (o vuelve al cuestionario base con `null`).
 * A partir de esta llamada, el wizard y el cálculo usan el catálogo resultante.
 */
export function applyChecklistOverlay(overlay?: ChecklistOverlay | null): ChecklistCatalog {
  const catalog = buildChecklistCatalog(overlay);
  SECTIONS = catalog.sections;
  SECTION_BY_ID = catalog.sectionById;
  SETUP_MATRIX = catalog.matrix;
  COMMON_QUESTION_IDS = catalog.common;
  SETUP_EXCLUSIVE_QUESTIONS = catalog.exclusive;
  UNUSED_QUESTION_IDS = catalog.unused;
  METADATA_QUESTION_IDS = catalog.metadata;
  ALL_CORE_QUESTIONS = collectCoreQuestions(catalog.sections);
  SETUP_QUESTIONS = catalog.setupQuestions;
  return catalog;
}

/**
 * Revisión de una capa antes de publicarla. Bloquea publicaciones que dejarían
 * el motor sin criterios evaluables en un bloque con gate obligatorio.
 */
export function checklistOverlayIssues(overlay: ChecklistOverlay): string[] {
  const problems: string[] = [];
  const normalized = normalizeOverlay(overlay);
  const baseIds = new Set(collectCoreQuestions(BASE_SECTIONS).map(({ question }) => question.id));

  const seen = new Set<string>();
  for (const q of normalized.added) {
    if (baseIds.has(q.id)) problems.push(`El identificador ${q.id} ya existe en el cuestionario.`);
    if (seen.has(q.id)) problems.push(`El identificador ${q.id} está repetido.`);
    seen.add(q.id);
    if (!q.label.trim()) problems.push("Hay una pregunta nueva sin enunciado.");
    if (q.options.length < 2) problems.push(`La pregunta ${q.id} necesita al menos dos opciones.`);
  }

  const catalog = buildChecklistCatalog(normalized);
  const GATED: SectionId[] = ["estructura", "zona", "confirmacion", "riesgo", "recorrido"];
  for (const setupId of EVALUATION_SETUP_IDS) {
    const questions = catalog.setupQuestions[setupId];
    if (questions.length === 0) problems.push(`El setup ${setupId} se quedaría sin preguntas.`);
    for (const sectionId of GATED) {
      if (!questions.some((q) => q.sectionId === sectionId && q.meta !== true)) {
        problems.push(`El setup ${setupId} se quedaría sin criterios en el bloque ${sectionId}.`);
      }
    }
  }
  return [...new Set(problems)];
}
