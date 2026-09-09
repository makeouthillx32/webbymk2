#!/usr/bin/env bash
# scripts/wsl-unaxis-setup.sh
# -----------------------------------------------------------------------------
# Provisions and syncs the UNAXIS control plane environment inside WSL2 (Ubuntu).
# Run inside WSL2: bash /mnt/z/WEBSITES/webbymk2/scripts/wsl-unaxis-setup.sh
# -----------------------------------------------------------------------------
set -e

PROJECT_DIR="/mnt/z/WEBSITES/webbymk2"
WIN_APPDATA="/mnt/c/Users/skill/AppData/Roaming/unaxis"
WIN_PROFILE="/mnt/c/Users/skill/.unaxis"

echo "==> Setting up directories in ext4..."
mkdir -p "$HOME/.config/unaxis/unenter"
mkdir -p "$HOME/.unaxis/unenter/stacks/agent"

# 1. Sync control.db if not present or stale
if [ -f "$WIN_APPDATA/control.db" ]; then
  if [ ! -f "$HOME/.config/unaxis/control.db" ] || [ "$WIN_APPDATA/control.db" -nt "$HOME/.config/unaxis/control.db" ]; then
    echo "==> Syncing control.db from Windows AppData to ext4..."
    cp "$WIN_APPDATA/control.db" "$HOME/.config/unaxis/control.db"
  fi
fi

# 2. Sync config.json
if [ -f "$WIN_APPDATA/unenter/config.json" ]; then
  echo "==> Syncing config.json to ext4..."
  cp "$WIN_APPDATA/unenter/config.json" "$HOME/.config/unaxis/unenter/config.json"
  cp "$WIN_APPDATA/unenter/config.json" "$HOME/.unaxis/unenter/config.json"
fi

# 3. Sync ECDSA pairing key for L0V3 and remote agents
if [ -f "$WIN_APPDATA/unenter/stacks/agent/tui-keypair.json" ]; then
  echo "==> Syncing ECDSA pairing key (tui-keypair.json)..."
  cp "$WIN_APPDATA/unenter/stacks/agent/tui-keypair.json" "$HOME/.unaxis/unenter/stacks/agent/tui-keypair.json"
fi

# 4. Sync settings and credentials
if [ -d "$WIN_PROFILE" ]; then
  echo "==> Syncing settings and credentials..."
  [ -f "$WIN_PROFILE/settings.json" ] && cp "$WIN_PROFILE/settings.json" "$HOME/.unaxis/"
  [ -f "$WIN_PROFILE/.credentials.json" ] && cp "$WIN_PROFILE/.credentials.json" "$HOME/.unaxis/"
fi

# 5. Verify Bun
if ! command -v bun &>/dev/null; then
  echo "==> Installing Bun..."
  curl -fsSL https://bun.sh/install | bash
  sudo cp "$HOME/.bun/bin/bun" /usr/local/bin/bun
fi

# 6. Verify Docker CLI wrapper
if [ ! -f /usr/local/bin/docker ]; then
  echo "==> Installing Docker CLI wrapper..."
  sudo cp "$PROJECT_DIR/scratch/docker_wrapper.sh" /usr/local/bin/docker
  sudo chmod +x /usr/local/bin/docker
fi

# 7. Verify global unaxis CLI wrapper
if [ ! -f /usr/local/bin/unaxis ]; then
  echo "==> Installing global unaxis CLI launcher..."
  sudo tee /usr/local/bin/unaxis > /dev/null << 'EOF'
#!/bin/bash
export UNAXIS_PROJECT_ROOT="/mnt/z/WEBSITES/webbymk2"
export PROJECT_ROOT="/mnt/z/WEBSITES/webbymk2"
exec /usr/local/bin/bun /mnt/z/WEBSITES/webbymk2/src/ink/dist/cli.js "$@"
EOF
  sudo chmod +x /usr/local/bin/unaxis
fi

echo ""
echo "✓ UNAXIS WSL2 Environment ready!"
echo "  Run 'unaxis' from any directory in WSL2 to use the CLI."
echo "  To launch interactive TUI: cd $PROJECT_DIR && bun run tui:dev"
