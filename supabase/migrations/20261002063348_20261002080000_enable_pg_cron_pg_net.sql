/*
# Enable pg_cron and pg_net extensions for email queue scheduler

## Purpose
Enables the two extensions needed for the automated email queue processing scheduler:
- pg_cron: PostgreSQL cron scheduler (runs jobs on a schedule)
- pg_net: HTTP client for PostgreSQL (allows the database to make HTTP POST requests to Edge Functions)

## Changes
1. Create extension pg_cron (if not exists) -- installed in the 'cron' schema
2. Create extension pg_net (if not exists) -- installed in the 'public' schema by default

## Security
- No RLS changes
- No table changes
- No function changes
- pg_cron jobs run as the postgres superuser by default (needed to access Vault and pg_net)
- pg_net is used only by SECURITY DEFINER functions that read secrets from Vault

## Notes
- pg_cron must be created in the 'cron' schema (Supabase requirement)
- pg_net provides the http_post() function for making HTTP requests from SQL
- These extensions are available on all Supabase projects (confirmed via pg_available_extensions)
- This migration only enables extensions; no scheduler function or cron job is created here
*/

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
