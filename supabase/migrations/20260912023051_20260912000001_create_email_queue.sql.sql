/*
# Create email_queue table for ZAPZO Mail System

## Purpose
Stores outgoing transactional emails before they are sent by the
`send-email` Edge Function.  The table acts as a durable queue: the
Edge Function reads pending rows, attempts delivery via Resend, and
updates the row status.

## New Table: public.email_queue

| Column            | Type        | Description                                         |
|-------------------|-------------|-----------------------------------------------------|
| id                | uuid (PK)   | Primary key, auto-generated                         |
| recipient_email   | text        | The email address to send to                        |
| template_name     | text        | Which template to use (e.g. "welcome", "withdrawal")|
| subject           | text        | Email subject line                                  |
| payload           | jsonb       | Template variables / dynamic content                |
| status            | text        | "pending" / "sent" / "failed"                       |
| attempts          | integer     | Number of delivery attempts (default 0)            |
| last_error        | text        | Error message from last failed attempt (nullable)  |
| created_at        | timestamptz| Row creation timestamp                              |
| sent_at           | timestamptz| When the email was successfully sent (nullable)    |

## Security

- RLS is ENABLED on email_queue.
- No policies are created for anon or authenticated roles — the table
  is accessible ONLY via the service-role key (used by Edge Functions
  and admin operations).  Normal users cannot read or write the queue.
- This is a deny-by-default design: with RLS enabled and no policies,
  the anon and authenticated roles get zero rows.

## Indexes

- idx_email_queue_status_created: partial index on (status, created_at)
  WHERE status = 'pending' — lets the Edge Function efficiently find
  rows that still need processing.
*/

CREATE TABLE IF NOT EXISTS public.email_queue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email text    NOT NULL,
  template_name   text    NOT NULL,
  subject         text    NOT NULL,
  payload         jsonb   NOT NULL DEFAULT '{}'::jsonb,
  status          text    NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'sent', 'failed')),
  attempts        integer NOT NULL DEFAULT 0,
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz
);

-- Enable RLS — deny-by-default (no policies = no access for anon/authenticated)
ALTER TABLE public.email_queue ENABLE ROW LEVEL SECURITY;

-- Partial index for the queue processor: find pending rows efficiently
CREATE INDEX IF NOT EXISTS idx_email_queue_status_created
  ON public.email_queue (created_at)
  WHERE status = 'pending';