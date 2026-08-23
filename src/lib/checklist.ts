/** `na: true` marca una opción "No aplica": no penaliza ni suma, se excluye del cálculo. */
export type Option = { v: string; label: string; pts: number; na?: boolean };
export type Question = { id: string; label: string; hint?: string; options: Option[] };
export type SectionId =
  | "contexto"
  | "estructura"
  | "zona"
  | "confirmacion"
  | "riesgo"
  | "recorrido"
  | "ejecucion"
  | "disciplina";

export type Section = {
  id: SectionId;
  step: string;
  title: string;
  weight: number;
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

export const SECTIONS: Section[] = [
  {
    id: "contexto",
    step: "01",
    title: "Contexto",
    weight: 10,
    groups: [
      {
        questions: [
          {
            id: "ctx_trend",
            label: "El token está en:",
            options: [
              { v: "alcista", label: "Tendencia alcista", pts: 1 },
              { v: "bajista", label: "Tendencia bajista", pts: 1 },
              { v: "rango", label: "Rango", pts: 0.4 },
            ],
          },
          {
            id: "ctx_day",
            label: "Estoy viendo un día de:",
            options: [
              { v: "continuacion", label: "Continuación", pts: 1 },
              { v: "compresion", label: "Compresión", pts: 0.5 },
              { v: "reversion", label: "Reversión", pts: 0.7 },
            ],
          },
          {
            id: "ctx_range_pos",
            label: "Dónde está el precio respecto al rango del día:",
            options: [
              { v: "alta", label: "Parte alta", pts: 1 },
              { v: "baja", label: "Parte baja", pts: 1 },
              { v: "mitad", label: "Mitad del rango", pts: 0.2 },
            ],
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
        title: "Diario",
        questions: [
          { id: "d_levels", label: "¿Hay pisos y techos relevantes?", options: yn() },
          {
            id: "d_candles",
            label: "¿Cuál fue la dirección de las últimas 2 velas?",
            options: [
              { v: "alcista", label: "Alcista", pts: 1 },
              { v: "bajista", label: "Bajista", pts: 1 },
            ],
          },
          {
            id: "d_zone",
            label: "¿El precio está chocando con una zona importante?",
            options: yn(0.4, 1),
          },
        ],
      },
      {
        title: "Horaria · lectura de contexto y estructura",
        questions: [
          { id: "h1_struct", label: "¿La estructura acompaña mi idea?", options: yn() },
          { id: "h1_zone", label: "¿Estoy entrando cerca de una zona lógica?", options: yn() },
          { id: "h1_react", label: "¿Hay reacción clara en soporte/resistencia?", options: yn() },
          {
            id: "h1_pattern_change",
            label: "¿Cuál es el patrón de cambio que estás viendo?",
            hint: "Registra únicamente lo que observas. Seleccionar un patrón no implica que esté confirmado.",
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
            id: "h1_fibo",
            label: "¿En qué nivel de retroceso de Fibonacci se encuentra el precio?",
            options: [
              { v: "1_3", label: "1/3", pts: 0.8 },
              { v: "1_2", label: "1/2", pts: 1 },
              { v: "2_3", label: "2/3", pts: 0.8 },
              NA_OPTION,
            ],
          },
          {
            id: "h1_rsi_div",
            label: "¿Existe divergencia entre el precio y el RSI?",
            hint: "Si el precio testea el nivel de Fibonacci pero el RSI no hace nuevos mínimos/máximos, el agotamiento del retroceso puede ser una señal de pérdida de fuerza.",
            options: [
              { v: "alcista", label: "Divergencia alcista", pts: 1 },
              { v: "bajista", label: "Divergencia bajista", pts: 1 },
              { v: "no_existe", label: "No existe divergencia", pts: 0.4 },
              NA_OPTION,
            ],
          },
          {
            id: "h1_macd",
            label: "¿El histograma del MACD empieza a perder fuerza en la zona de Fibonacci?",
            hint: "Revisa que el histograma del MACD empiece a perder fuerza justo en la zona de Fibonacci.",
            options: ynNa(1, 0.3),
          },
        ],
      },
      {
        title: "5 minutos",
        questions: [
          { id: "m5_signal", label: "¿Tengo una señal de activación real?", options: yn() },
          {
            id: "m5_break",
            label: "¿Hubo ruptura de estructura, diagonal o microsoporte/microresistencia?",
            options: yn(),
          },
          {
            id: "m5_timing",
            label: "¿Estoy entrando después de una confirmación y no antes?",
            options: [
              { v: "despues", label: "Después", pts: 1 },
              { v: "antes", label: "Antes", pts: 0 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "zona",
    step: "03",
    title: "Zona",
    weight: 15,
    groups: [
      {
        questions: [
          { id: "z_clear", label: "¿Estoy entrando en una zona clara?", options: yn() },
          {
            id: "z_side",
            label: "Estoy operando:",
            options: [
              { v: "favor", label: "A favor del movimiento", pts: 1 },
              { v: "contra", label: "En contra del movimiento", pts: 0.3 },
            ],
          },
          {
            id: "z_vol",
            label: "Hay volatilidad:",
            options: [
              { v: "fuerte", label: "Fuerte", pts: 1 },
              { v: "lento", label: "Mercado lento", pts: 0.3 },
            ],
          },
          {
            id: "z_type",
            label: "La zona es:",
            options: [
              { v: "sr", label: "Soporte/Resistencia", pts: 1 },
              { v: "retest", label: "Ruptura y retesteo", pts: 1 },
              { v: "pisos", label: "Pisos y techos", pts: 1 },
            ],
          },
          { id: "z_reacted", label: "¿El precio ya reaccionó en esa zona?", options: yn() },
          { id: "z_mid", label: "¿Estoy evitando entrar en mitad del rango?", options: yn() },
        ],
      },
    ],
  },
  {
    id: "confirmacion",
    step: "04",
    title: "Confirmación",
    weight: 22,
    groups: [
      {
        questions: [
          {
            id: "cf_signal",
            label: "Vi un:",
            options: [
              { v: "rechazo", label: "Rechazo", pts: 1 },
              { v: "ruptura", label: "Ruptura con seguimiento", pts: 1 },
              { v: "perdida_momentum", label: "Pérdida de momentum", pts: 0.7 },
              { v: "retesteo_fallido", label: "Retesteo fallido", pts: 0.7 },
              { v: "cambio_estructura", label: "Cambio de estructura", pts: 1 },
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
          {
            id: "cf_vol_favors",
            label: "La volatilidad favorece:",
            options: [
              { v: "ruptura", label: "Ruptura con seguimiento", pts: 1 },
              { v: "rechazo", label: "Un rechazo", pts: 1 },
            ],
          },
          {
            id: "cf_entry_phase",
            label: "Estoy entrando en:",
            options: [
              { v: "compresion", label: "Compresión", pts: 1 },
              { v: "post_expansion", label: "Después de expansión", pts: 0.5 },
            ],
          },
        ],
      },
      {
        title: "5M · confirmación de entrada",
        questions: [
          {
            id: "cf5_macd",
            label: "Una vez rota la diagonal, ¿la entrada está validada por el cruce de líneas del MACD?",
            hint: "Una vez rota la diagonal, valida la entrada con el cruce de líneas del MACD. Es un criterio de confirmación, no una orden de entrada.",
            options: ynNa(1, 0.2),
          },
          {
            id: "cf5_rsi",
            label:
              "¿El RSI confirma que no estás entrando cuando el movimiento ya está sobrecomprado o sobrevendido?",
            hint: "El RSI sirve para evitar entrar justo cuando la ruptura ya dejó el movimiento sobrecomprado o sobrevendido.",
            options: ynNa(1, 0.2),
          },
        ],
      },
    ],
  },
  {
    id: "riesgo",
    step: "05",
    title: "Riesgo",
    weight: 15,
    groups: [
      {
        questions: [
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
          {
            id: "r_stop_tight",
            label: "¿Mi stop está demasiado cerca para la volatilidad actual?",
            options: yn(0, 1),
          },
          {
            id: "r_loss_ok",
            label: "¿La pérdida de este trade es aceptable para mi cuenta?",
            options: yn(),
          },
          {
            id: "r_space",
            label: "¿Hay espacio suficiente para que el precio se mueva a favor?",
            options: yn(),
          },
          {
            id: "r_reward",
            label: "¿Lo que podría ganar compensa lo que arriesgo?",
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
            id: "rc_room",
            label: "¿Hay recorrido limpio hasta el objetivo?",
            options: yn(),
          },
          {
            id: "rc_obstacle",
            label: "¿Existe una zona contraria relevante antes del objetivo?",
            options: yn(0, 1),
          },
          {
            id: "rc_session",
            label: "¿El recorrido esperado es alcanzable en la sesión actual?",
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
          { id: "ex_favor", label: "¿Tengo definido qué haré si el precio va a favor?", options: yn() },
          {
            id: "ex_lateral",
            label: "¿Tengo definido qué haré si el precio se queda lateral?",
            options: yn(),
          },
          {
            id: "ex_against",
            label: "¿Tengo definido qué haré si el precio va en contra?",
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
    weight: 3,
    groups: [
      {
        questions: [
          {
            id: "ds_why",
            label: "Estoy entrando porque:",
            options: [
              { v: "senal", label: "Veo una señal", pts: 1 },
              { v: "impulso", label: "Por impulso", pts: 0 },
            ],
          },
          {
            id: "ds_motive",
            label: "Estoy operando por:",
            options: [
              { v: "ninguno", label: "Ninguno de estos", pts: 1 },
              { v: "fomo", label: "FOMO", pts: 0 },
              { v: "revancha", label: "Revancha", pts: 0 },
              { v: "aburrimiento", label: "Aburrimiento", pts: 0 },
            ],
          },
          {
            id: "ds_plan",
            label: "El trade:",
            options: [
              { v: "cumple", label: "Cumple mi plan", pts: 1 },
              { v: "forzando", label: "Estoy forzándolo", pts: 0 },
            ],
          },
          {
            id: "ds_explain",
            label: "¿Podría explicar esta entrada en una frase clara?",
            options: yn(),
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
  { key: "trade", step: "00", title: "Trade" },
  ...SECTIONS.map((s) => ({ key: s.id, step: s.step, title: s.title })),
  { key: "resultado", step: "09", title: "Resultados" },
];

export const SETUPS = ["Continuación", "Reversión", "Ruptura", "Retesteo", "Otro"];
export const MARKETS = ["Crypto", "Forex", "Índices", "Acciones", "Futuros", "Otro"];
export const SESSIONS = ["Asia", "Londres", "Nueva York", "Overlap", "Fuera de sesión"];
