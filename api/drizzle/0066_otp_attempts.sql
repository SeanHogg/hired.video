-- 5-attempt lockout on email-OTP verification.
--
-- The two_factor_codes row tracks how many wrong codes were submitted
-- against this challenge. The verify-2fa endpoint increments on each
-- mismatch and treats >=5 as terminal — burns the row, forces the user
-- back to the login screen.
--
-- Without this counter, an attacker with a valid tempAuthToken can
-- brute-force the 6-digit space (10^6 = 1M) inside the 10-minute TTL.
-- A 5-attempt cap reduces effective entropy by ~17 bits.

ALTER TABLE two_factor_codes
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
