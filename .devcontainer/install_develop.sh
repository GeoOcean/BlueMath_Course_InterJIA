#!/bin/bash
# postCreateCommand: install bluemath-tk in development (editable) mode.
# Clones BlueMath_tk next to this repo in /workspaces and installs it with
# `pip install -e`, replacing the pinned bluemath-tk from environment.yml.
set -euo pipefail

REPO_URL=https://github.com/GeoOcean/BlueMath_tk.git
TARGET=/workspaces/BlueMath_tk

git config --global --add safe.directory "$TARGET"

# /workspaces is created by Docker as root: make it writable for vscode
if [ ! -w /workspaces ]; then
    sudo chown "$(id -u):$(id -g)" /workspaces
fi

if [ -d "$TARGET/.git" ]; then
    echo "BlueMath_tk already cloned in $TARGET, skipping clone"
else
    echo "Cloning BlueMath_tk into $TARGET..."
    git clone "$REPO_URL" "$TARGET"
fi

echo "Installing bluemath-tk in development mode..."
# --no-deps: keep the versions pinned in environment.yml (numpy, xarray, ...)
pip install --no-deps -e "$TARGET"

python -c "import bluemath_tk; print('bluemath_tk from', bluemath_tk.__file__)"