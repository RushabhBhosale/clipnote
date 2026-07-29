-- ClipNote cloud sync. This table is intentionally limited to non-sensitive,
-- non-expiring clips. Each account can access only its own timeline.

create table if not exists public.clip_items (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) <= 512),
  raw_content text not null check (char_length(raw_content) <= 5000000),
  normalized_content text not null check (char_length(normalized_content) <= 5000000),
  content_type text not null,
  source_application text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  last_copied_at timestamptz not null,
  copy_count bigint not null default 1 check (copy_count >= 0),
  is_favorite boolean not null default false,
  is_sensitive boolean not null default false check (is_sensitive = false),
  expires_at timestamptz check (expires_at is null),
  tags jsonb not null default '[]'::jsonb,
  detected_language text,
  image_path text,
  ocr_text text,
  deleted_at timestamptz,
  is_snippet boolean not null default false
);

create index if not exists clip_items_user_updated_at_idx on public.clip_items (user_id, updated_at desc);

alter table public.clip_items enable row level security;

drop policy if exists "Users can read their ClipNote items" on public.clip_items;
create policy "Users can read their ClipNote items"
  on public.clip_items for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can add their ClipNote items" on public.clip_items;
create policy "Users can add their ClipNote items"
  on public.clip_items for insert to authenticated
  with check (auth.uid() = user_id and is_sensitive = false and expires_at is null);

drop policy if exists "Users can change their ClipNote items" on public.clip_items;
create policy "Users can change their ClipNote items"
  on public.clip_items for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and is_sensitive = false and expires_at is null);

drop policy if exists "Users can remove their ClipNote items" on public.clip_items;
create policy "Users can remove their ClipNote items"
  on public.clip_items for delete to authenticated
  using (auth.uid() = user_id);

alter table public.clip_items replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.clip_items;
exception
  when duplicate_object then null;
end $$;
