"""Add a dedicated HTTPS POS host, retaining the old gateway and NAS data."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit

DOMAIN = 'pos.example.com'
OLD_ORIGIN = 'https://legacy.example.com/tcgshop'
UPSTREAM = 'http://192.0.2.11:5689'
SITE = Path('/etc/nginx/sites-available/tcgshop-pos-' + DOMAIN)
ENABLED = Path('/etc/nginx/sites-enabled/tcgshop-pos-' + DOMAIN)
WEBROOT = Path('/var/lib/letsencrypt')
HOOK = Path('/etc/letsencrypt/renewal-hooks/deploy/tcgshop-pos-reload')
MARKER = '# Managed TCGshop POS host: ' + DOMAIN + '\n'
HOOK_TEXT = '#!/bin/sh\n# TCGshop POS certificate reload\nnginx -t && systemctl reload nginx\n'


def configuration(secure):
    challenge = '    location ^~ /.well-known/acme-challenge/ {\n        root ' + str(WEBROOT) + ';\n        default_type text/plain;\n    }\n'
    source = MARKER + 'server {\n    listen 80;\n    server_name ' + DOMAIN + ';\n' + challenge
    source += '    location / { return 301 https://' + DOMAIN + '$request_uri; }\n}\n' if secure else '    location / { return 503; }\n}\n'
    if secure:
        source += '''server {
    listen 443 ssl;
    server_name DOMAIN;
    ssl_certificate /etc/letsencrypt/live/DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/DOMAIN/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    location = / { return 302 /tcgshop/; }
    location = /tcgshop { return 308 /tcgshop/; }
    location ^~ /tcgshop/ {
        client_max_body_size 20m;
        proxy_pass UPSTREAM/;
        proxy_http_version 1.1;
        proxy_set_header Host $proxy_host;
        proxy_set_header Authorization $http_authorization;
        proxy_set_header If-Match $http_if_match;
        proxy_set_header If-None-Match $http_if_none_match;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_pass_header ETag;
        proxy_cache off;
        proxy_redirect off;
        proxy_connect_timeout 10s;
        proxy_read_timeout 25s;
        proxy_send_timeout 25s;
    }
    location / { return 404; }
}
'''.replace('DOMAIN', DOMAIN).replace('UPSTREAM', UPSTREAM)
    return source


def guard_owned_files():
    if SITE.is_symlink():
        raise RuntimeError('The target site is a symlink; inspect before migrating.')
    if SITE.exists() and SITE.read_text() not in (configuration(False), configuration(True)):
        raise RuntimeError('Target site contains custom configuration; no changes made.')
    if ENABLED.is_symlink():
        if ENABLED.resolve() != SITE.resolve():
            raise RuntimeError('The enabled site points elsewhere; no changes made.')
    elif ENABLED.exists():
        raise RuntimeError('The enabled site is not the expected symlink; no changes made.')
    if HOOK.is_symlink() or (HOOK.exists() and HOOK.read_text() != HOOK_TEXT):
        raise RuntimeError('Certificate hook contains other configuration; no changes made.')


def guard_domain_collision(dump):
    for part in re.split(r'^# configuration file ', dump, flags=re.M)[1:]:
        header, _, body = part.partition(':\n')
        body = re.sub(r'#[^\n]*', '', body)
        for names in re.findall(r'\bserver_name\s+([^;]+);', body):
            if DOMAIN in [n.strip('"\'') for n in names.split()] and Path(header).resolve() != SITE.resolve():
                raise RuntimeError('New domain is already configured in ' + header + '; inspect it first.')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def check_domain_access():
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    try:
        response = opener.open('http://' + DOMAIN + '/.well-known/acme-challenge/pos-migration-check', timeout=8)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        target = urlsplit(response.headers.get('Location', ''))
        if target.hostname == 'dnspod.qcloud.com' and target.path == '/static/webblock.html':
            raise RuntimeError('Tencent Cloud ICP/domain access block detected. Complete domain filing first; no changes made.')


def fetch(origin, endpoint):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    request = urllib.request.Request(origin + endpoint, headers={'Cache-Control': 'no-cache'})
    try:
        response = opener.open(request, timeout=8)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        raw = response.read(65537)
        if len(raw) > 65536:
            raise RuntimeError('Unexpected oversized service response.')
        return response.status, json.loads(raw.decode('utf-8'))


def verify_routes():
    old = fetch(OLD_ORIGIN, '/api/update')
    upstream = fetch(UPSTREAM, '/api/update')
    new = fetch('https://' + DOMAIN + '/tcgshop', '/api/update')
    health = fetch('https://' + DOMAIN + '/tcgshop', '/api/health')
    if old != upstream or new != upstream or new[0] != 200 or new[1].get('packageName') != 'com.tcgshop.pos':
        raise RuntimeError('Old/new public update routes do not match the NAS release.')
    if health != (401, {'error': '同步密钥不正确'}):
        raise RuntimeError('The new sync route is not the protected POS service.')


def write_site(text):
    fd, name = tempfile.mkstemp(prefix='.tcgshop-domain-', dir=SITE.parent)
    try:
        with os.fdopen(fd, 'w') as stream:
            stream.write(text)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(name, 0o644)
        os.replace(name, SITE)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def reload_nginx():
    subprocess.run(['nginx', '-t'], check=True)
    subprocess.run(['systemctl', 'reload', 'nginx'], check=True)


def main():
    if os.geteuid() != 0:
        raise RuntimeError('Run with sudo python3 on the original cloud server.')
    for name in ('nginx', 'systemctl', 'certbot'):
        if not shutil.which(name):
            raise RuntimeError('Missing ' + name + '. Install nginx/certbot before running.')
    guard_owned_files()
    check_domain_access()
    dump = subprocess.run(['nginx', '-T'], check=True, capture_output=True, text=True)
    guard_domain_collision(dump.stdout)
    if fetch(UPSTREAM, '/api/health') != (401, {'error': '同步密钥不正确'}):
        raise RuntimeError('NAS POS service is unavailable; no changes made.')
    old_release = fetch(OLD_ORIGIN, '/api/update')
    if old_release[0] != 200 or old_release[1].get('packageName') != 'com.tcgshop.pos':
        raise RuntimeError('Existing update service could not be identified; no changes made.')
    original = SITE.read_text() if SITE.exists() else None
    was_enabled = ENABLED.is_symlink()
    try:
        (WEBROOT / '.well-known/acme-challenge').mkdir(parents=True, exist_ok=True)
        if original != configuration(True):
            write_site(configuration(False))
        if not was_enabled:
            ENABLED.symlink_to(SITE)
        reload_nginx()
        # Webroot issuance only; Certbot must not rewrite existing virtual hosts.
        subprocess.run(['certbot', 'certonly', '--webroot', '-w', str(WEBROOT),
                        '--cert-name', DOMAIN, '-d', DOMAIN, '--keep-until-expiring'], check=True)
        write_site(configuration(True))
        reload_nginx()
        for attempt in range(8):
            try:
                verify_routes()
                break
            except Exception:
                if attempt == 7:
                    raise
                time.sleep(1)
        HOOK.parent.mkdir(parents=True, exist_ok=True)
        HOOK.write_text(HOOK_TEXT)
        HOOK.chmod(0o755)
    except Exception:
        if not was_enabled:
            ENABLED.unlink(missing_ok=True)
        if original is None:
            SITE.unlink(missing_ok=True)
        else:
            write_site(original)
        reload_nginx()
        print('Migration failed; the previous Nginx configuration was restored.', flush=True)
        raise
    print('SUCCESS: https://' + DOMAIN + '/tcgshop', flush=True)
    print('Both domains serve the same NAS. Existing data and sync tokens are retained.', flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        raise SystemExit('STOP: ' + str(error))
