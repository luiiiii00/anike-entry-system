-- La tabla interna de contadores sólo es accesible por el servidor (service_role).
DROP POLICY IF EXISTS "service role manages trade counters" ON private.trade_counters;
CREATE POLICY "service role manages trade counters"
  ON private.trade_counters
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);