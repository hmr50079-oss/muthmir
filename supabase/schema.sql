-- ============================================================
-- مثمر — إعداد قاعدة البيانات وسياسات الحماية (RLS)
-- شغّل هذا الملف كاملًا مرة واحدة في Supabase SQL Editor.
-- الملف آمن لإعادة التشغيل: يضيف الأعمدة الناقصة ولا يحذف البيانات.
--
-- مهم:
--   • هذا الملف لا يحتوي أي مفاتيح سرية.
--   • لا تضع مفتاح service_role في الواجهة أو في Git.
--   • المفتاح العام (anon / publishable) هو الوحيد المسموح به في المتصفح.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1) جدول المهام (للتثبيت الجديد)
-- ------------------------------------------------------------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  notes text not null default '',
  priority text not null default 'medium',
  category text not null default 'other',
  due_date date,
  due_time time,
  reminder_minutes integer,
  reminder_sent_at timestamptz,
  completed boolean not null default false,
  completed_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_title_length check (char_length(title) between 1 and 140),
  constraint tasks_notes_length check (char_length(notes) <= 900),
  constraint tasks_priority_check check (priority in ('high', 'medium', 'low')),
  constraint tasks_category_check check (category in ('work', 'personal', 'health', 'learning', 'home', 'other')),
  constraint tasks_reminder_check check (reminder_minutes is null or reminder_minutes in (0, 10, 30, 60, 1440)),
  constraint tasks_due_time_requires_date check (due_time is null or due_date is not null),
  constraint tasks_reminder_requires_time check (reminder_minutes is null or (due_date is not null and due_time is not null))
);

-- ------------------------------------------------------------
-- 2) ترقية جدول قديم موجود (مثل جدول tasks المبسّط)
--    لا يحذف أي صف، ويضيف الأعمدة الناقصة فقط.
-- ------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks' and column_name = 'is_completed'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks' and column_name = 'completed'
  ) then
    execute 'alter table public.tasks rename column is_completed to completed';
  end if;
end;
$$;

alter table public.tasks add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.tasks add column if not exists title text;
alter table public.tasks add column if not exists notes text not null default '';
alter table public.tasks add column if not exists priority text not null default 'medium';
alter table public.tasks add column if not exists category text not null default 'other';
alter table public.tasks add column if not exists due_date date;
alter table public.tasks add column if not exists due_time time;
alter table public.tasks add column if not exists reminder_minutes integer;
alter table public.tasks add column if not exists reminder_sent_at timestamptz;
alter table public.tasks add column if not exists completed boolean not null default false;
alter table public.tasks add column if not exists completed_at timestamptz;
alter table public.tasks add column if not exists sort_order integer not null default 0;
alter table public.tasks add column if not exists created_at timestamptz not null default now();
alter table public.tasks add column if not exists updated_at timestamptz not null default now();

-- إذا كان الجدول القديم يحتوي العمودين معًا، ننسخ القيم إلى completed.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks' and column_name = 'is_completed'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks' and column_name = 'completed'
  ) then
    execute 'update public.tasks set completed = is_completed where completed is distinct from is_completed';
  end if;
end;
$$;

