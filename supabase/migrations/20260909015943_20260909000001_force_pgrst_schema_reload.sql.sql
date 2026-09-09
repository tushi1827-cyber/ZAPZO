-- Force PostgREST to reload its schema cache so it picks up
-- the support_tickets, ticket_messages, and ticket_activity_log tables
-- plus the create_support_ticket / reply_to_ticket / admin_* RPC functions.
NOTIFY pgrst, 'reload schema';