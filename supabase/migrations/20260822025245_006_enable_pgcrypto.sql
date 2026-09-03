/*
# Enable pgcrypto extension

## Overview
The `generate_referral_code()` function uses `gen_random_bytes()` which requires the `pgcrypto` extension.
This migration enables it so that the auth user creation trigger works.

## Changes
- CREATE EXTENSION IF NOT EXISTS pgcrypto
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto;
