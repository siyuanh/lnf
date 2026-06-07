#!/usr/bin/env bash
#
# Build amd64 Docker images for the api + web and bundle them into a single
# tarball ready to scp to the NAS. Usage:
#
#   ./scripts/build-and-bundle.sh [tag]
#
# Tag defaults to the short git SHA. Output lands at dist/lnf-images-<tag>.tar.

set -euo pipefail

TAG="${1:-$(git rev-parse --short HEAD)}"
OUT="dist/lnf-images-${TAG}.tar"
mkdir -p dist

echo "Building lnf-api:${TAG}..."
docker buildx build --platform linux/amd64 -t "lnf-api:${TAG}" -f apps/api/Dockerfile --load .

echo "Building lnf-web:${TAG}..."
docker buildx build --platform linux/amd64 -t "lnf-web:${TAG}" -f apps/web/Dockerfile --load .

echo "Saving to ${OUT}..."
docker save "lnf-api:${TAG}" "lnf-web:${TAG}" -o "${OUT}"

echo
echo "Done. Ship to the NAS:"
echo "  scp ${OUT} docker-compose.prod.yml admin@nas:/volume1/docker/lnf/"
echo "  ssh admin@nas 'cd /volume1/docker/lnf && sudo docker load -i ${OUT##*/}'"
echo "  ssh admin@nas 'cd /volume1/docker/lnf && sudo docker compose -f docker-compose.prod.yml --env-file .env.prod up -d'"
