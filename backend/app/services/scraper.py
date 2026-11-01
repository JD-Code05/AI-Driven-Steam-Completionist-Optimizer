import re
import ipaddress
import logging
import socket
from urllib.parse import urljoin, urlparse

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

# Common headers to avoid bot detection
_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
}

# Tags that are typically navigation/boilerplate
_STRIP_TAGS = ['nav', 'header', 'footer', 'aside', 'script', 'style', 'noscript', 'iframe', 'form']

_DEFAULT_PORTS = {'http': 80, 'https': 443}
_ALLOWED_TYPES = {'text/html', 'application/xhtml+xml', 'text/plain'}
MAX_REDIRECTS = 3
MAX_BYTES = 5 * 1024 * 1024


# shortcut: checks the address but doesn't pin it, so DNS rebinding could still reach internal hosts; pin the checked IP before other people can sign in
def is_public_url(url):
    """True only for http(s) on default ports where every resolved address is public."""
    try:
        parsed = urlparse(url)
        if parsed.scheme not in _DEFAULT_PORTS or not parsed.hostname:
            return False
        if parsed.port not in (None, _DEFAULT_PORTS[parsed.scheme]):
            return False
        addresses = socket.getaddrinfo(parsed.hostname, None)
    except (ValueError, OSError):
        return False
    if not addresses:
        return False
    for info in addresses:
        address = ipaddress.ip_address(info[4][0].split('%')[0])
        mapped = getattr(address, 'ipv4_mapped', None)
        if not (mapped or address).is_global:
            return False
    return True


class ScraperService:
    """Scrapes web pages for AI RAG context."""

    def __init__(self):
        # Configure a session with retries for transient network/DNS issues
        self.session = requests.Session()
        retry = Retry(
            total=1,  # the caller has a time budget
            backoff_factor=0.5,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["HEAD", "GET", "OPTIONS"]
        )
        adapter = HTTPAdapter(max_retries=retry)
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)

    def _fetch(self, url, timeout):
        """Return (content_type, body), checking every redirect hop and capping the size."""
        for _ in range(MAX_REDIRECTS + 1):
            if not is_public_url(url):
                raise requests.RequestException('Address is not allowed')
            resp = self.session.get(url, headers=_HEADERS, timeout=timeout, stream=True, allow_redirects=False)
            location = resp.headers.get('Location')
            if 300 <= resp.status_code < 400 and location:
                url = urljoin(url, location)
                continue
            if resp.status_code >= 400:
                raise requests.RequestException(f'HTTP {resp.status_code}')
            content_type = resp.headers.get('Content-Type', '').split(';')[0].strip().lower()
            if content_type not in _ALLOWED_TYPES:
                raise requests.RequestException(f'Unsupported content type {content_type}')
            body = b''
            for chunk in resp.iter_content(chunk_size=65536):
                body += chunk
                if len(body) > MAX_BYTES:
                    raise requests.RequestException('Page is too large')
            return content_type, body
        raise requests.RequestException('Too many redirects')

    def scrape_url(self, url, timeout=15):
        """Scrape a regular web page using BeautifulSoup."""
        try:
            content_type, body = self._fetch(url, timeout)
        except requests.RequestException as e:
            logger.warning(f"Failed to fetch {url}: {e}")
            return {'title': None, 'content': None, 'error': str(e)}

        if content_type == 'text/plain':
            return {'title': None, 'content': body.decode('utf-8', errors='replace')[:50000], 'error': None}

        soup = BeautifulSoup(body, 'html.parser')

        # Extract title
        title = None
        title_tag = soup.find('title')
        if title_tag:
            title = title_tag.get_text(strip=True)

        # Remove boilerplate tags
        for tag_name in _STRIP_TAGS:
            for tag in soup.find_all(tag_name):
                tag.decompose()

        # Try to find the main content area
        main = (
            soup.find('main')
            or soup.find('article')
            or soup.find('div', id='mw-content-text') # Specific to MediaWiki (Stardew Wiki)
            or soup.find('div', class_=re.compile(r'content|article|post|entry|wiki', re.I))
            or soup.find('body')
        )

        if not main:
            return {'title': title, 'content': None, 'error': 'No main content found'}

        # Extract text, preserve some structure
        lines = []
        for element in main.find_all(['h1', 'h2', 'h3', 'h4', 'p', 'li', 'td', 'th']):
            text = element.get_text(separator=' ', strip=True)
            if len(text) > 20:  # Skip very short fragments
                if element.name in ('h1', 'h2', 'h3', 'h4'):
                    lines.append(f"\n## {text}\n")
                elif element.name == 'li':
                    lines.append(f"- {text}")
                else:
                    lines.append(text)

        content = '\n'.join(lines)
        # Remove excessive whitespace
        content = re.sub(r'\n{3,}', '\n\n', content).strip()

        # Truncate to ~50k chars to avoid overloading LLM context
        if len(content) > 50000:
            content = content[:50000] + '\n\n[Content truncated]'

        return {'title': title, 'content': content, 'error': None}
