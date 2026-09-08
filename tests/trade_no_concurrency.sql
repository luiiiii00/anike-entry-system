-- Prueba de atomicidad de la numeración de operaciones (trade_no).
--
-- Replica el mecanismo real de producción (migración 20260905005156):
--   private.trade_counters + private.next_trade_no() con
--   INSERT ... ON CONFLICT (user_id) DO UPDATE ... RETURNING
-- que toma un bloqueo de fila por usuario, de modo que dos transacciones
-- concurrentes del mismo usuario se serializan y nunca obtienen el mismo número.
--
-- Uso: tests/trade_no_concurrency.sh (levanta un PostgreSQL temporal y lanza
-- N clientes concurrentes contra el mismo usuario).

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.trade_counters (
  user_id uuid PRIMARY KEY,
  last_no integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  trade_no integer
);

-- UNIQUE(user_id, trade_no) equivalente al índice parcial de producción.
CREATE UNIQUE INDEX IF NOT EXISTS evaluations_user_trade_no_key
  ON public.evaluations (user_id, trade_no)
  WHERE trade_no IS NOT NULL;

CREATE OR REPLACE FUNCTION private.next_trade_no(_user uuid)
RETURNS integer
LANGUAGE sql
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

CREATE OR REPLACE FUNCTION public.assign_trade_no()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.trade_no := private.next_trade_no(NEW.user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS evaluations_assign_trade_no ON public.evaluations;
CREATE TRIGGER evaluations_assign_trade_no
  BEFORE INSERT ON public.evaluations
  FOR EACH ROW EXECUTE FUNCTION public.assign_trade_no();
