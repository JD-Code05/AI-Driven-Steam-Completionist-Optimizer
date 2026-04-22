import re
import logging
import requests
from bs4 import BeautifulSoup
from urllib.parse import urlparse, parse_qs
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
    """Scrapes web pages, YouTube transcripts, and discovers achievement guides."""

    def scrape_url(self, url):
        """Scrape content from a URL. Auto-detects YouTube vs regular page."""
        parsed = urlparse(url)
        if self._is_youtube(parsed):
            return self._scrape_youtube(url, parsed)
        return self._scrape_page(url)

    def auto_discover_sources(self, game_name, max_results=5):
        """Search Google for achievement guides and return discovered URLs."""
        query = f"{game_name} achievement guide"
        search_url = 'https://www.google.com/search'
        params = {'q': query, 'num': max_results + 5, 'hl': 'en'}

        try:
            resp = requests.get(search_url, params=params, headers=_HEADERS, timeout=15)
            resp.raise_for_status()
        except requests.RequestException as e:
            logger.warning(f"Google search failed: {e}")
            return []

        soup = BeautifulSoup(resp.text, 'html.parser')
        results = []

        for a_tag in soup.find_all('a', href=True):
            href = a_tag['href']
            # Google wraps results in /url?q=... redirects
            if href.startswith('/url?'):
                actual_url = parse_qs(urlparse(href).query).get('q', [None])[0]
                if actual_url and self._is_valid_source(actual_url):
                    title = a_tag.get_text(strip=True) or actual_url
                    source_type = self._detect_source_type(actual_url)
                    results.append({
                        'url': actual_url,
                        'title': title[:500],
                        'source_type': source_type,
                    })
                    if len(results) >= max_results:
                        break

        return results

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

    def _scrape_youtube(self, url, parsed):
        """Extract YouTube video title, description, and transcript."""
        video_id = self._get_youtube_id(parsed)
        if not video_id:
            return {'title': None, 'content': None, 'error': 'Could not extract YouTube video ID'}

        parts = []
        title = None

        # Fetch page for title and description
        try:
            resp = requests.get(url, headers=_HEADERS, timeout=15)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, 'html.parser')

            title_tag = soup.find('meta', property='og:title')
            title = title_tag['content'] if title_tag else None

            desc_tag = soup.find('meta', property='og:description')
            if desc_tag:
                parts.append(f"## Description\n{desc_tag['content']}")
        except requests.RequestException:
            pass

        # Fetch transcript
        try:
            from youtube_transcript_api import YouTubeTranscriptApi

            transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
            # Prefer manual English, fall back to auto-generated
            transcript = None
            try:
                transcript = transcript_list.find_manually_created_transcript(['en'])
            except Exception:
                try:
                    transcript = transcript_list.find_generated_transcript(['en'])
                except Exception:
                    pass

            if transcript:
                entries = transcript.fetch()
                transcript_text = ' '.join(entry.get('text', '') for entry in entries)
                # Clean up auto-generated artifacts
                transcript_text = re.sub(r'\[.*?\]', '', transcript_text)
                transcript_text = re.sub(r'\s+', ' ', transcript_text).strip()
                if transcript_text:
                    parts.append(f"## Transcript\n{transcript_text}")
        except ImportError:
            logger.warning("youtube-transcript-api not installed, skipping transcript")
        except Exception as e:
            logger.warning(f"Failed to get YouTube transcript for {video_id}: {e}")

        content = '\n\n'.join(parts) if parts else None

        # Truncate
        if content and len(content) > 50000:
            content = content[:50000] + '\n\n[Content truncated]'

        return {'title': title, 'content': content, 'error': None if content else 'No content extracted'}

    def _is_youtube(self, parsed):
        host = parsed.hostname or ''
        return 'youtube.com' in host or 'youtu.be' in host

    def _get_youtube_id(self, parsed):
        host = parsed.hostname or ''
        if 'youtu.be' in host:
            return parsed.path.lstrip('/')
        if 'youtube.com' in host:
            return parse_qs(parsed.query).get('v', [None])[0]
        return None

    def _is_valid_source(self, url):
        """Filter out Google's own pages and irrelevant domains."""
        parsed = urlparse(url)
        host = parsed.hostname or ''
        blocked = ['google.com', 'google.co', 'accounts.google', 'support.google',
                    'maps.google', 'translate.google', 'webcache.googleusercontent']
        return not any(b in host for b in blocked) and url.startswith('http')

    def _detect_source_type(self, url):
        parsed = urlparse(url)
        host = (parsed.hostname or '').lower()
        if 'youtube.com' in host or 'youtu.be' in host:
            return 'youtube'
        if 'wiki' in host or 'fandom.com' in host:
            return 'wiki'
        if 'reddit.com' in host or 'blog' in host or 'medium.com' in host:
            return 'blog'
        return 'article'
