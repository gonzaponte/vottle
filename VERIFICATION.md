# Verification notes

## Live source discrepancy: 2026-11-02

ESIOS archive 70, retrieved during development on 2026-11-02, reports `TEUPCB: "3,29"`
(EUR/MWh) for every interval of Monday 2026-11-02. At 08:00 mainland tariff rules
expect llano, 0.029267 EUR/kWh, rather than valle, 0.003292 EUR/kWh. The Monday
following All Saints is not a non-substitutable fixed-date national tariff holiday.

The original validator blocked the entire `just update` on this discrepancy.
The pipeline now checks that the published aggregate matches a verified annual rate,
then preserves the official PVPC total and aggregate instead of inventing a split.
Affected hours have `period`, `peajes` and `cargos` set to `null`, and retain
`calendar_period`, `calendar_regulated` and `source_regulated`. The daily `warnings`
list records `regulated_calendar_mismatch` and the affected timestamps. Both CLI
and dashboard display a warning; the detailed split control is disabled for that day.
Unknown regulated amounts still abort the update. No holiday override is added.

The national-calendar rule is documented in
[Circular 3/2020, article 7.3](https://www.boe.es/buscar/act.php?id=BOE-A-2020-1066)
and the substituted holiday in the
[2026 official calendar](https://www.boe.es/buscar/doc.php?id=BOE-A-2025-21667).
The source/calendar difference does not by itself establish its underlying cause.
`tests/fixtures/esios-2026-11-02.json` records the official response and provenance
for deterministic regression coverage.

The 2026-11-03 request also returned HTTP 200 with
`{"message": "No values for specified archive"}` before publication. This exact
response is now recognized as unpublished tomorrow; arbitrary messages still fail.

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
