-- Calorie target: how fast to go towards the goal, a manual adjustment, and Build With Science's target.
alter table public.profiles
  add column if not exists goal_pace text not null default 'normal' check (goal_pace in ('slow', 'normal', 'fast')),
  -- kcal a day added by the person or their coach, on top of the weekly check-ins (kcal_adjust)
  add column if not exists kcal_manual int not null default 0 check (kcal_manual between -1500 and 1500),
  -- 'forza': worked out by Forza!; 'bws': the target Build With Science shows (read on the phone)
  add column if not exists kcal_source text not null default 'forza' check (kcal_source in ('forza', 'bws')),
  add column if not exists bws_targets jsonb,
  add column if not exists bws_targets_at timestamptz;

-- The knowledge base, as the family coach changes it in Forza! Coach: lessons (a built-in one changed or
-- hidden, or a new one) and tips of the day. Everyone reads it; only Coach (service role) writes.
create table if not exists public.kb_lessons (
  id text primary key,
  track text not null default 'course' check (track in ('course', 'expert')),
  position int,
  hidden boolean not null default false,
  -- { emoji, tone, title: {en, it}, subtitle: {en, it}, blocks: [...], sources: [...] }
  content jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists public.kb_tips (
  id text primary key,
  text_en text not null default '',
  text_it text not null default '',
  -- the lesson the tip links to ("Why? Read the lesson")
  topic text,
  hidden boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.kb_lessons enable row level security;
alter table public.kb_tips enable row level security;
-- Not personal: the print page (used without signing in) reads them too.
create policy "everyone: read" on public.kb_lessons for select to anon, authenticated using (true);
create policy "everyone: read" on public.kb_tips for select to anon, authenticated using (true);
