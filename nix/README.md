# Chart.js provenance

`chartjs.nix` uses nixpkgs `fetchurl` with a fixed SHA-256 to obtain the original
Chart.js 4.5.1 npm distribution. npm itself is never run. The derivation installs
only the standalone UMD bundle and original MIT license; the dev shell exposes
its store directory through `CHARTJS_ASSETS`. `just build` copies both into the
same-origin output. No CDN is contacted by the browser, and generated vendor
assets are not committed. nixpkgs itself is pinned by the repository flake.lock.

Source: https://registry.npmjs.org/chart.js/-/chart.js-4.5.1.tgz
Upstream: https://github.com/chartjs/Chart.js/releases/tag/v4.5.1
License: MIT, Chart.js Contributors (see installed CHART-LICENSE.md).

The locked nixpkgs has no standalone Chart.js package used here; this small
`stdenvNoCC` derivation uses nixpkgs infrastructure. Updating requires changing
the version/URL and verified hash, rebuilding, and checking the chart locally.
