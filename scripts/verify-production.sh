#!/usr/bin/env bash
# Build and verify the standalone deployment without modifying factory records.
set -euo pipefail
cd "$(dirname "$0")/.."
compose=(docker compose --env-file "${1:-.env.production}" -f compose.production.yaml)
"${compose[@]}" config --quiet
"${compose[@]}" up --build -d --wait --wait-timeout 180
"${compose[@]}" exec -T web sh -ec 'test "$(id -u)" -ne 0; wget -q -O - http://127.0.0.1:8080/ready'
"${compose[@]}" exec -T api .venv/bin/python - <<'PY'
import json
import os
import re
import urllib.error
import urllib.request

origin = 'http://web:8080'
assert os.getuid() != 0
with urllib.request.urlopen(origin + '/health', timeout=10) as r:
    health = json.load(r)
assert health['status'] == 'ok' and health['demo'] is False and health['stream'] is False
with urllib.request.urlopen(origin, timeout=10) as r:
    html = r.read().decode()
    assert 'no-cache' in r.headers['Cache-Control']
for name, mime in [('favicon.svg', 'image/svg+xml'), ('favicon.ico', 'image/x-icon'), ('apple-touch-icon.png', 'image/png')]:
    with urllib.request.urlopen(origin + '/' + name, timeout=10) as r:
        assert r.status == 200 and mime in r.headers['Content-Type'], name
        assert len(r.read()) > 100
asset = re.search(r'src="(\./assets/[^\"]+\.js)"', html)
assert asset, 'Missing compiled JavaScript'
with urllib.request.urlopen(origin + '/' + asset[1].removeprefix('./'), timeout=10) as r:
    assert 'max-age=31536000' in r.headers['Cache-Control']
try:
    urllib.request.urlopen(origin + '/assets/missing-deployment-check.js', timeout=10)
    raise AssertionError('Missing static assets must return 404')
except urllib.error.HTTPError as error:
    assert error.code == 404
request = urllib.request.Request(origin + '/api/auth/login', data=json.dumps({'email': os.environ['ADMIN_EMAIL'], 'password': os.environ['ADMIN_PASSWORD']}).encode(), headers={'Content-Type': 'application/json'})
with urllib.request.urlopen(request, timeout=10) as r:
    token = json.load(r)['access_token']
headers = {'Authorization': 'Bearer ' + token}
try:
    with urllib.request.urlopen(urllib.request.Request(origin + '/api/overview', headers=headers), timeout=10) as r:
        assert r.status == 200
finally:
    with urllib.request.urlopen(urllib.request.Request(origin + '/api/auth/logout', data=b'{}', headers={**headers, 'Content-Type': 'application/json'}), timeout=10) as r:
        assert r.status == 200
print('PASS: non-root web/API, database readiness, demo disabled, favicon formats, cache/404, proxy and administrator login/logout.')
PY
for service in api web; do
  readonly=$(docker inspect --format '{{.HostConfig.ReadonlyRootfs}}' "$("${compose[@]}" ps -q "$service")")
  test "$readonly" = true
done
printf '%s\n' 'PASS: API and web containers use read-only root filesystems. Deployment is running.'
