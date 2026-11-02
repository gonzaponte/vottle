{
  description = "vottle development environment";
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      each = nixpkgs.lib.genAttrs systems;
    in
    {
      devShells = each (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
        in
        {
          default = pkgs.mkShell {
            CHARTJS_ASSETS = pkgs.callPackage ./nix/chartjs.nix { };
            packages = with pkgs; [
              python3
              nodejs
              just
              git
              ruff
              nixfmt
              shfmt
              actionlint
            ];
          };
        }
      );
    };
}