-- القيود: نضيفها فقط إذا لم تكن موجودة. NOT VALID يضمن عدم فشل الترقية
-- بسبب صفوف قديمة، مع تطبيقها على كل الصفوف الجديدة أو المعدّلة.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_title_length' and conrelid = 'public.tasks'::regclass) then
    alter table public.tasks add constraint tasks_title_length check (char_length(title) between 1 and 140) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tasks_notes_length' and conrelid = 'public.tasks'::regclass) then
    alter table public.tasks add constraint tasks_notes_length check (char_length(notes) <= 900) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tasks_priority_check' and conrelid = 'public.tasks'::regclass) then
    alter table public.tasks add constraint tasks_priority_check check (priority in ('high', 'medium', 'low')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tasks_category_check' and conrelid = 'public.tasks'::regclass) then
    alter table public.tasks add constraint tasks_category_check check (category in ('work', 'personal', 'health', 'learning', 'home', 'other')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tasks_reminder_check' and conrelid = 'public.tasks'::regclass) then
    alter table public.tasks add constraint tasks_reminder_check check (reminder_minutes is null or reminder_minutes in (0, 10, 30, 60, 1440)) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tasks_due_time_requires_date' and conrelid = 'public.tasks'::regclass) then
    alter table public.tasks add constraint tasks_due_time_requires_date check (due_time is null or due_date is not null) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tasks_reminder_requires_time' and conrelid = 'public.tasks'::regclass) then
    alter table public.tasks add constraint tasks_reminder_requires_time check (reminder_minutes is null or (due_date is not null and due_time is not null)) not valid;
  end if;
end;
$$;

create index if not exists tasks_user_id_idx on public.tasks (user_id);
create index if not exists tasks_user_due_idx on public.tasks (user_id, due_date, due_time);
create index if not exists tasks_user_completed_idx on public.tasks (user_id, completed);

-- ------------------------------------------------------------
-- 3) تحديث updated_at تلقائيًا
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 4) تفعيل RLS وسياسات العزل بين المستخدمين
--    نحذف السياسات القديمة على هذا الجدول لمنع أي سياسة متساهلة قديمة.
-- ------------------------------------------------------------
do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'tasks'
  loop
    execute format('drop policy if exists %I on public.tasks', policy_record.policyname);
  end loop;
end;
$$;

alter table public.tasks enable row level security;

create policy "tasks_select_own"
on public.tasks for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "tasks_insert_own"
on public.tasks for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "tasks_update_own"
on public.tasks for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "tasks_delete_own"
on public.tasks for delete
to authenticated
using ((select auth.uid()) = user_id);

-- المستخدم المجهول (وضع التجربة) يحصل على دور authenticated أيضًا،
-- لكنه لا يرى إلا الصفوف التي تحمل معرّفه هو.
revoke all on public.tasks from anon;
grant select, insert, update, delete on public.tasks to authenticated;

-- ------------------------------------------------------------
-- 5) استبدال كل مهام المستخدم دفعة واحدة (استيراد النسخة الاحتياطية)
--    تعمل داخل معاملة واحدة: إما تنجح كلها أو لا يتغير شيء.
-- ------------------------------------------------------------
create or replace function public.replace_my_tasks(p_tasks jsonb)
returns setof public.tasks
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  delete from public.tasks where user_id = v_user;

  return query
  insert into public.tasks (
    id,
    user_id,
    title,
    notes,
    priority,
    category,
    due_date,
    due_time,
    reminder_minutes,
    reminder_sent_at,
    completed,
    completed_at,
    created_at,
    updated_at,
    sort_order
  )
  select
    coalesce(x.id, gen_random_uuid()),
    v_user,
    x.title,
    coalesce(x.notes, ''),
    x.priority,
    x.category,
    x.due_date,
    x.due_time,
    x.reminder_minutes,
    x.reminder_sent_at,
    coalesce(x.completed, false),
    x.completed_at,
    coalesce(x.created_at, now()),
    now(),
    coalesce(x.sort_order, 0)
  from jsonb_to_recordset(coalesce(p_tasks, '[]'::jsonb)) as x(
    id uuid,
    title text,
    notes text,
    priority text,
    category text,
    due_date date,
    due_time time,
    reminder_minutes integer,
    reminder_sent_at timestamptz,
    completed boolean,
    completed_at timestamptz,
    created_at timestamptz,
    sort_order integer
  )
  returning *;
end;
$$;

revoke all on function public.replace_my_tasks(jsonb) from public;
grant execute on function public.replace_my_tasks(jsonb) to authenticated;

-- ------------------------------------------------------------
-- 6) حذف الحساب من داخل التطبيق
--    دالة SECURITY DEFINER تحذف صاحب الجلسة فقط، وليس أي مستخدم آخر.
--    راجعها مع مسؤول قاعدة البيانات قبل الاستخدام في الإنتاج.
--    البديل الأكثر أمانًا هو Edge Function بمفتاح service_role على الخادم.
-- ------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  delete from auth.users where id = v_user;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

-- ------------------------------------------------------------
-- 7) تحقق سريع بعد التنفيذ
-- ------------------------------------------------------------
-- يجب أن تظهر rowsecurity = true
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename = 'tasks';

-- يجب أن تظهر 4 سياسات للمهام
select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'tasks'
order by policyname;
