import socket
import unittest
from unittest.mock import Mock, patch

from app.services.scraper import MAX_BYTES, ScraperService, is_public_url

RESOLVE = 'app.services.scraper.socket.getaddrinfo'


def resolves_to(address):
    family = socket.AF_INET6 if ':' in address else socket.AF_INET
    return [(family, socket.SOCK_STREAM, 6, '', (address, 0))]


def page(status=200, content_type='text/html', body=b'<main><p>Plenty of useful guide text here.</p></main>', location=None):
    r = Mock(status_code=status, headers={'Content-Type': content_type})
    if location:
        r.headers['Location'] = location
    r.iter_content.return_value = [body]
    return r


class PublicUrlTests(unittest.TestCase):
    def test_refuses_internal_addresses(self):
        for address in ['127.0.0.1', '10.0.0.5', '192.168.1.1', '169.254.169.254', '::1', '172.18.0.2', '::ffff:127.0.0.1']:
            with self.subTest(address=address), patch(RESOLVE, return_value=resolves_to(address)):
                self.assertFalse(is_public_url('http://db/'))

    def test_refuses_when_any_address_is_internal(self):
        with patch(RESOLVE, return_value=resolves_to('8.8.8.8') + resolves_to('10.0.0.1')):
            self.assertFalse(is_public_url('https://example.com/'))

    def test_refuses_non_default_ports_and_schemes(self):
        with patch(RESOLVE, return_value=resolves_to('8.8.8.8')):
            self.assertFalse(is_public_url('http://example.com:8080/'))
            self.assertFalse(is_public_url('ftp://example.com/'))
            self.assertFalse(is_public_url('https://example.com:80/'))

    def test_unresolvable_host_is_refused(self):
        with patch(RESOLVE, side_effect=socket.gaierror()):
            self.assertFalse(is_public_url('https://nope.example/'))

    def test_allows_public_address(self):
        with patch(RESOLVE, return_value=resolves_to('8.8.8.8')):
            self.assertTrue(is_public_url('https://example.com/guide'))


class ScrapeTests(unittest.TestCase):
    def setUp(self):
        self.scraper = ScraperService()
        self.scraper.session = Mock()

    def resolve(self, url_host_map=None):
        def fake(host, *args, **kwargs):
            return resolves_to((url_host_map or {}).get(host, '8.8.8.8'))
        return patch(RESOLVE, side_effect=fake)

    def test_internal_url_is_never_fetched(self):
        with self.resolve({'db': '172.18.0.2'}):
            result = self.scraper.scrape_url('http://db/')
        self.assertIsNone(result['content'])
        self.scraper.session.get.assert_not_called()

    def test_reads_public_page(self):
        self.scraper.session.get.return_value = page()
        with self.resolve():
            result = self.scraper.scrape_url('https://example.com/')
        self.assertIn('useful guide text', result['content'])

    def test_redirect_to_internal_is_refused(self):
        self.scraper.session.get.return_value = page(status=302, location='http://169.254.169.254/latest')
        with self.resolve({'169.254.169.254': '169.254.169.254'}):
            result = self.scraper.scrape_url('https://example.com/')
        self.assertIsNone(result['content'])
        self.assertEqual(self.scraper.session.get.call_count, 1)

    def test_relative_redirect_is_followed(self):
        self.scraper.session.get.side_effect = [page(status=301, location='/moved'), page()]
        with self.resolve():
            result = self.scraper.scrape_url('https://example.com/')
        self.assertIn('useful guide text', result['content'])
        self.assertEqual(self.scraper.session.get.call_args[0][0], 'https://example.com/moved')

    def test_stops_after_3_redirects(self):
        self.scraper.session.get.return_value = page(status=302, location='https://example.com/again')
        with self.resolve():
            result = self.scraper.scrape_url('https://example.com/')
        self.assertIsNone(result['content'])
        self.assertEqual(self.scraper.session.get.call_count, 4)

    def test_refuses_over_5mb(self):
        self.assertEqual(MAX_BYTES, 5 * 1024 * 1024)
        big = page()
        big.iter_content.return_value = [b'x' * MAX_BYTES, b'x']
        self.scraper.session.get.return_value = big
        with self.resolve():
            result = self.scraper.scrape_url('https://example.com/')
        self.assertIsNone(result['content'])

    def test_refuses_non_html(self):
        self.scraper.session.get.return_value = page(content_type='application/pdf')
        with self.resolve():
            result = self.scraper.scrape_url('https://example.com/a.pdf')
        self.assertIsNone(result['content'])

    def test_reads_plain_text(self):
        self.scraper.session.get.return_value = page(content_type='text/plain; charset=utf-8', body=b'Step one: do the thing.')
        with self.resolve():
            result = self.scraper.scrape_url('https://example.com/a.txt')
        self.assertIn('Step one', result['content'])

    def test_http_error_returns_no_content(self):
        self.scraper.session.get.return_value = page(status=404)
        with self.resolve():
            result = self.scraper.scrape_url('https://example.com/')
        self.assertIsNone(result['content'])
