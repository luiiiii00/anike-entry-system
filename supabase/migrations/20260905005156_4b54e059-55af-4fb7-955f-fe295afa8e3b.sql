-- ============================================================================
-- Tercera intervención — cierre de integridad del motor ANIKE EJEPIKA
-- Fuente de verdad server-side, numeración transaccional por usuario y
-- protección de campos derivados. Idempotente. No reescribe datos históricos.
-- ============================================================================

-- 1) Estado final derivado del sistema (calculado sólo en servidor)
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS final_state text;
ALTER TABLE public.evaluations DROP CONSTRAINT IF EXISTS evaluations_final_state_check;
ALTER TABLE public.evaluations ADD CONSTRAINT evaluations_final_state_check
  CHECK (final_state IS NULL OR final_state IN ('APROBADA', 'CONDICIONAL', 'DESCARTADA'));

-- 2) Numeración por usuario: contador transaccional + unicidad
CREATE TABLE IF NOT EXISTS private.trade_counters (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_no integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON private.trade_counters FROM PUBLIC, anon, authenticated;
ALTER TABLE private.trade_counters ENABLE ROW LEVEL SECURITY;

-- Semilla desde los datos históricos (conserva la numeración existente)
INSERT INTO private.trade_counters (user_id, last_no)
SELECT user_id, max(trade_no)
FROM public.evaluations
WHERE trade_no IS NOT NULL
GROUP BY user_id
ON CONFLICT (user_id) DO UPDATE
  SET last_no = GREATEST(private.trade_counters.last_no, EXCLUDED.last_no);

-- Siguiente número: atómico bajo bloqueo de fila (ON CONFLICT DO UPDATE).
-- GREATEST(...) cubre inserciones históricas/administrativas con número explícito.
CREATE OR REPLACE FUNCTION private.next_trade_no(_user uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO private.trade_counters AS c (user_id, last_no)
  VALUES (
    _user,
    (SELECT coalesce(max(e.trade_no), 0) FROM public.evaluations e WHERE e.user_id = _user) + 1
  )
  ON CONFLICT (user_id) DO UPDATE
    SET last_no = GREATEST(
          c.last_no,
          (SELECT coalesce(max(e.trade_no), 0) FROM public.evaluations e WHERE e.user_id = _user)
        ) + 1,
        updated_at = now()
  RETURNING c.last_no;
$$;
REVOKE ALL ON FUNCTION private.next_trade_no(uuid) FROM PUBLIC, anon, authenticated;

-- Dos operaciones del mismo usuario nunca comparten número (no hay duplicados históricos).
CREATE UNIQUE INDEX IF NOT EXISTS evaluations_user_trade_no_key
  ON public.evaluations (user_id, trade_no)
  WHERE trade_no IS NOT NULL;

-- El cliente nunca elige el número: lo asigna el contador al insertar.
CREATE OR REPLACE FUNCTION public.assign_trade_no()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.trade_no IS NULL OR coalesce(auth.role(), '') IN ('authenticated', 'anon') THEN
    NEW.trade_no := private.next_trade_no(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.assign_trade_no() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS evaluations_assign_trade_no ON public.evaluations;
CREATE TRIGGER evaluations_assign_trade_no
  BEFORE INSERT ON public.evaluations
  FOR EACH ROW EXECUTE FUNCTION public.assign_trade_no();

-- 3) Campos derivados: sólo el servidor (service_role) puede escribirlos.
--    Un cliente autenticado sólo puede crear borradores con datos fuente y
--    editar datos fuente mientras la evaluación no esté finalizada.
CREATE OR REPLACE FUNCTION public.protect_evaluation_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  end_user boolean := coalesce(auth.role(), '') IN ('authenticated', 'anon');
BEGIN
  IF NOT end_user THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.score IS NOT NULL
       OR NEW.breakdown IS DISTINCT FROM '{}'::jsonb
       OR NEW.classification IS NOT NULL
       OR coalesce(array_length(NEW.hard_rules, 1), 0) > 0
       OR NEW.emotional_stop IS TRUE
       OR NEW.status IS DISTINCT FROM 'draft'
       OR NEW.decision IS NOT NULL
       OR NEW.final_state IS NOT NULL
       OR NEW.result_r IS NOT NULL
       OR NEW.result_money IS NOT NULL
       OR NEW.market_type IS NOT NULL
       OR NEW.currency IS NOT NULL
       OR NEW.entry_price IS NOT NULL
       OR NEW.exit_price IS NOT NULL
       OR NEW.quantity IS NOT NULL
       OR NEW.lot_size IS NOT NULL
       OR NEW.contract_size IS NOT NULL
       OR NEW.leverage IS NOT NULL
       OR NEW.margin IS NOT NULL
       OR NEW.notional_value IS NOT NULL
       OR NEW.stop_loss IS NOT NULL
       OR NEW.take_profit IS NOT NULL
       OR NEW.gross_pnl IS NOT NULL
       OR NEW.fees IS NOT NULL
       OR NEW.net_pnl IS NOT NULL
       OR NEW.price_change_percent IS NOT NULL
       OR NEW.roi_margin IS NOT NULL
       OR NEW.risk_amount IS NOT NULL
       OR NEW.risk_percent IS NOT NULL
       OR NEW.planned_rr IS NOT NULL
       OR NEW.realized_rr IS NOT NULL
       OR NEW.trade_result IS NOT NULL
       OR NEW.post_trade_inputs IS DISTINCT FROM '{}'::jsonb
       OR NEW.calculated_at IS NOT NULL
    THEN
      RAISE EXCEPTION 'derived_fields_are_server_managed'
        USING ERRCODE = '42501',
              HINT = 'score, classification, decision, status y resultados post-trade los calcula el servidor.';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE ------------------------------------------------------------------
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.trade_no IS DISTINCT FROM OLD.trade_no
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'identity_fields_are_immutable' USING ERRCODE = '42501';
  END IF;

  IF NEW.score IS DISTINCT FROM OLD.score
     OR NEW.breakdown IS DISTINCT FROM OLD.breakdown
     OR NEW.classification IS DISTINCT FROM OLD.classification
     OR NEW.hard_rules IS DISTINCT FROM OLD.hard_rules
     OR NEW.emotional_stop IS DISTINCT FROM OLD.emotional_stop
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.decision IS DISTINCT FROM OLD.decision
     OR NEW.final_state IS DISTINCT FROM OLD.final_state
     OR NEW.result_r IS DISTINCT FROM OLD.result_r
     OR NEW.result_money IS DISTINCT FROM OLD.result_money
     OR NEW.market_type IS DISTINCT FROM OLD.market_type
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.entry_price IS DISTINCT FROM OLD.entry_price
     OR NEW.exit_price IS DISTINCT FROM OLD.exit_price
     OR NEW.quantity IS DISTINCT FROM OLD.quantity
     OR NEW.lot_size IS DISTINCT FROM OLD.lot_size
     OR NEW.contract_size IS DISTINCT FROM OLD.contract_size
     OR NEW.leverage IS DISTINCT FROM OLD.leverage
     OR NEW.margin IS DISTINCT FROM OLD.margin
     OR NEW.notional_value IS DISTINCT FROM OLD.notional_value
     OR NEW.stop_loss IS DISTINCT FROM OLD.stop_loss
     OR NEW.take_profit IS DISTINCT FROM OLD.take_profit
     OR NEW.gross_pnl IS DISTINCT FROM OLD.gross_pnl
     OR NEW.fees IS DISTINCT FROM OLD.fees
     OR NEW.net_pnl IS DISTINCT FROM OLD.net_pnl
     OR NEW.price_change_percent IS DISTINCT FROM OLD.price_change_percent
     OR NEW.roi_margin IS DISTINCT FROM OLD.roi_margin
     OR NEW.risk_amount IS DISTINCT FROM OLD.risk_amount
     OR NEW.risk_percent IS DISTINCT FROM OLD.risk_percent
     OR NEW.planned_rr IS DISTINCT FROM OLD.planned_rr
     OR NEW.realized_rr IS DISTINCT FROM OLD.realized_rr
     OR NEW.trade_result IS DISTINCT FROM OLD.trade_result
     OR NEW.post_trade_inputs IS DISTINCT FROM OLD.post_trade_inputs
     OR NEW.calculated_at IS DISTINCT FROM OLD.calculated_at
  THEN
    RAISE EXCEPTION 'derived_fields_are_server_managed'
      USING ERRCODE = '42501',
            HINT = 'score, classification, decision, status y resultados post-trade los calcula el servidor.';
  END IF;

  -- Una evaluación finalizada congela sus datos fuente para el cliente.
  IF OLD.status = 'completed' AND (
       NEW.answers IS DISTINCT FROM OLD.answers
    OR NEW.risk IS DISTINCT FROM OLD.risk
    OR NEW.trade_date IS DISTINCT FROM OLD.trade_date
    OR NEW.trade_time IS DISTINCT FROM OLD.trade_time
    OR NEW.asset IS DISTINCT FROM OLD.asset
    OR NEW.market IS DISTINCT FROM OLD.market
    OR NEW.session IS DISTINCT FROM OLD.session
    OR NEW.direction IS DISTINCT FROM OLD.direction
    OR NEW.setup IS DISTINCT FROM OLD.setup
    OR NEW.idea IS DISTINCT FROM OLD.idea
  ) THEN
    RAISE EXCEPTION 'completed_evaluation_is_frozen'
      USING ERRCODE = '42501',
            HINT = 'Una evaluación finalizada sólo admite la reflexión post-trade (followed_plan, review, notes).';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_evaluation_fields() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS evaluations_protect_fields ON public.evaluations;
CREATE TRIGGER evaluations_protect_fields
  BEFORE INSERT OR UPDATE ON public.evaluations
  FOR EACH ROW EXECUTE FUNCTION public.protect_evaluation_fields();