-- Prueba de HUECOS (gaps) permitidos en la numeración de operaciones.
--
-- private.next_trade_no() consume el número ANTES de confirmar el INSERT.
-- Si la transacción falla o hace ROLLBACK, ese número queda consumido y aparece
-- un hueco en la secuencia. ESTO ES ESPERADO Y ACEPTADO: eliminar los huecos
-- exigiría relajar la atomicidad o serializar globalmente, lo que reintroduciría
-- el riesgo de números duplicados. La garantía que sí se exige es:
--   1. nunca dos filas del mismo usuario con el mismo trade_no;
--   2. la secuencia es estrictamente creciente.
--
-- Requiere el esquema de tests/trade_no_concurrency.sql cargado antes.
\set ON_ERROR_STOP on
\set u '''22222222-2222-2222-2222-222222222222'''

DELETE FROM public.evaluations WHERE user_id = :u;
DELETE FROM private.trade_counters WHERE user_id = :u;

-- 1) insert correcto -> nº 1
INSERT INTO public.evaluations (user_id) VALUES (:u);

-- 2) insert que consume el nº 2 y falla dentro de la transacción -> hueco
BEGIN;
  INSERT INTO public.evaluations (user_id) VALUES (:u);
  ROLLBACK;

-- 3) insert correcto posterior -> nº 3, nunca reutiliza el 2
INSERT INTO public.evaluations (user_id) VALUES (:u);

DO $$
DECLARE
  _u uuid := '22222222-2222-2222-2222-222222222222';
  _rows int; _distinct int; _max int; _has_two int;
BEGIN
  SELECT count(*), count(DISTINCT trade_no), max(trade_no),
         count(*) FILTER (WHERE trade_no = 2)
    INTO _rows, _distinct, _max, _has_two
    FROM public.evaluations WHERE user_id = _u;

  IF _rows <> 2 OR _distinct <> 2 THEN
    RAISE EXCEPTION 'FALLO: se esperaban 2 filas con 2 números únicos (filas=%, distintos=%)', _rows, _distinct;
  END IF;
  IF _has_two <> 0 THEN
    RAISE EXCEPTION 'FALLO: el número consumido por la transacción abortada se reutilizó';
  END IF;
  IF _max <> 3 THEN
    RAISE EXCEPTION 'FALLO: se esperaba un hueco y max(trade_no)=3, obtenido %', _max;
  END IF;
  RAISE NOTICE 'OK: hueco permitido (1,3) sin duplicados tras un insert abortado';
END $$;
