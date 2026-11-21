#!/bin/sh
# Puts the backup job's secrets into the private repo MDNoDX/nodinest-backups,
# read from .env.netlify (never printed). Run once from the repo folder:
#   sh scripts/backup-secrets.sh
set -eu
R=MDNoDX/nodinest-backups
val() { grep -E "^$1=" .env.netlify | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//'; }
val EU_DATABASE_URL_UNPOOLED | gh secret set DATABASE_URL --repo "$R"
val BACKUP_PASSPHRASE | gh secret set BACKUP_PASSPHRASE --repo "$R"
val CRON_SECRET | gh secret set CRON_SECRET --repo "$R"
printf 'https://nodinest.netlify.app' | gh secret set SITE_URL --repo "$R"
gh secret list --repo "$R"
gh workflow run backup --repo "$R" && echo "First backup started: https://github.com/$R/actions"
