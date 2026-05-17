import re
import logging
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


class ScraperService:
    """Scrapes web pages for AI RAG context."""

    def __init__(self):
        # Configure a session with retries for transient network/DNS issues
        self.session = requests.Session()
        retry = Retry(
            total=3,
            backoff_factor=0.5,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["HEAD", "GET", "OPTIONS"]
        )
        adapter = HTTPAdapter(max_retries=retry)
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)

    def scrape_url(self, url):
        """Scrape a regular web page using BeautifulSoup."""
        try:
            resp = self.session.get(url, headers=_HEADERS, timeout=15)
            resp.raise_for_status()
        except requests.RequestException as e:
            logger.warning(f"Failed to fetch {url}: {e}")
            return {'title': None, 'content': None, 'error': str(e)}

        soup = BeautifulSoup(resp.text, 'html.parser')

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
