# Copy ALL of this file into the Tencent Cloud server terminal.
# Updated: retry after reload and diagnose local HTTPS vs public route.
# No sync key or password is embedded.
sudo python3 - <<'TCGSHOP_SETUP'
"""Add only the POS location to the existing ledger HTTPS virtual host."""
import datetime
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

DOMAIN = 'pos.example.com'
UPSTREAM = 'http://192.0.2.10:5689'
SITE = Path('/etc/nginx/sites-available/generic-ledger')
SNIPPET = '''    # BEGIN TCGSHOP POS SYNC
    location ^~ /tcgshop/ {
        client_max_body_size 20m;
        proxy_pass http://192.0.2.10:5689/;
        proxy_http_version 1.1;
        proxy_set_header Host $proxy_host;
        proxy_set_header Authorization $http_authorization;
        proxy_set_header If-Match $http_if_match;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_pass_header ETag;
        proxy_cache off;
        proxy_redirect off;
        proxy_connect_timeout 10s;
        proxy_read_timeout 25s;
        proxy_send_timeout 25s;
    }
    # END TCGSHOP POS SYNC
'''


def add_location(source):
    # Ignore comments and quoted braces when matching server blocks.
    pattern = r'''\#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[{};]|[^\s{};\#"']+'''
    tokens = [(m.group(), m.start(), m.end()) for m in re.finditer(pattern, source)
              if not m.group().startswith('#')]
    stack, servers = [], []
    for i, (token, start, end) in enumerate(tokens):
        if token == '{':
            stack.append((i, i > 0 and tokens[i - 1][0] == 'server'))
        elif token == '}':
            if not stack:
                raise ValueError('Unbalanced configuration; no changes made.')
            opening, is_server = stack.pop()
            if is_server:
                servers.append((opening, i))
    if stack:
        raise ValueError('Unbalanced configuration; no changes made.')
    candidates = []
    for opening, closing in servers:
        depth, directive, names, secure = 0, [], [], False
        for token, _, _ in tokens[opening + 1:closing]:
            if token == '{':
                depth += 1
                directive = []
            elif token == '}':
                depth -= 1
                directive = []
            elif depth == 0 and token == ';':
                values = [v.strip('\"\'') for v in directive]
                if values and values[0] == 'server_name':
                    names.extend(values[1:])
                if values and values[0] == 'listen':
                    secure |= 'ssl' in values and any(v == '443' or v.endswith(':443') for v in values[1:])
                directive = []
            elif depth == 0:
                directive.append(token)
        if DOMAIN in names and secure:
            candidates.append((opening, closing))
    if len(candidates) != 1:
        raise ValueError('Expected exactly one existing HTTPS server for ' + DOMAIN + '; no changes made.')
    opening, closing = candidates[0]
    body = source[tokens[opening][2]:tokens[closing][1]]
    if SNIPPET in body:
        return source
    if 'TCGSHOP POS SYNC' in source or any(t.strip('\"\'') in ('/tcgshop', '/tcgshop/') for t, _, _ in tokens):
        raise ValueError('A POS rule already exists but differs; inspect it manually. No changes made.')
    position = tokens[closing][1]
    return source[:position] + '\n' + SNIPPET + source[position:]


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def health(origin, timeout=12):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    try:
        response = opener.open(origin + '/api/health', timeout=timeout)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.status, json.loads(response.read(4096).decode('utf-8'))


def verify_public_route():
    # A successful systemctl reload can return before nginx has new workers.
    last = 'No response'
    for attempt in range(1, 9):
        try:
            status, body = health('https://' + DOMAIN + '/tcgshop', timeout=4)
            if status == 401 and body.get('error') == '同步密钥不正确':
                return
            last = 'HTTP ' + str(status) + '; error=' + str(body.get('error', '(not POS)'))[:120]
        except Exception as error:
            last = type(error).__name__ + ': ' + str(error)[:180]
        print('Waiting for public POS route (' + str(attempt) + '/8): ' + last, flush=True)
        if attempt < 8:
            time.sleep(0.75)
    # Check the same HTTPS hostname directly against this machine, bypassing DNS.
    if shutil.which('curl'):
        result = subprocess.run(['curl', '--noproxy', '*', '--resolve', DOMAIN + ':443:127.0.0.1',
                                 '--connect-timeout', '3', '--max-time', '5', '-sS',
                                 'https://' + DOMAIN + '/tcgshop/api/health'],
                                capture_output=True, text=True)
        try:
            local_error = json.loads(result.stdout).get('error', '(not POS)')
        except Exception:
            local_error = 'No JSON health response (curl exit ' + str(result.returncode) + ')'
        print('This cloud server /tcgshop health error:', str(local_error)[:120], flush=True)
    raise RuntimeError('Public POS route failed after retries: ' + last)


def atomic_write(path, data, stat):
    descriptor, name = tempfile.mkstemp(prefix='.tcgshop-', dir=path.parent)
    try:
        with os.fdopen(descriptor, 'wb') as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        os.chmod(name, stat.st_mode & 0o7777)
        os.chown(name, stat.st_uid, stat.st_gid)
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def main():
    if os.geteuid() != 0:
        raise RuntimeError('Run this on the Tencent Cloud server with sudo python3.')
    for command in ('nginx', 'systemctl'):
        if not shutil.which(command):
            raise RuntimeError('Missing command: ' + command)
    path = SITE.resolve(strict=True)
    enabled = Path('/etc/nginx/sites-enabled/generic-ledger').resolve(strict=True)
    if enabled != path:
        raise RuntimeError('Enabled site differs from the known site; no changes made.')
    subprocess.run(['nginx', '-t'], check=True)
    status, body = health(UPSTREAM)
    if status != 401 or body.get('error') != '同步密钥不正确':
        raise RuntimeError('The NAS POS service was not identified on Tailscale port 5689; no changes made.')
    old_status, old_body = health('https://' + DOMAIN)
    original = path.read_bytes()
    updated = add_location(original.decode('utf-8')).encode('utf-8')
    if updated != original:
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S-%f')
        backup = path.with_name(path.name + '.before-tcgshop-' + stamp)
        shutil.copy2(path, backup)
        print('Configuration backup:', backup, flush=True)
        stat = path.stat()
        atomic_write(path, updated, stat)
        try:
            subprocess.run(['nginx', '-t'], check=True)
            subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
            verify_public_route()
            if health('https://' + DOMAIN) != (old_status, old_body):
                raise RuntimeError('The original ledger health response changed.')
        except Exception:
            atomic_write(path, original, stat)
            subprocess.run(['nginx', '-t'], check=True)
            subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
            print('Original configuration restored. Backup:', backup, flush=True)
            raise
    else:
        verify_public_route()
    print('SUCCESS: HTTPS POS route is ready. App URL: https://' + DOMAIN + '/tcgshop')
    print('Use your existing POS NAS sync key in the app, then test and sync.')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        raise SystemExit('STOP: ' + str(error))

TCGSHOP_SETUP
