{
  stdenvNoCC,
  fetchurl,
  lib,
}:
stdenvNoCC.mkDerivation {
  pname = "vottle-chartjs";
  version = "4.5.1";
  src = fetchurl {
    url = "https://registry.npmjs.org/chart.js/-/chart.js-4.5.1.tgz";
    hash = "sha256-9UDZhGhFesegqrsyAG37BmKX4JbF6gY6XYCqlz0cM3o=";
  };
  sourceRoot = "package";
  dontBuild = true;
  installPhase = ''
    mkdir -p $out
    cp dist/chart.umd.min.js $out/chart.umd.js
    cp LICENSE.md $out/CHART-LICENSE.md
  '';
  meta.license = lib.licenses.mit;
}
