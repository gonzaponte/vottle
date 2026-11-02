# Synthetic fixtures

The date-named archive-shaped responses are synthetic, generated from the verified 2026 rates.
They exercise negative prices, 24-hour days and both DST transitions. They are not
recorded electricity prices and must never be presented as real published prices.
The demo uses 2026-11-01; the missing following day exercises the unpublished state.

`esios-2026-11-02.json` is a recorded official ESIOS response, not synthetic.
Its `_provenance` records the URL and retrieval time. It reproduces the regulated
calendar disagreement reported in GitHub Actions. It is used only in regression
tests, never automatically substituted for the current day.
