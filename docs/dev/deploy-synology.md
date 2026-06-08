# Deploying LNF to a Synology NAS (x86_64)

## Assumptions
- DSM 7.2+ with Container Manager installed
- A registered domain or `*.synology.me` DDNS handle
- DNS A records: `api.<root>` and `app.<root>` → NAS public IP
- SSH access to the NAS as a user in the `administrators` group
- Router port 443 → NAS:443

## One-time setup

### 1. Prepare directories

SSH to the NAS, then:

```bash
sudo mkdir -p /volume1/docker/lnf/{db-data,images}
sudo chown -R $(whoami) /volume1/docker/lnf
```

### 2. Issue the TLS certificate

DSM → Control Panel → Security → Certificate → Add → Get a certificate from Let's Encrypt.

Domain: `app.<root>`. SAN: `api.<root>`. Email: yours.

### 3. Configure reverse proxy entries

DSM → Login Portal → Advanced → Reverse Proxy → Create:

**Entry 1 — web:**
- Source: HTTPS, `app.<root>`, port 443, hostname-based.
- Destination: HTTP, `localhost`, port 3000.
- Custom headers (Advanced): WebSocket enabled.

**Entry 2 — api:**
- Source: HTTPS, `api.<root>`, port 443.
- Destination: HTTP, `localhost`, port 3001.
- Custom headers (Advanced): WebSocket enabled.

Bind both entries to the cert from step 2 (Cert tab in the same dialog).

### 4. Open firewall

DSM → Control Panel → Security → Firewall → allow TCP 443 from anywhere (or your trusted ranges).

## First deploy

### 1. From your laptop

```bash
./scripts/build-and-bundle.sh 0.1.0
scp dist/lnf-images-0.1.0.tar admin@nas:/volume1/docker/lnf/images/
scp docker-compose.prod.yml admin@nas:/volume1/docker/lnf/
scp .env.prod.example admin@nas:/volume1/docker/lnf/.env.prod
```

### 2. On the NAS

```bash
cd /volume1/docker/lnf
sudo docker load -i images/lnf-images-0.1.0.tar

# Generate secrets
{
  echo "POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '\n=')"
  echo "BETTER_AUTH_SECRET=$(openssl rand -base64 32 | tr -d '\n=')"
  echo "PARTNER_API_KEY_PEPPER=$(openssl rand -base64 32 | tr -d '\n=')"
} >> .env.prod
chmod 600 .env.prod
```

Edit `.env.prod` and set:
- `IMAGE_TAG=0.1.0`
- `BETTER_AUTH_URL=https://api.<root>`
- `WEB_ORIGIN=https://app.<root>`
- `COOKIE_DOMAIN=.<root>`
- `POSTGRES_USER=lnf`
- `POSTGRES_DB=lnf_prod`
- `DB_DATA_DIR=/volume1/docker/lnf/db-data`

### 3. Apply migrations + start

```bash
sudo docker compose -f docker-compose.prod.yml --env-file .env.prod up -d db
sudo docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm api tsx src/db/migrate.ts
sudo docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
sudo docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f
```

### 4. Seed your first partner

```bash
sudo docker compose -f docker-compose.prod.yml --env-file .env.prod exec api tsx scripts/seed-partner.ts
```

This creates partner "Acme" with admin user `ops@acme.test` and password `correct-horse-battery-staple`. **Change the password immediately** via Better-Auth's password-reset flow before opening the portal to anyone.

### 5. Verify

```bash
curl -I https://api.<root>/healthz
# Expect: HTTP/2 200, content-type: application/json
```

Open `https://app.<root>/partner/login` in a browser. Sign in with the seeded credentials.

## Updating to a new version

```bash
# laptop
./scripts/build-and-bundle.sh 0.2.0
scp dist/lnf-images-0.2.0.tar admin@nas:/volume1/docker/lnf/images/

# NAS
cd /volume1/docker/lnf
sudo docker load -i images/lnf-images-0.2.0.tar
sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=0.2.0/' .env.prod
sudo docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm api tsx src/db/migrate.ts
sudo docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

## Rollback

```bash
sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=0.1.0/' .env.prod
sudo docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

Note: rolling back across a migration that drops a column will fail. Add a migration-specific rollback before bumping back.

## Backups

DSM → Hyper Backup → schedule a job over `/volume1/docker/lnf/db-data`.

Or nightly `pg_dump`:

```bash
sudo docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T db \
  pg_dump -U lnf lnf_prod | gzip > /volume1/docker/lnf/backups/$(date +%F).sql.gz
```
