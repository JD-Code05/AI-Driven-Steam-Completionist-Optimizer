import re
import logging
import requests
from bs4 import BeautifulSoup
from urllib.parse import urlparse
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Common headers to avoid bot detection
_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
}

# Tags that are typically navigation/boilerplate
_STRIP_TAGS = ['nav', 'header', 'footer', 'aside', 'script', 'style', 'noscript', 'iframe', 'form']


class ScraperService:
    """Scrapes web pages and Steam community guides for achievement context."""

    def scrape_url(self, url):
        """Scrape content from a URL."""
        return self._scrape_page(url)

    # ------------------------------------------------------------------
    # Internal methods
    # ------------------------------------------------------------------

    def _scrape_page(self, url):
        """Scrape a regular web page using BeautifulSoup."""
        try:
            resp = requests.get(url, headers=_HEADERS, timeout=15)
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
            or soup.find('div', class_=re.compile(r'content|article|post|entry|wiki', re.I))
            or soup.find('div', id=re.compile(r'content|article|post|entry|wiki', re.I))
            or soup.find('body')
        )

        if not main:
            return {'title': title, 'content': None, 'error': 'No main content found'}

        # Extract text, preserve some structure
        lines = []
        for element in main.find_all(['h1', 'h2', 'h3', 'h4', 'p', 'li', 'td', 'th', 'span', 'div']):
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

    def _detect_source_type(self, url):
        parsed = urlparse(url)
        host = (parsed.hostname or '').lower()
        if 'steam' in host and 'guides' in url.lower():
            return 'steam_guide'
        if 'wiki' in host or 'fandom.com' in host:
            return 'wiki'
        if 'reddit.com' in host or 'blog' in host or 'medium.com' in host:
            return 'blog'
        return 'article'

    def scrape_steam_guides(self, app_id, game_name, max_results=3):
        """Placeholder for Steam guide scraping.
        
        Note: Steam Community Guides pages load dynamically with JavaScript,
        which cannot be rendered with BeautifulSoup. Users should manually
        add guide bookmarks through the UI instead.
        
        Args:
            app_id: Steam game app ID
            game_name: Name of the game
            max_results: Maximum guides to scrape
            
        Returns:
            Empty list (auto-discovery disabled)
        """
        logger.info(f"Steam guide auto-discovery disabled for {game_name}")
        return []
