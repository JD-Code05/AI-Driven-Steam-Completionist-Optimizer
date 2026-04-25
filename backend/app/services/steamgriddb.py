import requests
from flask import current_app


class SteamGridDBService:
    """Wrapper for the SteamGridDB API to fetch high-quality game artwork."""

    BASE_URL = 'https://www.steamgriddb.com/api/v2'

    # Preferred image dimensions / styles for grid images (portrait covers)
    _GRID_PARAMS = {
        'dimensions': '600x900',
        'nsfw': 'false',
        'humor': 'false',
        'limit': 1,
    }

    def __init__(self):
        self.api_key = current_app.config.get('STEAMGRIDDB_API_KEY', '')

    def _get(self, path, params=None):
        """Make an authenticated GET request to the SteamGridDB API."""
        if not self.api_key:
            return None
        headers = {'Authorization': f'Bearer {self.api_key}'}
        try:
            resp = requests.get(
                f'{self.BASE_URL}{path}',
                headers=headers,
                params=params or {},
                timeout=10,
            )
            resp.raise_for_status()
            return resp.json()
        except requests.exceptions.RequestException:
            return None

    def get_grid_image_url(self, steam_app_id: int) -> str | None:
        """
        Fetch the best high-quality 600×900 grid (portrait) image for a game
        identified by its Steam app ID.

        Returns the image URL string, or None if nothing is found.
        """
        data = self._get(
            f'/grids/steam/{steam_app_id}',
            params=self._GRID_PARAMS,
        )

        if not data or not data.get('success'):
            # Try without dimension filter as a fallback
            data = self._get(
                f'/grids/steam/{steam_app_id}',
                params={'nsfw': 'false', 'humor': 'false', 'limit': 1},
            )

        if data and data.get('success') and data.get('data'):
            return data['data'][0].get('url')

        return None

    def get_hero_image_url(self, steam_app_id: int) -> str | None:
        """
        Fetch the best hero (wide banner) image for a game.
        Used as a secondary high-quality option.
        """
        data = self._get(
            f'/heroes/steam/{steam_app_id}',
            params={'nsfw': 'false', 'humor': 'false', 'limit': 1},
        )

        if data and data.get('success') and data.get('data'):
            return data['data'][0].get('url')

        return None
