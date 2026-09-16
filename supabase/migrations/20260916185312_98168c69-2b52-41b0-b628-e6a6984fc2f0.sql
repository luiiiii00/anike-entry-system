create table public.checklist_overlays (
  status text primary key,
  overlay jsonb not null default '{"version":1,"edits":{},"disabled":[],"added":[]}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint checklist_overlays_status_check check (status in ('DRAFT','PUBLISHED'))
);

grant select on public.checklist_overlays to authenticated;
grant all on public.checklist_overlays to service_role;

alter table public.checklist_overlays enable row level security;

create policy "read published or admin"
on public.checklist_overlays for select to authenticated
using (status = 'PUBLISHED' or private.is_admin(auth.uid()));

create policy "admins manage overlays"
on public.checklist_overlays for all to authenticated
using (private.is_admin(auth.uid()))
with check (private.is_admin(auth.uid()));

create trigger checklist_overlays_updated
before update on public.checklist_overlays
for each row execute function public.set_updated_at();