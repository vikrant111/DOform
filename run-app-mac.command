#!/bin/bash
# CVP Requisition - double-click to start on macOS (development copy).
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Get the LTS version from https://nodejs.org and run this again."
  read -r -p "Press Enter to close..."
  exit 1
fi

if [ ! -f .env ]; then
  echo "First run: creating .env from .env.example"
  cp .env.example .env
fi

if [ ! -d node_modules ]; then
  echo "First run: installing dependencies, this takes a minute..."
  npm install || { read -r -p "Press Enter to close..."; exit 1; }
fi

npm start
