/**
 * ANIKE EJEPIKA — POST-TRADE
 * Motor de cálculo de resultados de operaciones cerradas.
 * Mide, calcula y registra. No predice, no recomienda, no señala entradas.
 *
 * Sin redondeos intermedios: sólo se redondea en la presentación.
 */

export const MARKETS = ["CRYPTO", "FOREX", "CFD", "FUTURES"] as const;
export type MarketType = (typeof MARKETS)[number];

export const CURRENCIES = ["USD", "PYG", "USDT", "EUR"] as const;
export type Currency = (typeof CURRENCIES)[number];

export type Direction = "LONG" | "SHORT";

export type FeeMode = "none" | "total" | "sides" | "percent";

export type PostTradeInput = {
  marketType: MarketType;
  direction: Direction;
  symbol?: string | null;
  entryDate?: string | null;
  exitDate?: string | null;
  entryPrice?: number | null;
  exitPrice?: number | null;
  /** Unidades / contratos ya calculados (si se conoce, manda sobre el lotaje). */
  quantity?: number | null;
  /** Lotaje: se multiplica por el tamaño de contrato para obtener unidades. */
  lotSize?: number | null;
  contractSize?: number | null;
  leverage?: number | null;
  /** Margen introducido manualmente: si existe, no se recalcula. */
  margin?: number | null;
  capital?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  feeMode?: FeeMode;
  feeTotal?: number | null;
  feeEntry?: number | null;
  feeExit?: number | null;
  /** Comisión en % sobre el volumen operado (entrada + salida). */
  feePercent?: number | null;
  otherCosts?: number | null;
  currency?: Currency;
  decimals?: number | null;
};

export type PostTradeResult = {
  marketType: MarketType;
  direction: Direction;
  currency: Currency;
  decimals: number;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  lotSize: number | null;
  contractSize: number | null;
  leverage: number;
  notionalValue: number;
  margin: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  grossPnl: number;
  fees: number;
  netPnl: number;
  priceChangePercent: number;
  roiMargin: number | null;
  pnlPercentOnCapital: number | null;
  riskAmount: number | null;
  riskPercent: number | null;
  plannedRr: number | null;
  realizedRr: number | null;
  resultR: number | null;
  tradeResult: "WIN" | "LOSS" | "BREAK_EVEN";
};

/** Tamaño de contrato por defecto según mercado (editable por el usuario). */
export function defaultContractSize(market: MarketType): number {
  switch (market) {
    case "FOREX":
      return 100_000;
    case "FUTURES":
      return 1;
    case "CFD":
      return 1;
    default:
      return 1;
  }
}

/** Decimales de presentación por defecto según mercado. */
export function defaultDecimals(market: MarketType): number {
  return market === "FOREX" ? 5 : 2;
}

