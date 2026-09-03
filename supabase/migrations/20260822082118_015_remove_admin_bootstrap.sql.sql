/*
# Remove temporary admin bootstrap mechanism

## Overview
The admin bootstrap function and its config table were temporary, used only
to promote the first admin in a fresh project. Now that an admin exists, the
mechanism is removed to reduce the attack surface. The temp_read_bootstrap_secret
function is also dropped.

## Removed
- public.bootstrap_admin function
- public.temp_read_bootstrap_secret function
- public.bootstrap_config table
*/

DROP FUNCTION IF EXISTS public.bootstrap_admin(uuid, text);
DROP FUNCTION IF EXISTS public.temp_read_bootstrap_secret();
DROP TABLE IF EXISTS public.bootstrap_config;
