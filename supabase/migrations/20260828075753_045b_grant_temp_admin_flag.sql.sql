-- Grant execute to authenticated for the temp admin flag function
GRANT EXECUTE ON FUNCTION public.temp_set_admin_flag(uuid) TO authenticated;
