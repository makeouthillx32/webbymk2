-- Mail Threads and Messages schema for Poste.io + Brevo unified mailbox
-- Supports inbound ingestion (webhook/IMAP) and outbound replies directly from the dashboard.

create table if not exists public.mail_threads (
  id uuid primary key default gen_random_uuid(),
  mailbox text not null, -- e.g. support@unenter.live, admin@unenter.live
  subject text not null default '',
  snippet text not null default '',
  folder text not null default 'inbox' check (folder in ('inbox', 'drafts', 'sent', 'junk', 'trash', 'archive')),
  is_read boolean not null default false,
  labels text[] not null default '{}',
  participant_names text[] not null default '{}',
  participant_emails text[] not null default '{}',
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mail_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.mail_threads(id) on delete cascade,
  message_id text null,
  in_reply_to text null,
  from_name text not null default '',
  from_email text not null,
  to_emails text[] not null default '{}',
  reply_to text null,
  subject text not null default '',
  body_text text not null default '',
  body_html text null,
  is_outgoing boolean not null default false,
  read boolean not null default false,
  headers jsonb null default '{}'::jsonb,
  attachments jsonb null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists mail_threads_mailbox_folder_idx
  on public.mail_threads (mailbox, folder, last_message_at desc);

create index if not exists mail_threads_mailbox_read_idx
  on public.mail_threads (mailbox, is_read);

create index if not exists mail_messages_thread_id_idx
  on public.mail_messages (thread_id, created_at asc);

create index if not exists mail_messages_message_id_idx
  on public.mail_messages (message_id)
  where message_id is not null;

alter table public.mail_threads enable row level security;
alter table public.mail_messages enable row level security;

-- Grant permissions for service_role and authenticated dashboard users
grant select, insert, update, delete on table public.mail_threads to service_role;
grant select, insert, update, delete on table public.mail_messages to service_role;

create policy "Authenticated users can read mail threads"
  on public.mail_threads for select
  to authenticated
  using (true);

create policy "Authenticated users can update mail threads"
  on public.mail_threads for update
  to authenticated
  using (true);

create policy "Authenticated users can insert mail threads"
  on public.mail_threads for insert
  to authenticated
  with check (true);

create policy "Authenticated users can read mail messages"
  on public.mail_messages for select
  to authenticated
  using (true);

create policy "Authenticated users can insert mail messages"
  on public.mail_messages for insert
  to authenticated
  with check (true);
