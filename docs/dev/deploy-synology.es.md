# Despliegue de LNF en un NAS Synology (x86_64)

## Supuestos
- DSM 7.2+ con Container Manager instalado
- Un dominio registrado o un handle DDNS `*.synology.me`
- Registros DNS A: `api.<raíz>` y `app.<raíz>` → IP pública del NAS
- Acceso SSH al NAS como usuario del grupo `administrators`
- Reenvío del puerto 443 del router → NAS:443

## Configuración inicial

### 1. Preparar directorios

Conéctate por SSH al NAS:

```bash
sudo mkdir -p /volume1/docker/lnf/{db-data,images}
sudo chown -R $(whoami) /volume1/docker/lnf
```

### 2. Emitir el certificado TLS

DSM → Panel de control → Seguridad → Certificado → Agregar → Obtener certificado de Let's Encrypt.

Dominio: `app.<raíz>`. SAN: `api.<raíz>`. Email: el tuyo.

### 3. Configurar las entradas del proxy inverso

DSM → Portal de inicio de sesión → Avanzado → Proxy inverso → Crear:

**Entrada 1 — web:**
- Origen: HTTPS, `app.<raíz>`, puerto 443, basado en hostname.
- Destino: HTTP, `localhost`, puerto 3000.
- Cabeceras personalizadas (Avanzado): WebSocket habilitado.

**Entrada 2 — api:**
- Origen: HTTPS, `api.<raíz>`, puerto 443.
- Destino: HTTP, `localhost`, puerto 3001.
- Cabeceras personalizadas (Avanzado): WebSocket habilitado.

Asocia ambas entradas al certificado del paso 2 (pestaña Cert en el mismo diálogo).

### 4. Abrir el firewall

DSM → Panel de control → Seguridad → Firewall → permite TCP 443 desde cualquier origen (o tus rangos confiables).

## Primer despliegue

### 1. Desde tu laptop

```bash
./scripts/build-and-bundle.sh 0.1.0
scp dist/lnf-images-0.1.0.tar admin@nas:/volume1/docker/lnf/images/
scp docker-compose.prod.yml admin@nas:/volume1/docker/lnf/
scp .env.prod.example admin@nas:/volume1/docker/lnf/.env.prod
```

### 2. En el NAS

```bash
cd /volume1/docker/lnf
sudo docker load -i images/lnf-images-0.1.0.tar

# Generar secretos
{
  echo "POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '\n=')"
  echo "BETTER_AUTH_SECRET=$(openssl rand -base64 32 | tr -d '\n=')"
  echo "PARTNER_API_KEY_PEPPER=$(openssl rand -base64 32 | tr -d '\n=')"
} >> .env.prod
chmod 600 .env.prod
```

Edita `.env.prod` y define:
- `IMAGE_TAG=0.1.0`
- `BETTER_AUTH_URL=https://api.<raíz>`
- `WEB_ORIGIN=https://app.<raíz>`
- `COOKIE_DOMAIN=.<raíz>`
- `POSTGRES_USER=lnf`
- `POSTGRES_DB=lnf_prod`
- `DB_DATA_DIR=/volume1/docker/lnf/db-data`

### 3. Aplicar migraciones y arrancar

```bash
sudo docker compose -f docker-compose.prod.yml --env-file .env.prod up -d db
sudo docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm api tsx src/db/migrate.ts
sudo docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
sudo docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f
```

### 4. Sembrar el primer partner

```bash
sudo docker compose -f docker-compose.prod.yml --env-file .env.prod exec api tsx scripts/seed-partner.ts
```

Esto crea el partner "Acme" con el usuario admin `ops@acme.test` y contraseña `correct-horse-battery-staple`. **Cambia la contraseña inmediatamente** mediante el flujo de password-reset de Better-Auth antes de abrir el portal.

### 5. Verificar

```bash
curl -I https://api.<raíz>/healthz
# Esperado: HTTP/2 200, content-type: application/json
```

Abre `https://app.<raíz>/partner/login` en un navegador. Inicia sesión con las credenciales sembradas.

## Actualizar a una nueva versión

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

## Reversión

```bash
sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=0.1.0/' .env.prod
sudo docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

Nota: revertir a través de una migración que elimine una columna fallará. Agrega un rollback específico antes de bajar la versión.

## Respaldos

DSM → Hyper Backup → programa una tarea sobre `/volume1/docker/lnf/db-data`.

O un `pg_dump` nocturno:

```bash
sudo docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T db \
  pg_dump -U lnf lnf_prod | gzip > /volume1/docker/lnf/backups/$(date +%F).sql.gz
```
