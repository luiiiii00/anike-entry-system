import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const numish = z.union([z.number(), z.null()]).optional();

const inputSchema = z.object({
  evaluationId: z.string().uuid(),
  marketType: z.enum(["CRYPTO", "FOREX", "CFD", "FUTURES"]),
  direction: z.enum(["LONG", "SHORT"]),
  symbol: z.string().max(40).nullable().optional(),
  entryDate: z.string().max(10).nullable().optional(),
  exitDate: z.string().max(10).nullable().optional(),
  entryPrice: numish,
  exitPrice: numish,
  quantity: numish,
  lotSize: numish,
  contractSize: numish,
  leverage: numish,
  margin: numish,
  capital: numish,
  stopLoss: numish,
  takeProfit: numish,
  feeMode: z.enum(["none", "total", "sides", "percent"]).optional(),
  feeTotal: numish,
  feeEntry: numish,
  feeExit: numish,
  feePercent: numish,
  otherCosts: numish,
  currency: z.enum(["USD", "PYG", "USDT", "EUR"]).optional(),
  decimals: numish,
  notes: z.string().max(2000).nullable().optional(),
});

/**
 * Recalcula SIEMPRE en servidor a partir de los datos introducidos.
 * Nunca se confía en los resultados enviados por el navegador.
 * RLS aplica como el usuario: sólo puede actualizar sus propias operaciones.
 */
export const savePostTradeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => inputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { calculatePostTrade } = await import("@/lib/posttrade");
    const { evaluationId, notes, ...input } = data;

    // Una operación descartada por el sistema no puede cerrarse como registrada.
    const { data: current, error: readError } = await context.supabase
      .from("evaluations")
      .select("classification, hard_rules, emotional_stop")
      .eq("id", evaluationId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!current) throw new Error("trade_not_found");
    const rejected =
      current.classification === "NO TRADE" ||
      (current.hard_rules?.length ?? 0) > 0 ||
      current.emotional_stop === true;
    if (rejected) throw new Error("trade_rejected_cannot_register");

    const r = calculatePostTrade(input);


    const patch = {
      market_type: r.marketType,
      currency: r.currency,
      direction: r.direction,
      entry_price: r.entryPrice,
      exit_price: r.exitPrice,
      quantity: r.quantity,
      lot_size: r.lotSize,
      contract_size: r.contractSize,
      leverage: r.leverage,
      margin: r.margin,
      notional_value: r.notionalValue,
      stop_loss: r.stopLoss,
      take_profit: r.takeProfit,
      gross_pnl: r.grossPnl,
      fees: r.fees,
      net_pnl: r.netPnl,
      price_change_percent: r.priceChangePercent,
      roi_margin: r.roiMargin,
      risk_amount: r.riskAmount,
      risk_percent: r.riskPercent,
      planned_rr: r.plannedRr,
      realized_rr: r.realizedRr,
      trade_result: r.tradeResult,
      result_r: r.resultR,
      result_money: r.netPnl,
      post_trade_inputs: { ...input, decimals: r.decimals },
      calculated_at: new Date().toISOString(),
      status: "completed",
      decision: "registrado",
      ...(input.symbol ? { asset: input.symbol } : {}),
      ...(notes !== undefined && notes !== null ? { notes } : {}),
    };

    const { data: row, error } = await context.supabase
      .from("evaluations")
      .update(patch)
      .eq("id", evaluationId)
      .eq("user_id", context.userId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("trade_not_found");

    return { id: row.id, result: r };
  });
