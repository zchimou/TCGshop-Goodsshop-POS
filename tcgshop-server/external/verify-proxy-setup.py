"""Offline checks; do not access or modify the actual cloud server."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
import tempfile
import subprocess
import contextlib
import io

spec = importlib.util.spec_from_file_location('setup_proxy', Path(__file__).with_name('setup-proxy.py'))
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)
HTTP = '''server {
 listen 80;
 server_name pos.example.com;
 location / { return 301 https://$host$request_uri; }
}
'''
HTTPS = '''server {
 listen 443 ssl;
 server_name pos.example.com;
 ssl_certificate /etc/letsencrypt/live/pos.example.com/fullchain.pem;
 ssl_certificate_key /etc/letsencrypt/live/pos.example.com/privkey.pem;
 client_max_body_size 2m;
 # brace in a comment } {
 location / { proxy_pass http://192.0.2.10:5688; }
 location /quoted { add_header Example "{quoted}"; }
}
'''


class Tests(unittest.TestCase):
    def test_only_append_and_idempotent(self):
        source = HTTP + HTTPS
        changed = setup.add_location(source)
        self.assertEqual(changed.replace('\n' + setup.SNIPPET, '', 1), source)
        self.assertTrue(changed.startswith(HTTP))
        self.assertEqual(setup.add_location(changed), changed)
        self.assertEqual(changed.count('proxy_pass http://192.0.2.10:5689/;'), 1)

    def test_reject_unknown_or_ambiguous_site(self):
        for source in (HTTP, HTTPS + HTTPS, HTTPS.replace('pos.example.com', 'other.invalid'), HTTPS[:-2]):
            with self.subTest(source=source), self.assertRaises(ValueError):
                setup.add_location(source)

    def test_reject_conflicting_pos(self):
        source = HTTPS.replace('location /quoted', 'location /tcgshop/')
        with self.assertRaises(ValueError):
            setup.add_location(source)

    def test_ipv6_and_quoted_domain(self):
        source = HTTPS.replace('443 ssl', '[::]:443 ssl').replace('server_name pos.example.com;', 'server_name "pos.example.com";')
        self.assertIn(setup.SNIPPET, setup.add_location(source))

    def simulate_apply(self, failure):
        with tempfile.TemporaryDirectory(prefix='verify-config-', dir=Path(__file__).resolve().parent) as directory:
            site = Path(directory) / 'generic-ledger'
            site.write_text(HTTP + HTTPS, encoding='utf-8')
            original = site.read_bytes()
            calls = []

            def run(command, **kwargs):
                calls.append(command)
                if failure == 'syntax' and len(calls) == 2:
                    raise subprocess.CalledProcessError(1, command)
                return subprocess.CompletedProcess(command, 0, stdout='{"error":"同步密钥不正确"}')

            public = (401, {'error': 'Unauthorized' if failure == 'route' else '同步密钥不正确'})
            responses = [(401, {'error': '同步密钥不正确'}), (401, {'error': 'Unauthorized'}), public, (401, {'error': 'Unauthorized'})]
            def respond(*args, **kwargs):
                return responses.pop(0) if len(responses) > 1 else responses[0]
            real_path = Path
            with patch.object(setup, 'SITE', site), \
                    patch.object(setup, 'Path', side_effect=lambda value: site if str(value) == '/etc/nginx/sites-enabled/generic-ledger' else real_path(value)), \
                    patch.object(setup.os, 'geteuid', return_value=0, create=True), \
                    patch.object(setup.os, 'chown', create=True), \
                    patch.object(setup.shutil, 'which', return_value='/test/command'), \
                    patch.object(setup.subprocess, 'run', side_effect=run), \
                    patch.object(setup, 'health', side_effect=respond), \
                    patch.object(setup.time, 'sleep'), contextlib.redirect_stdout(io.StringIO()):
                if failure:
                    with self.assertRaises(Exception):
                        setup.main()
                    self.assertEqual(site.read_bytes(), original)
                else:
                    setup.main()
                    self.assertIn(setup.SNIPPET, site.read_text(encoding='utf-8'))
            backups = list(Path(directory).glob('*.before-tcgshop-*'))
            self.assertEqual(len(backups), 1)
            self.assertEqual(backups[0].read_bytes(), original)
            self.assertEqual(calls[-1], ['systemctl', 'reload', 'nginx'])

    def test_apply_success(self):
        self.simulate_apply(None)

    def test_restore_on_syntax_failure(self):
        self.simulate_apply('syntax')

    def test_restore_on_wrong_public_service(self):
        self.simulate_apply('route')

    def test_reload_delay_then_ready(self):
        responses = [(401, {'error': 'Unauthorized'}), (401, {'error': 'Unauthorized'}), (401, {'error': '同步密钥不正确'})]
        with patch.object(setup, 'health', side_effect=responses) as health, \
                patch.object(setup.time, 'sleep') as sleep, contextlib.redirect_stdout(io.StringIO()):
            setup.verify_public_route()
        self.assertEqual(health.call_count, 3)
        self.assertEqual(sleep.call_count, 2)


if __name__ == '__main__':
    unittest.main()
