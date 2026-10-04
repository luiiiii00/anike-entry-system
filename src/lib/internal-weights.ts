/**
 * PESOS INTERNOS OFICIALES — remapeo OPCIÓN A (contrato V2).
 *
 * Autoridad: componentes y porcentajes de la especificación ANIKE EJEPIKA
 * (contrato V2 + cambio autorizado). Cada reactivo actual recibe el peso del
 * componente fuente que representa:
 *  - DIRECTO:   un reactivo = un componente.
 *  - REPARTIDO: varios reactivos representan el mismo componente; su peso se
 *               divide en partes iguales entre ellos.
 *  - SIN_COMPONENTE: el reactivo no representa ningún componente del bloque
 *               (peso 0, sigue siendo obligatorio). No se inventa peso.
 * Cada componente oficial tiene al menos un reactivo propio: cada bloque suma
 * exactamente 100 % con pesos reales (sin normalización de componentes
 * faltantes).
 *
 * Metadata y validation-only = 0 % (no figuran aquí y no puntúan).
 * No modifica pesos CORE, gates, umbral 80 ni estados.
 */

export type WeightMapping = "DIRECTO" | "REPARTIDO" | "SIN_COMPONENTE";

export type InternalWeight = {
  /** Peso del componente fuente asignado al reactivo (en % del bloque fuente). */
  w: number;
  component: string;
  mapping: WeightMapping;
};

type Row = [id: string, w: number, component: string, mapping: WeightMapping];

const T = 100 / 3;
const T3 = 100 - 2 * T; // 33.3334 (redondeo de la fuente)

/*
 * R:R = METADATA / validación global objetiva (decisión explícita del usuario):
 * no puntúa. R:R < 1.00 → NO TRADE (rr_below_min); R:R >= 1.00 → válido, sin
 * puntos. Al retirarlo de S01/S02, Riesgo se normaliza a Geometría 50 % y
 * Riesgo monetario 50 % (normalización autorizada por esa misma instrucción).
 */

