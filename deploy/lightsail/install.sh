#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/bek_avtotest}"
APP_USER="${APP_USER:-ubuntu}"
ENV_FILE="/etc/bek-avtotest.env"

if [ "$(id -u)" -eq 0 ]; then
  echo "Run this script as the ubuntu user, not root."
  exit 1
fi

if [ ! -f "$APP_DIR/requirements.txt" ]; then
  echo "App not found at $APP_DIR."
  echo "Clone the repository first, for example:"
  echo "  sudo mkdir -p $APP_DIR && sudo chown $APP_USER:$APP_USER $APP_DIR"
  echo "  git clone YOUR_GITHUB_REPO_URL $APP_DIR"
  exit 1
fi

sudo apt-get update
sudo apt-get install -y python3 python3-venv python3-pip git nginx postgresql-client

cd "$APP_DIR"
python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

if [ ! -f "$ENV_FILE" ]; then
  sudo cp deploy/lightsail/bek-avtotest.env.example "$ENV_FILE"
  sudo chmod 600 "$ENV_FILE"
  sudo chown root:root "$ENV_FILE"
  echo
  echo "Created $ENV_FILE."
  echo "Edit it with your real DATABASE_URL and ADMIN_PASSWORD, then run this script again:"
  echo "  sudo nano $ENV_FILE"
  echo "  bash deploy/lightsail/install.sh"
  exit 0
fi

sudo cp deploy/lightsail/bek-avtotest.service /etc/systemd/system/bek-avtotest.service
sudo cp deploy/lightsail/nginx-bek-avtotest.conf /etc/nginx/sites-available/bek-avtotest
sudo ln -sfn /etc/nginx/sites-available/bek-avtotest /etc/nginx/sites-enabled/bek-avtotest
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t

sudo systemctl daemon-reload
sudo systemctl enable bek-avtotest
sudo systemctl restart bek-avtotest
sudo systemctl reload nginx

echo
echo "bek_avtotest deployed."
echo "Check logs with:"
echo "  sudo journalctl -u bek-avtotest -f"
