-- Force PostgREST to reload its schema cache so it picks up the notifications table
NOTIFY pgrst, 'reload schema';
