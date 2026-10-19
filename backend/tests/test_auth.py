from urllib.parse import urlparse, parse_qs
from unittest.mock import patch
from tests.base import BaseTestCase


def _return_to(resp):
    """The return_url our login embeds inside openid.return_to."""
    q = parse_qs(urlparse(resp.headers['Location']).query)
    return parse_qs(urlparse(q['openid.return_to'][0]).query)['return_url'][0]


class LoginRedirectTests(BaseTestCase):
    def test_keeps_frontend_return_url(self):
        r = self.client.get('/api/auth/login?return_url=http://localhost:3000/dashboard')
        self.assertEqual(_return_to(r), 'http://localhost:3000/dashboard')

    def test_replaces_foreign_return_url(self):
        r = self.client.get('/api/auth/login?return_url=https://evil.example/steal')
        self.assertEqual(_return_to(r), 'http://localhost:3000/dashboard')

    def test_rejects_lookalike_host(self):
        r = self.client.get('/api/auth/login?return_url=http://localhost:3000.evil.example/')
        self.assertEqual(_return_to(r), 'http://localhost:3000/dashboard')

    @patch('app.routes.auth.requests.post')
    def test_callback_never_redirects_off_site(self, post):
        post.return_value.text = 'is_valid:false'
        r = self.client.get('/api/auth/callback?return_url=https://evil.example/')
        self.assertTrue(r.headers['Location'].startswith('http://localhost:3000/'))