/** Qué representa el campo "cantidad" en cada mercado. */
export const SIZE_HINTS: Record<MarketType, { quantity: string; lot: string }> = {
  CRYPTO: {
    quantity: "Unidades del activo (ej. 0.25 BTC).",
    lot: "En crypto normalmente no se usa lotaje: introduce unidades.",
  },
  FOREX: {
    quantity: "Unidades de divisa base (1 lote estándar = 100.000 unidades).",
    lot: "Lotaje en lotes (1 = estándar, 0.1 = mini, 0.01 = micro).",
  },
  CFD: {
    quantity: "Número de CFDs / acciones equivalentes.",
    lot: "Lotaje del broker × tamaño de contrato del instrumento.",
  },
  FUTURES: {
    quantity: "Unidades subyacentes totales (contratos × tamaño de contrato).",
    lot: "Número de contratos.",
  },
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Unidades efectivas: cantidad directa o lotaje × tamaño de contrato. */
export function effectiveQuantity(input: PostTradeInput): number | null {
  const q = num(input.quantity);
  if (q !== null && q > 0) return q;
  const lot = num(input.lotSize);
  if (lot !== null && lot > 0) {
    const cs = num(input.contractSize) ?? defaultContractSize(input.marketType);
    return lot * cs;
  }
  return null;
}

export function validatePostTrade(input: PostTradeInput): string[] {
  const errors: string[] = [];
  const entry = num(input.entryPrice);
  const exit = num(input.exitPrice);
  const qty = effectiveQuantity(input);
  const lev = num(input.leverage);
  const margin = num(input.margin);
  const stop = num(input.stopLoss);
  const tp = num(input.takeProfit);

  if (entry === null || entry <= 0) errors.push("El precio de entrada debe ser mayor que 0.");
  if (exit === null || exit <= 0) errors.push("El precio de salida debe ser mayor que 0.");
  if (qty === null || qty <= 0)
    errors.push("La cantidad (o el lotaje) debe ser mayor que 0.");
  if (lev !== null && lev <= 0) errors.push("El apalancamiento debe ser mayor que 0.");
  if (margin !== null && margin <= 0) errors.push("El margen debe ser mayor que 0.");

  if (entry !== null && entry > 0) {
    if (input.direction === "LONG") {
      if (stop !== null && stop >= entry)
        errors.push("En LONG el Stop Loss debe estar por debajo de la entrada.");
      if (tp !== null && tp <= entry)
        errors.push("En LONG el Take Profit debe estar por encima de la entrada.");
    } else {
      if (stop !== null && stop <= entry)
        errors.push("En SHORT el Stop Loss debe estar por encima de la entrada.");
      if (tp !== null && tp >= entry)
        errors.push("En SHORT el Take Profit debe estar por debajo de la entrada.");
    }
  }
  return errors;
}

export function calculatePostTrade(input: PostTradeInput): PostTradeResult {
  const errors = validatePostTrade(input);
  if (errors.length > 0) throw new Error(errors[0]!);

  const dir = input.direction;
  const entry = num(input.entryPrice)!;
  const exit = num(input.exitPrice)!;
  const quantity = effectiveQuantity(input)!;
  const capital = num(input.capital);
  const stopLoss = num(input.stopLoss);
  const takeProfit = num(input.takeProfit);

  const notionalValue = entry * quantity;

  // El apalancamiento NO multiplica el P&L: el tamaño de posición ya lo contiene.
  let leverage = num(input.leverage) ?? 0;
  let margin = num(input.margin);
  if (margin !== null && margin > 0) {
    if (leverage <= 0) leverage = notionalValue / margin;
  } else if (leverage > 0) {
    margin = notionalValue / leverage;
  } else {
    leverage = 1;
    margin = notionalValue;
  }
  if (leverage <= 0) leverage = 1;

  const grossPnl = dir === "LONG" ? (exit - entry) * quantity : (entry - exit) * quantity;

  const mode: FeeMode = input.feeMode ?? "none";
  let fees = 0;
  if (mode === "total") fees = num(input.feeTotal) ?? 0;
  else if (mode === "sides") fees = (num(input.feeEntry) ?? 0) + (num(input.feeExit) ?? 0);
  else if (mode === "percent") {
    const pct = (num(input.feePercent) ?? 0) / 100;
    fees = pct * (entry * quantity + exit * quantity);
  }
  const otherCosts = num(input.otherCosts) ?? 0;
  const netPnl = grossPnl - fees - otherCosts;

  const priceChangePercent =
    dir === "LONG" ? ((exit - entry) / entry) * 100 : ((entry - exit) / entry) * 100;

  const roiMargin = margin && margin > 0 ? (netPnl / margin) * 100 : null;
  const pnlPercentOnCapital = capital && capital > 0 ? (netPnl / capital) * 100 : null;

  const riskAmount = stopLoss !== null ? Math.abs(entry - stopLoss) * quantity : null;
  const riskPercent =
    riskAmount !== null && capital && capital > 0 ? (riskAmount / capital) * 100 : null;

  const resultR = riskAmount && riskAmount > 0 ? netPnl / riskAmount : null;
  const realizedRr = resultR;

  let plannedRr: number | null = null;
  if (stopLoss !== null && takeProfit !== null) {
    const risk = dir === "LONG" ? entry - stopLoss : stopLoss - entry;
    const reward = dir === "LONG" ? takeProfit - entry : entry - takeProfit;
    if (risk > 0) plannedRr = reward / risk;
  }

  const tradeResult = netPnl > 0 ? "WIN" : netPnl < 0 ? "LOSS" : "BREAK_EVEN";

  return {
    marketType: input.marketType,
    direction: dir,
    currency: input.currency ?? "USD",
    decimals: num(input.decimals) ?? defaultDecimals(input.marketType),
    entryPrice: entry,
    exitPrice: exit,
    quantity,
    lotSize: num(input.lotSize),
    contractSize: num(input.contractSize),
    leverage,
    notionalValue,
    margin,
    stopLoss,
    takeProfit,
    grossPnl,
    fees: fees + otherCosts,
    netPnl,
    priceChangePercent,
    roiMargin,
    pnlPercentOnCapital,
    riskAmount,
    riskPercent,
    plannedRr,
    realizedRr,
    resultR,
    tradeResult,
  };
}

/* ------------------------------ Presentación ------------------------------ */

export function fmtMoney(value: number | null | undefined, currency: Currency, decimals = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const digits = currency === "PYG" ? 0 : decimals;
  const body = abs.toLocaleString("es-PY", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  const unit = currency === "PYG" ? "Gs" : currency;
  return `${sign}${body} ${unit}`;
}

export function fmtNumber(value: number | null | undefined, decimals = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toLocaleString("es-PY", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function fmtPercent(value: number | null | undefined, decimals = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
}

export function fmtR(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}R`;
}

export function fmtRatio(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `1 : ${value.toFixed(2)}`;
}

export const RESULT_LABEL: Record<PostTradeResult["tradeResult"], string> = {
  WIN: "GANADORA",
  LOSS: "PERDEDORA",
  BREAK_EVEN: "BREAK EVEN",
};
