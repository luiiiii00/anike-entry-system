export type Option = { v: string; label: string; pts: number };
export type Question = { id: string; label: string; options: Option[] };
export type SectionId =
  | "contexto"
  | "estructura"
  | "zona"
  | "volatilidad"
  | "momentum"
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
    weight: 15,
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
        title: "1 hora",
        questions: [
          { id: "h1_struct", label: "¿La estructura acompaña mi idea?", options: yn() },
          { id: "h1_zone", label: "¿Estoy entrando cerca de una zona lógica?", options: yn() },
          { id: "h1_react", label: "¿Hay reacción clara en soporte/resistencia?", options: yn() },
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
    id: "volatilidad",
    step: "04",
    title: "Volatilidad",
    weight: 10,
    groups: [
      {
        questions: [
          {
            id: "v_candles",
            label: "Las velas se están haciendo:",
            options: [
              { v: "grandes", label: "Más grandes", pts: 1 },
              { v: "pequenas", label: "Más pequeñas", pts: 0.3 },
            ],
          },
          {
            id: "v_market",
            label: "El mercado:",
            options: [
              { v: "lento", label: "Se mueve lento", pts: 0.3 },
              { v: "rapido", label: "Hace recorridos rápidos", pts: 1 },
            ],
          },
          {
            id: "v_atr_level",
            label: "ATR:",
            options: [
              { v: "alto", label: "Relativamente alto", pts: 1 },
              { v: "bajo", label: "Relativamente bajo", pts: 0.3 },
            ],
          },
          {
            id: "v_atr_dir",
            label: "ATR:",
            options: [
              { v: "subiendo", label: "Subiendo", pts: 1 },
              { v: "bajando", label: "Bajando", pts: 0.3 },
            ],
          },
          {
            id: "v_bb",
            label: "Bandas de Bollinger:",
            options: [
              { v: "comprimidas", label: "Comprimidas", pts: 0.5 },
              { v: "expandiendo", label: "Expandiéndose", pts: 1 },
            ],
          },
          {
            id: "v_range",
            label: "Rango del día:",
            options: [
              { v: "extendido", label: "Muy extendido", pts: 0.3 },
              { v: "apretado", label: "Sigue apretado", pts: 1 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "momentum",
    step: "05",
    title: "Momentum",
    weight: 10,
    groups: [
      {
        questions: [
          { id: "mo_force", label: "¿El movimiento actual todavía tiene fuerza?", options: yn() },
          {
            id: "mo_candles",
            label: "Las velas mantienen:",
            options: [
              { v: "continuidad", label: "Tamaño y continuidad", pts: 1 },
              { v: "debiles", label: "Ya se debilitan", pts: 0.2 },
            ],
          },
          {
            id: "mo_levels",
            label: "El precio:",
            options: [
              { v: "sigue", label: "Rompe niveles y sigue", pts: 1 },
              { v: "vuelve", label: "Rompe y vuelve", pts: 0.2 },
            ],
          },
          { id: "mo_wicks", label: "¿Hay mechas que muestran rechazo?", options: yn(0.3, 1) },
          {
            id: "mo_shorter",
            label: "¿Cada avance es más corto que el anterior?",
            options: yn(0.2, 1),
          },
          { id: "mo_fails", label: "¿Hay fallos de continuación?", options: yn(0.2, 1) },
          {
            id: "mo_rsi",
            label: "RSI acompaña:",
            options: [
              { v: "nuevos", label: "Nuevos máximos/mínimos", pts: 1 },
              { v: "debilita", label: "Se debilita", pts: 0.3 },
            ],
          },
          { id: "mo_macd", label: "MACD: ¿El histograma se está achicando?", options: yn(0.3, 1) },
          { id: "mo_volume", label: "Volumen: ¿Acompaña el movimiento?", options: yn() },
        ],
      },
    ],
  },
  {
    id: "confirmacion",
    step: "06",
    title: "Confirmación",
    weight: 15,
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
    ],
  },
  {
    id: "riesgo",
    step: "07",
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
    step: "08",
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
    step: "09",
    title: "Ejecución",
    weight: 3,
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
    step: "10",
    title: "Disciplina",
    weight: 2,
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
  { key: "resultado", step: "11", title: "Resultado" },
];

export const SETUPS = ["Continuación", "Reversión", "Ruptura", "Retesteo", "Otro"];
export const MARKETS = ["Crypto", "Forex", "Índices", "Acciones", "Futuros", "Otro"];
export const SESSIONS = ["Asia", "Londres", "Nueva York", "Overlap", "Fuera de sesión"];
