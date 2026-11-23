# Synthetic fixtures

The date-named archive-shaped responses are synthetic, generated from the verified 2026 rates.
They exercise negative prices, 24-hour days and both DST transitions. They are not
recorded electricity prices and must never be presented as real published prices.
The demo uses 2026-11-01 with seven synthetic preceding days (including autumn DST); the missing following day exercises the unpublished state.

`esios-2026-11-02.json` is a recorded official ESIOS response, not synthetic.
Its `_provenance` records the URL and retrieval time. It reproduces the regulated
calendar disagreement reported in GitHub Actions. It is used only in regression
tests, never automatically substituted for the current day.

`trends.json` contains 90 explicitly synthetic daily summaries ending on 2026-11-01.
They are generated from 23/24/25-hour synthetic schedules with the formula
`50 + (days_ago % 17) * 3 + (interval_index - 12)^2 * 0.7` EUR/MWh.
The demo's existing hourly archives override their corresponding summary dates.
These fixtures are isolated from the real disposable cache.
