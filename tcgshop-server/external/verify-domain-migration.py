"""Isolated migration checks. Never connect to the actual cloud or NAS."""
import contextlib
import importlib.util
import io
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from unittest.mock import MagicMock

spec = importlib.util.spec_from_file_location('migration', Path(__file__).with_name('migrate-domain.py'))
migration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)
MANIFEST = {'packageName': 'com.tcgshop.pos', 'versionName': '1.1.0', 'versionCode': 36, 'sha256': 'a' * 64}


class EnabledSite:
    def __init__(self, target):
        self.target, self.enabled = target, False

    def is_symlink(self):
        return self.enabled

    def exists(self):
        return self.enabled

    def resolve(self):
        return self.target.resolve()

    def symlink_to(self, target):
        assert target == self.target
        self.enabled = True

    def unlink(self, **kwargs):
        self.enabled = False


class Tests(unittest.TestCase):
    def test_collision_and_quoted_hostname(self):
        for names in (migration.DOMAIN, 'other.test "' + migration.DOMAIN + '"'):
            with self.assertRaises(RuntimeError):
                migration.guard_domain_collision('# configuration file /another-site:\nserver_name ' + names + ';\n')
        migration.guard_domain_collision('# configuration file /another-site:\n# server_name ' + migration.DOMAIN + ';\nserver_name other.test;\n')
        migration.guard_domain_collision('# configuration file ' + str(migration.SITE) + ':\nserver_name ' + migration.DOMAIN + ';\n')

    def test_proxy_protocol(self):
        text = migration.configuration(True)
        self.assertIn('proxy_pass ' + migration.UPSTREAM + '/;', text)
        for header in ('Authorization $http_authorization', 'If-Match $http_if_match', 'If-None-Match $http_if_none_match'):
            self.assertIn('proxy_set_header ' + header + ';', text)
        self.assertIn('proxy_pass_header ETag;', text)
        self.assertIn('proxy_read_timeout 25s;', text)
        self.assertIn('location ^~ /.well-known/acme-challenge/', text)
        self.assertNotIn(migration.OLD_ORIGIN, text)

    def test_no_redirect_following(self):
        self.assertIsNone(migration.NoRedirect().redirect_request(None, None, 301, '', None, 'https://other.test'))

    def test_domain_filing_block(self):
        response = MagicMock()
        response.__enter__.return_value = response
        response.headers = {'Location': 'https://dnspod.qcloud.com/static/webblock.html?d=' + migration.DOMAIN}
        opener = MagicMock()
        opener.open.return_value = response
        with patch.object(migration.urllib.request, 'build_opener', return_value=opener), self.assertRaisesRegex(RuntimeError, 'Complete domain filing'):
            migration.check_domain_access()
        response.headers = {}
        with patch.object(migration.urllib.request, 'build_opener', return_value=opener):
            migration.check_domain_access()

    def simulate(self, failure=None, existing=False):
        with tempfile.TemporaryDirectory(prefix='domain-check-', dir=Path(__file__).parent) as folder:
            root = Path(folder)
            site, hook = root / 'new.conf', root / 'hooks/reload'
            old_site = root / 'old.conf'
            old_site.write_bytes(b'old gateway must retain its full configuration\n')
            enabled = EnabledSite(site)
            with patch.object(migration, 'SITE', site), patch.object(migration, 'ENABLED', enabled), \
                 patch.object(migration, 'HOOK', hook), patch.object(migration, 'WEBROOT', root / 'www'), \
                 patch.object(migration.os, 'geteuid', return_value=0, create=True), \
                 patch.object(migration.shutil, 'which', return_value='/test/tool'), \
                 patch.object(migration, 'check_domain_access'), \
                 patch.object(migration.time, 'sleep'):
                original = None
                if existing:
                    original = migration.configuration(True)
                    site.write_text(original)
                    enabled.enabled = True
                calls, tls_failed = [], False

                def run(command, **kwargs):
                    nonlocal tls_failed
                    calls.append(command)
                    if command[0] == 'certbot' and failure == 'certificate':
                        raise subprocess.CalledProcessError(1, command)
                    if command == ['nginx', '-t'] and failure == 'syntax' and site.exists() and 'listen 443 ssl' in site.read_text() and not tls_failed:
                        tls_failed = True
                        raise subprocess.CalledProcessError(1, command)
                    return subprocess.CompletedProcess(command, 0, stdout='# configuration file ' + str(old_site) + ':\nserver_name old.test;\n')

                def fetch(origin, endpoint):
                    if endpoint == '/api/health':
                        return 401, {'error': '同步密钥不正确'}
                    if failure == 'route' and origin == 'https://' + migration.DOMAIN + '/tcgshop':
                        return 200, {**MANIFEST, 'sha256': 'b' * 64}
                    return 200, MANIFEST

                with patch.object(migration.subprocess, 'run', side_effect=run), \
                     patch.object(migration, 'fetch', side_effect=fetch), contextlib.redirect_stdout(io.StringIO()):
                    if failure:
                        with self.assertRaises(Exception):
                            migration.main()
                        self.assertEqual(site.read_text() if site.exists() else None, original)
                        self.assertEqual(enabled.enabled, existing)
                        self.assertFalse(hook.exists())
                    else:
                        migration.main()
                        self.assertEqual(site.read_text(), migration.configuration(True))
                        self.assertTrue(enabled.enabled)
                        self.assertEqual(hook.read_text(), migration.HOOK_TEXT)
                        migration.main()
                        self.assertEqual(site.read_text(), migration.configuration(True))
                self.assertEqual(old_site.read_bytes(), b'old gateway must retain its full configuration\n')
                cert = next(c for c in calls if c[0] == 'certbot')
                self.assertIn('certonly', cert)
                self.assertIn('--webroot', cert)
                self.assertNotIn('--nginx', cert)

    def test_success_and_idempotence(self):
        self.simulate()

    def test_certificate_failure_restores_config(self):
        self.simulate('certificate')

    def test_syntax_failure_restores_config(self):
        self.simulate('syntax')

    def test_route_mismatch_restores_config(self):
        self.simulate('route')

    def test_existing_config_restored(self):
        self.simulate('route', existing=True)

    def test_custom_config_refused(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as folder:
            site = Path(folder) / 'custom.conf'
            site.write_text('custom user configuration')
            with patch.object(migration, 'SITE', site), self.assertRaises(RuntimeError):
                migration.guard_owned_files()
            self.assertEqual(site.read_text(), 'custom user configuration')


if __name__ == '__main__':
    unittest.main()
