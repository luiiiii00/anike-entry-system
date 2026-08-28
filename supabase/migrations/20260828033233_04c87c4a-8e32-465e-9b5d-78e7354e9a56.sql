CREATE TABLE public.library_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  block text NOT NULL CHECK (block IN ('01','02','03','04','05','06')),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  storage_path text NOT NULL,
  size integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 100,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.library_documents TO authenticated;
GRANT ALL ON public.library_documents TO service_role;

ALTER TABLE public.library_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone signed in reads library" ON public.library_documents
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admins manage library" ON public.library_documents
  FOR ALL TO authenticated
  USING (private.is_admin(auth.uid()))
  WITH CHECK (private.is_admin(auth.uid()));

CREATE POLICY "signed in read library files" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'library');

CREATE POLICY "admins insert library files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'library' AND private.is_admin(auth.uid()));

CREATE POLICY "admins delete library files" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'library' AND private.is_admin(auth.uid()));