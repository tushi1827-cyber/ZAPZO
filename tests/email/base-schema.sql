-- Test-only replica of the production email_queue shape (from migrations
-- 20261111031913 and 20261111031929). Used by the PGlite harness only.

DO $body$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $body$;
DO $body$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $body$;
DO $body$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $body$;

CREATE TABLE public.email_queue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email text    NOT NULL,
  template_name   text    NOT NULL,
  subject         text    NOT NULL,
  payload         jsonb   NOT NULL DEFAULT '{}'::jsonb,
  status          text    NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  attempts        integer NOT NULL DEFAULT 0,
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz,
  claimed_at      timestamptz,
  dedup_key       text
);

ALTER TABLE public.email_queue ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX idx_email_queue_dedup
  ON public.email_queue (dedup_key)
  WHERE dedup_key IS NOT NULL;

CREATE INDEX idx_email_queue_status_created
  ON public.email_queue (status, created_at)
  WHERE status = 'pending';

CREATE INDEX idx_email_queue_processing_claimed
  ON public.email_queue (claimed_at)
  WHERE status = 'processing';

-- Same conflict target and clause as public.enqueue_email in production.
CREATE FUNCTION public.enqueue_email_insert(
  p_recipient text,
  p_template text,
  p_subject text,
  p_payload jsonb,
  p_dedup_key text
) RETURNS uuid
LANGUAGE sql
AS $$
  INSERT INTO public.email_queue (recipient_email, template_name, subject, payload, status, dedup_key)
  VALUES (p_recipient, p_template, p_subject, p_payload, 'pending', p_dedup_key)
  ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL
  DO NOTHING
  RETURNING id;
$$;
