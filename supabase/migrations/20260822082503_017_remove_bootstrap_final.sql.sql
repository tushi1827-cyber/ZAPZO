/*
# Remove temporary admin bootstrap mechanism (final cleanup)

## Overview
Drops the temporary bootstrap_admin function, temp_read_bootstrap_secret
function, and bootstrap_config table that were re-created for the referral
reward QA pass. All QA is complete; no bootstrap mechanism should remain.
*/

DROP FUNCTION IF EXISTS public.bootstrap_admin(uuid, text);
DROP FUNCTION IF EXISTS public.temp_read_bootstrap_secret();
DROP TABLE IF EXISTS public.bootstrap_config;
