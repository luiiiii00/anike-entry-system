ALTER TABLE public.evaluations DROP CONSTRAINT IF EXISTS evaluations_final_state_check;
ALTER TABLE public.evaluations ADD CONSTRAINT evaluations_final_state_check
  CHECK (
    final_state IS NULL
    OR final_state IN ('BORRADOR', 'CONDICIONAL', 'APROBADA', 'NO TRADE', 'DESCARTADA')
  );