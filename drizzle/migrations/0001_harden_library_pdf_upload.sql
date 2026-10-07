-- Biblioteca: endurecer la subida de PDF (solo admin, solo PDF, sección existente).
ALTER TABLE public.library_documents
  ADD CONSTRAINT library_documents_title_len CHECK (char_length(btrim(title)) BETWEEN 2 AND 200),
  ADD CONSTRAINT library_documents_description_len CHECK (char_length(description) <= 500),
  ADD CONSTRAINT library_documents_pdf_path CHECK (lower(storage_path) LIKE '%.pdf'),
  ADD CONSTRAINT library_documents_path_matches_block CHECK (split_part(storage_path, '/', 1) = block),
  ADD CONSTRAINT library_documents_size_range CHECK (size > 0 AND size <= 31457280);

DROP POLICY IF EXISTS "admins insert library files" ON storage.objects;
CREATE POLICY "admins insert library files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'library'
    AND private.is_admin(auth.uid())
    AND lower(storage.extension(name)) = 'pdf'
    AND (storage.foldername(name))[1] IN ('01','02','03','04','05','06')
  );