-- PDF Buddy schema. No "chats" table by design: messages live under anchors (places in a PDF),
-- and knowledge lives in notes that are merged and linked across documents.

create extension if not exists vector;

create table documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null,
  file_hash text not null,
  storage_path text not null,
  page_count int not null default 0,
  last_page int not null default 1,
  last_opened_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, file_hash)
);

create table doc_chunks (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  document_id uuid not null references documents on delete cascade,
  page int not null,
  text text not null,
  embedding vector(384) not null,
  tsv tsvector generated always as (to_tsvector('english', text)) stored
);
create index on doc_chunks using hnsw (embedding vector_cosine_ops);
create index on doc_chunks using gin (tsv);
create index on doc_chunks (document_id, page);

-- A pin: a selection (rects normalised to 0..1 of the page) or a whole page (rects = []).
create table anchors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  document_id uuid not null references documents on delete cascade,
  page int not null,
  rects jsonb not null default '[]',
  quote text not null default '',
  distilled_at timestamptz,
  created_at timestamptz not null default now()
);
create index on anchors (document_id, page);

create table messages (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  anchor_id uuid not null references anchors on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
create index on messages (anchor_id, created_at);

create table notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null check (kind in ('concept', 'insight', 'question', 'definition')),
  title text not null,
  body text not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  embedding vector(384) not null,
  tsv tsvector generated always as (to_tsvector('english', title || ' ' || body)) stored,
  document_id uuid references documents on delete set null,
  source_anchor_id uuid references anchors on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on notes using hnsw (embedding vector_cosine_ops);
create index on notes using gin (tsv);

create table note_links (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  from_note uuid not null references notes on delete cascade,
  to_note uuid not null references notes on delete cascade,
  relation text not null check (relation in ('related', 'contradicts', 'explains', 'example_of')),
  score real not null,
  primary key (from_note, to_note)
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  document_id uuid not null references documents on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  heartbeat_at timestamptz not null default now(), -- open sessions with a stale heartbeat were abandoned (quit/crash)
  pages jsonb not null default '{}',          -- { "12": 340 } page -> seconds
  last_page int not null default 1,
  summary text,
  open_questions jsonb not null default '[]'  -- ["..."]
);
create index on sessions (document_id, started_at desc);

-- Row level security: every row belongs to exactly one user.
do $$
declare t text;
begin
  foreach t in array array['documents','doc_chunks','anchors','messages','notes','note_links','sessions'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy owner_all on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- Nearest notes to an embedding, optionally excluding one document (for "related from your past").
create or replace function match_notes(query_embedding vector(384), match_count int default 5, exclude_doc uuid default null)
returns table (id uuid, kind text, title text, body text, document_id uuid, source_anchor_id uuid, similarity float)
language sql stable security invoker as $$
  select n.id, n.kind, n.title, n.body, n.document_id, n.source_anchor_id,
         1 - (n.embedding <=> query_embedding) as similarity
  from notes n
  where exclude_doc is null or n.document_id is distinct from exclude_doc
  order by n.embedding <=> query_embedding
  limit match_count;
$$;

-- Chunks of one document nearest to an embedding (grounding for answers).
create or replace function match_chunks(query_embedding vector(384), doc uuid, match_count int default 5)
returns table (page int, text text, similarity float)
language sql stable security invoker as $$
  select c.page, c.text, 1 - (c.embedding <=> query_embedding)
  from doc_chunks c where c.document_id = doc
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- Hybrid search over notes, anchors (quotes + their conversation) and PDF text.
-- Reciprocal-rank fusion of vector similarity and full-text rank.
create or replace function hybrid_search(query_text text, query_embedding vector(384), match_count int default 20)
returns table (kind text, id text, document_id uuid, page int, title text, snippet text, score float)
language sql stable security invoker as $$
  with q as (select websearch_to_tsquery('english', query_text) as tsq),
  -- vector candidates need a similarity floor, otherwise the nearest 50 always "match"
  note_vec as (
    select id, row_number() over (order by d) as r from (
      select n.id, n.embedding <=> query_embedding as d from notes n
      where 1 - (n.embedding <=> query_embedding) > 0.5
      order by d limit 50
    ) x
  ),
  note_fts as (
    select n.id, row_number() over (order by ts_rank(n.tsv, q.tsq) desc) as r
    from notes n, q where n.tsv @@ q.tsq limit 50
  ),
  notes_ranked as (
    select coalesce(v.id, f.id) as id,
           coalesce(1.0 / (60 + v.r), 0) + coalesce(1.0 / (60 + f.r), 0) as score
    from note_vec v full join note_fts f on v.id = f.id
  ),
  chunk_vec as (
    select id, row_number() over (order by d) as r from (
      select c.id, c.embedding <=> query_embedding as d from doc_chunks c
      where 1 - (c.embedding <=> query_embedding) > 0.5
      order by d limit 50
    ) x
  ),
  chunk_fts as (
    select c.id, row_number() over (order by ts_rank(c.tsv, q.tsq) desc) as r
    from doc_chunks c, q where c.tsv @@ q.tsq limit 50
  ),
  chunks_ranked as (
    select coalesce(v.id, f.id) as id,
           coalesce(1.0 / (60 + v.r), 0) + coalesce(1.0 / (60 + f.r), 0) as score
    from chunk_vec v full join chunk_fts f on v.id = f.id
  ),
  anchor_hits as (
    select a.id, ts_rank(t.doc, q.tsq) as rank
    from anchors a
    cross join lateral (
      select to_tsvector('english', a.quote || ' ' ||
        coalesce((select string_agg(m.content, ' ') from messages m where m.anchor_id = a.id), '')) as doc
    ) t, q
    where t.doc @@ q.tsq
    order by rank desc limit 20
  )
  select * from (
    select 'note'::text, n.id::text, n.document_id, a.page, n.title, left(n.body, 240), r.score * 1.2
    from notes_ranked r join notes n on n.id = r.id left join anchors a on a.id = n.source_anchor_id
    union all
    select 'passage', c.id::text, c.document_id, c.page, d.title, left(c.text, 240), r.score
    from chunks_ranked r join doc_chunks c on c.id = r.id join documents d on d.id = c.document_id
    union all
    select 'pin', a.id::text, a.document_id, a.page, d.title, left(nullif(a.quote, ''), 240), (1.0 / 60) * (1 + h.rank)
    from anchor_hits h join anchors a on a.id = h.id join documents d on d.id = a.document_id
  ) s
  order by 7 desc
  limit match_count;
$$;

-- PDF storage bucket: files live under "<user_id>/<hash>.pdf".
insert into storage.buckets (id, name, public) values ('pdfs', 'pdfs', false) on conflict do nothing;
create policy "own pdfs" on storage.objects for all
  using (bucket_id = 'pdfs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'pdfs' and (storage.foldername(name))[1] = auth.uid()::text);
