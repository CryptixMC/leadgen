{
  description = "Lead Generator dev shell — FastAPI backend + SvelteKit frontend";

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
            # Python toolchain
            python311
            uv

            # Node.js toolchain
            nodejs_22

            # Native build deps some Python packages may need
            gcc
            pkg-config
            libffi
            openssl
          ];

          shellHook = ''
            # ── Python venv ─────────────────────────────────────────────────
            VENV_DIR="$PWD/backend/.venv"

            if [ ! -d "$VENV_DIR" ]; then
              echo "[flake] creating backend Python venv..."
              uv venv "$VENV_DIR" --python python3.11
            fi

            source "$VENV_DIR/bin/activate"

            # Reinstall deps if requirements.txt is newer than the sentinel
            SENTINEL="$VENV_DIR/.deps-installed"
            if [ ! -f "$SENTINEL" ] || [ "$PWD/backend/requirements.txt" -nt "$SENTINEL" ]; then
              echo "[flake] installing/syncing Python deps..."
              uv pip install -r "$PWD/backend/requirements.txt"
              touch "$SENTINEL"
            fi

            export PYTHONPATH="$PWD/backend:$PYTHONPATH"

            # ── dotenv ──────────────────────────────────────────────────────
            if [ -f "$PWD/backend/.env" ]; then
              set -o allexport
              source "$PWD/backend/.env"
              set +o allexport
            fi

            # ── Info ────────────────────────────────────────────────────────
            echo ""
            echo "Lead Generator dev shell"
            echo "  python  $(python --version)"
            echo "  node    $(node --version)  /  npm $(npm --version)"
            echo ""
            echo "  Backend  → cd backend  && uvicorn main:app --reload --port 8000"
            echo "  Frontend → cd frontend && npm install && npm run dev"
            echo "  Scripts  → cd scripts  && python scrape_batch.py --category '...' --city '...'"
            echo ""
          '';
        };
      }
    );
}