const ROWS: Record<string, Record<string, Row[]>> = {
  COMUN: {
    comercio: [
      ["co_instrument", 50, "Instrumento", "DIRECTO"],
      ["co_conditions", 50, "Condiciones de mercado", "DIRECTO"],
    ],
  },
  REVERSION: {
    contexto: [
      ["S01_CTX_01", 60, "Contexto 1D", "DIRECTO"],
      ["S01_CTX_02", 40, "Alineación", "DIRECTO"],
    ],
    estructura: [
      ["S01_STR_01", 10, "Estado de la estructura", "REPARTIDO"],
      ["S01_STR_03", 10, "Estado de la estructura", "REPARTIDO"],
      ["S01_STR_02", 35, "Evidencia de cambio", "DIRECTO"],
      ["S01_PAT_01", 20, "Tipo de evidencia (patrón)", "DIRECTO"],
      ["S01_PAT_02", 25, "Dirección", "DIRECTO"],
    ],
    zona: [
      ["S01_ZONE_01", 60, "Tipo de zona", "DIRECTO"],
      ["S01_ZONE_02", 40, "Calidad de zona", "DIRECTO"],
    ],
    confirmacion: [
      ["S01_CONF_01", 10, "Reacción 5M", "REPARTIDO"],
      ["S01_CONF_02", 10, "Reacción 5M", "REPARTIDO"],
      ["S01_CONF_03", 25, "Confirmación 5M", "DIRECTO"],
      ["S01_CONF_04", 25, "Fibonacci / confluencia", "DIRECTO"],
      ["S01_CONF_05", 15, "RSI", "DIRECTO"],
      ["S01_CONF_06", 15, "MACD", "DIRECTO"],
    ],
    riesgo: [
      ["S01_RISK_01", 50, "Geometría / SL", "DIRECTO"],
      ["S01_RISK_02", 50, "Riesgo monetario", "DIRECTO"],
    ],
    recorrido: [
      ["S01_PATH_01", 70, "Espacio hasta TP", "DIRECTO"],
      ["S01_PATH_02", 30, "Obstáculos / referencia del objetivo", "DIRECTO"],
    ],
    ejecucion: [
      ["S01_EXEC_02", 40, "Ubicación de la entrada", "DIRECTO"],
      ["S01_EXEC_01", 35, "Respeto de la confirmación", "DIRECTO"],
      ["S01_EXEC_03", 25, "Persecución / FOMO", "DIRECTO"],
    ],
    disciplina: [
      ["S01_DISC_02", 50, "Protocolo", "DIRECTO"],
      ["S01_DISC_01", 50, "Reglas del setup", "DIRECTO"],
    ],
  },
  CONTINUACION: {
    contexto: [
      ["S02_CTX_01", 50, "Tendencia", "DIRECTO"],
      ["S02_CTX_02", 50, "Dirección", "DIRECTO"],
    ],
    estructura: [
      ["S02_STR_01", 30, "Estructura 1H", "DIRECTO"],
      ["S02_PAT_01", 10, "Patrón", "REPARTIDO"],
      ["S02_PAT_02", 10, "Patrón", "REPARTIDO"],
      ["S02_PAT_03", 10, "Patrón", "REPARTIDO"],
      ["S02_STR_02", 20, "Integridad", "DIRECTO"],
      ["S02_STR_03", 20, "Dirección", "DIRECTO"],
    ],
    zona: [
      ["S02_ZONE_01", 60, "Zona de pullback", "DIRECTO"],
      ["S02_ZONE_02", 40, "Calidad de zona", "DIRECTO"],
    ],
    confirmacion: [
      ["S02_CONF_02", 25, "Impulso", "DIRECTO"],
      ["S02_CONF_01", 25, "Pullback", "DIRECTO"],
      ["S02_CONF_03", 15, "Confirmación 5M", "DIRECTO"],
      ["S02_CONF_04", 15, "Fibonacci", "DIRECTO"],
      ["S02_CONF_05", 10, "RSI", "DIRECTO"],
      ["S02_CONF_06", 10, "MACD", "DIRECTO"],
    ],
    riesgo: [
      ["S02_RISK_01", 50, "Geometría / SL", "DIRECTO"],
      ["S02_RISK_02", 50, "Riesgo monetario", "DIRECTO"],
    ],
    recorrido: [
      ["S02_PATH_01", 70, "Espacio hasta TP", "DIRECTO"],
      ["S02_PATH_02", 30, "Obstáculos / referencia del objetivo", "DIRECTO"],
    ],
    // Ejecución y Disciplina: matriz vigente documentada (50/50 y 100).
    ejecucion: [
      ["S02_EXEC_01", 50, "Matriz vigente", "DIRECTO"],
      ["S02_EXEC_02", 50, "Matriz vigente", "DIRECTO"],
    ],
    disciplina: [["S02_DISC_01", 100, "Matriz vigente", "DIRECTO"]],
  },
  RUPTURA_RETESTEO: {
    contexto: [
      ["S03_CTX_01", 25, "CTX01", "DIRECTO"],
      ["S03_CTX_02", 25, "CTX02", "DIRECTO"],
      ["S03_CTX_03", 25, "CTX03", "DIRECTO"],
      ["S03_CTX_04", 25, "CTX04", "DIRECTO"],
    ],
    estructura: [
      ["S03_STR_01", 30, "Ruptura", "DIRECTO"],
      // Variantes mutuamente excluyentes: sólo una está activa por evaluación.
      ["S03_STR_02", 25, "Confirmación de la ruptura (MOMENTUM)", "DIRECTO"],
      ["S03_STR_03", 25, "Confirmación de la ruptura (THREE_BODY)", "DIRECTO"],
      ["S03_STR_04", 20, "Integridad", "DIRECTO"],
      ["S03_STR_05", 25, "Nivel estructural", "DIRECTO"],
    ],
    zona: [
      ["S03_ZONE_01", 60, "Nivel roto / retesteo", "DIRECTO"],
      ["S03_ZONE_02", 40, "Calidad", "DIRECTO"],
    ],
    confirmacion: [
      ["S03_CONF_03", 35, "Reacción", "DIRECTO"],
      ["S03_CONF_04", 30, "Confirmación 5M", "DIRECTO"],
      ["S03_CONF_05", 15, "RSI", "DIRECTO"],
      ["S03_CONF_06", 15, "MACD", "DIRECTO"],
      ["S03_CONF_07", 5, "Fibonacci / confluencia", "DIRECTO"],
    ],
    riesgo: [
      ["S03_RISK_01", 50, "Stop Loss", "DIRECTO"],
      ["S03_RISK_02", 50, "Riesgo monetario", "DIRECTO"],
    ],
    recorrido: [["S03_PATH_01", 100, "Recorrido", "DIRECTO"]],
    ejecucion: [
      ["S03_EXEC_01", T, "Ejecución 1", "DIRECTO"],
      ["S03_EXEC_02", T, "Ejecución 2", "DIRECTO"],
      ["S03_EXEC_03", T3, "Ejecución 3", "DIRECTO"],
    ],
    disciplina: [
      ["S03_DISC_01", 50, "Reglas del setup", "DIRECTO"],
      ["S03_DISC_02", 50, "Protocolo", "DIRECTO"],
    ],
  },
  ZONA_FIBONACCI: {
    contexto: [
      ["S04_CTX_01", T, "Contexto 1", "DIRECTO"],
      ["S04_CTX_02", T, "Contexto 2", "DIRECTO"],
      ["S04_CTX_03", T3, "Contexto 3", "DIRECTO"],
    ],
    estructura: [
      ["S04_STR_01", 40, "Estructura 1", "DIRECTO"],
      ["S04_STR_02", 30, "Estructura 2", "DIRECTO"],
      ["S04_STR_03", 30, "Estructura 3", "DIRECTO"],
    ],
    zona: [
      ["S04_ZONE_01", 25, "Zona 1", "DIRECTO"],
      ["S04_ZONE_02", 25, "Zona 2", "DIRECTO"],
      ["S04_ZONE_03", 25, "Zona 3", "DIRECTO"],
      ["S04_ZONE_04", 25, "Zona 4", "DIRECTO"],
    ],
    confirmacion: [
      ["S04_CONF_01", 25, "Fibonacci", "DIRECTO"],
      ["S04_CONF_03", 20, "Reacción", "DIRECTO"],
      ["S04_CONF_04", 25, "Confluencia", "DIRECTO"],
      ["S04_CONF_05", 15, "Confirmación 5M (S04_CONF_02 sigue validation-only 0 %)", "DIRECTO"],
      ["S04_CONF_06", 7.5, "RSI", "DIRECTO"],
      ["S04_CONF_07", 7.5, "MACD", "DIRECTO"],
    ],
    riesgo: [
      ["S04_RISK_01", T, "Riesgo 1", "DIRECTO"],
      ["S04_RISK_02", T, "Riesgo 2", "DIRECTO"],
      ["S04_RISK_03", T3, "Riesgo 3", "DIRECTO"],
    ],
    recorrido: [
      ["S04_PATH_01", T, "Recorrido 1", "DIRECTO"],
      ["S04_PATH_02", T, "Recorrido 2", "DIRECTO"],
      ["S04_PATH_03", T3, "Recorrido 3", "DIRECTO"],
    ],
    ejecucion: [
      ["S04_EXEC_01", T, "Ejecución 1", "DIRECTO"],
      ["S04_EXEC_02", T, "Ejecución 2", "DIRECTO"],
      ["S04_EXEC_03", T3, "Ejecución 3", "DIRECTO"],
    ],
    disciplina: [
      ["S04_DISC_02", 50, "Disciplina 1", "DIRECTO"],
      ["S04_DISC_03", 50, "Disciplina 2", "DIRECTO"],
    ],
  },
  IMPULSO_PULLBACK: {
    contexto: [
      ["S05_CTX_01", 50, "Tendencia", "DIRECTO"],
      ["S05_CTX_02", 50, "Dirección", "DIRECTO"],
      ["S05_CTX_03", 0, "— (impulso es componente de Estructura)", "SIN_COMPONENTE"],
    ],
    estructura: [
      ["S05_STR_01", 35, "Impulso", "DIRECTO"],
      ["S05_STR_02", 30, "Integridad", "DIRECTO"],
      ["S05_STR_03", 20, "Dirección", "DIRECTO"],
      ["S05_STR_04", 15, "Calidad del movimiento", "DIRECTO"],
    ],
    zona: [
      ["S05_ZONE_01", 60, "Zona de pullback", "DIRECTO"],
      ["S05_ZONE_02", 20, "Calidad", "REPARTIDO"],
      ["S05_ZONE_03", 20, "Calidad", "REPARTIDO"],
    ],
    confirmacion: [
      ["S05_CONF_01", 20, "Reacción", "DIRECTO"],
      ["S05_CONF_03", 20, "Confluencia zona + estructura", "DIRECTO"],
      ["S05_CONF_02", 10, "Confirmación 5M", "DIRECTO"],
      ["S05_CONF_04", 25, "Pullback", "DIRECTO"],
      ["S05_CONF_05", 20, "Fibonacci", "DIRECTO"],
      ["S05_CONF_06", 5, "RSI / MACD", "DIRECTO"],
    ],
    riesgo: [
      ["S05_RISK_01", 50, "Stop Loss", "DIRECTO"],
      ["S05_RISK_02", 50, "Riesgo monetario", "DIRECTO"],
    ],
    recorrido: [
      ["S05_PATH_01", 50, "Recorrido", "DIRECTO"],
      ["S05_PATH_02", 50, "Objetivo", "DIRECTO"],
    ],
    ejecucion: [
      ["S05_EXEC_01", T, "Ejecución 1", "DIRECTO"],
      ["S05_EXEC_02", T, "Ejecución 2", "DIRECTO"],
      ["S05_EXEC_03", T3, "Ejecución 3", "DIRECTO"],
    ],
    disciplina: [
      ["S05_DISC_01", T, "Disciplina 1", "DIRECTO"],
      ["S05_DISC_02", T, "Disciplina 2", "DIRECTO"],
      ["S05_DISC_03", T3, "Disciplina 3", "DIRECTO"],
    ],
  },
};

export type WeightEntry = InternalWeight & { id: string; setup: string; section: string };

export const INTERNAL_WEIGHT_TABLE: WeightEntry[] = Object.entries(ROWS).flatMap(
  ([setup, blocks]) =>
    Object.entries(blocks).flatMap(([section, rows]) =>
      rows.map(([id, w, component, mapping]) => ({ id, setup, section, w, component, mapping })),
    ),
);

export const INTERNAL_WEIGHTS: Record<string, InternalWeight> = Object.fromEntries(
  INTERNAL_WEIGHT_TABLE.map((e) => [e.id, { w: e.w, component: e.component, mapping: e.mapping }]),
);
