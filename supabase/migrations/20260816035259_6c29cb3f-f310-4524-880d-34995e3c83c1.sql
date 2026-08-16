DROP POLICY IF EXISTS "own screenshots read" ON storage.objects;
CREATE POLICY "own screenshots read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'trade-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "own screenshots insert" ON storage.objects;
CREATE POLICY "own screenshots insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'trade-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "own screenshots update" ON storage.objects;
CREATE POLICY "own screenshots update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'trade-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'trade-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "own screenshots delete" ON storage.objects;
CREATE POLICY "own screenshots delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'trade-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);