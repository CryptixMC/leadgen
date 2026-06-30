{
  description = "Lead Generator dev shell — SvelteKit";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_22
          ];

          shellHook = ''
            if [ -f "$PWD/.env" ]; then
              set -o allexport
              source "$PWD/.env"
              set +o allexport
            fi

            echo ""
            echo "Lead Generator dev shell"
            echo "  node  $(node --version)  /  npm $(npm --version)"
            echo ""
            echo "  Dev server → npm run dev   (http://localhost:5173)"
            echo "  Build      → npm run build"
            echo "  Type-check → npm run check"
            echo ""
          '';
        };
      }
    );
}
