# Verification notes

## Live source discrepancy: 2026-11-02

ESIOS archive 70, retrieved during development on 2026-11-02, reports `TEUPCB: "3,29"`
(EUR/MWh) for every interval of Monday 2026-11-02. At 08:00 mainland tariff rules
expect llano, 0.029267 EUR/kWh, rather than valle, 0.003292 EUR/kWh. The Monday
following All Saints is not a non-substitutable fixed-date national tariff holiday.

The live `just update` therefore fails validation and leaves previous data intact.
This is an observed source/calendar disagreement, not a timeout. Do not alter the
calendar or prices to make this date pass. Retry on a consistent publication; if
persistent, investigate with ESIOS and the official annual calendar before changing
rate or calendar configuration. Never deploy demonstration prices as genuine data.

## DST

The actual 2026-03-29 response has 23 civil-hour ranges, skipping 02-03. The actual
2026-10-25 response has 25 ordinal ranges, 00-01 through 24-25. Both are handled;
normalization distinguishes duplicate 02:00 instants using their UTC offsets.

## Verification boundaries

Automated tests do not contact the network. Live checks are separate. A Chromium smoke test subsequently passed at a repository subpath, checking chart
rendering, detailed components, consumption controls, theme, mobile overflow and
unpublished tomorrow. See `scripts/browser-smoke.mjs` and `docs/preview.png`.
Deployment to [gonzaponte.github.io/vottle](https://gonzaponte.github.io/vottle/)
requires the owner to enable GitHub Pages for [gonzaponte/vottle](https://github.com/gonzaponte/vottle).
No deployment is claimed here.
