import time
import requests
from flask import current_app


class SteamAPIError(Exception):
    """A real Steam failure, as opposed to Steam answering that there's nothing to return."""

    def __init__(self, status=None, body=None):
        super().__init__(f'Steam request failed (status {status})')
        self.status = status
        self.body = body or {}


class SteamAPIService:
    """Wrapper for Steam Web API calls with rate limiting."""

    BASE_URL = 'https://api.steampowered.com'
    STORE_URL = 'https://store.steampowered.com'
    CDN_URL = 'https://media.steampowered.com/steamcommunity/public/images/apps'

    _last_request_time = 0
    _rate_limit_interval = 1.0  # seconds between requests

    def __init__(self):
        self.api_key = current_app.config['STEAM_API_KEY']

    def _rate_limited_get(self, url, params=None):
        """Make a GET request with rate limiting (1 req/sec)."""
        now = time.time()
        elapsed = now - SteamAPIService._last_request_time
        if elapsed < self._rate_limit_interval:
            time.sleep(self._rate_limit_interval - elapsed)

        SteamAPIService._last_request_time = time.time()
        try:
            response = requests.get(url, params=params, timeout=15)
            if response.status_code >= 400:
                try:
                    body = response.json()
                except ValueError:
                    body = {}
                raise SteamAPIError(status=response.status_code, body=body)
            return response.json()
        except (requests.exceptions.RequestException, ValueError) as e:
            raise SteamAPIError() from e

    def get_player_summary(self, steam_id):
        """Get player profile info from Steam."""
        url = f'{self.BASE_URL}/ISteamUser/GetPlayerSummaries/v2/'
        try:
            data = self._rate_limited_get(url, params={
                'key': self.api_key,
                'steamids': steam_id,
            })
        except SteamAPIError:
            return None
        players = data.get('response', {}).get('players', [])
        if not players:
            return None
        p = players[0]
        return {
            'steam_id': p.get('steamid'),
            'persona_name': p.get('personaname'),
            'avatar_url': p.get('avatarfull'),
            'profile_url': p.get('profileurl'),
        }

    def get_owned_games(self, steam_id):
        """Get all games owned by a player."""
        url = f'{self.BASE_URL}/IPlayerService/GetOwnedGames/v1/'
        data = self._rate_limited_get(url, params={
            'key': self.api_key,
            'steamid': steam_id,
            'include_appinfo': 1,
            'include_played_free_games': 1,
            'format': 'json',
        })
        games = data.get('response', {}).get('games', [])
        result = []
        for g in games:
            app_id = g.get('appid')
            # Use Steam Store library capsule image for better quality poster
            capsule_url = f'https://cdn.cloudflare.steamstatic.com/steam/apps/{app_id}/library_600x900.jpg'

            # Construct full URLs for icon and logo if only hashes are provided
            img_icon_hash = g.get('img_icon_url')
            full_img_icon_url = f'{self.CDN_URL}/{app_id}/{img_icon_hash}.jpg' if img_icon_hash else None

            img_logo_hash = g.get('img_logo_url')
            full_img_logo_url = f'{self.CDN_URL}/{app_id}/{img_logo_hash}.jpg' if img_logo_hash else None

            result.append({
                'app_id': app_id,
                'name': g.get('name'),
                'img_icon_url': full_img_icon_url,
                'img_logo_url': full_img_logo_url,
                'img_capsule_url': capsule_url,
                'playtime_minutes': g.get('playtime_forever', 0),
            })
        return result

    def get_game_achievements_schema(self, app_id):
        """Get achievement definitions for a game."""
        url = f'{self.BASE_URL}/ISteamUserStats/GetSchemaForGame/v2/'
        try:
            data = self._rate_limited_get(url, params={
                'key': self.api_key,
                'appid': app_id,
                'l': 'english',
            })
        except SteamAPIError as e:
            # Steam answers 400 for games with no stats
            if e.status == 400:
                return []
            raise

        game_data = data.get('game', {})
        stats = game_data.get('availableGameStats', {})
        achievements = stats.get('achievements', [])
        return [{
            'api_name': a.get('name'),
            'display_name': a.get('displayName'),
            'description': a.get('description', ''),
            'icon_url': a.get('icon'),
            'icon_gray_url': a.get('icongray'),
        } for a in achievements]

    def get_player_achievements(self, steam_id, app_id):
        """Get a player's achievement unlock status for a game."""
        url = f'{self.BASE_URL}/ISteamUserStats/GetPlayerAchievements/v1/'
        try:
            data = self._rate_limited_get(url, params={
                'key': self.api_key,
                'steamid': steam_id,
                'appid': app_id,
                'l': 'english',
            })
        except SteamAPIError as e:
            if e.status == 400 and 'no stats' in str(e.body.get('playerstats', {}).get('error', '')).lower():
                return []
            raise

        stats = data.get('playerstats', {})
        if not stats.get('success'):
            return []

        achievements = stats.get('achievements', [])
        return [{
            'api_name': a.get('apiname'),
            'achieved': bool(a.get('achieved', 0)),
            'unlock_time': a.get('unlocktime', 0),
        } for a in achievements]

    def get_global_achievement_percentages(self, app_id):
        """Get global rarity percentages for a game's achievements."""
        url = f'{self.BASE_URL}/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/'
        try:
            data = self._rate_limited_get(url, params={
                'gameid': app_id,
            })
        except SteamAPIError as e:
            if e.status == 429:
                raise
            return {}

        achievements = data.get('achievementpercentages', {}).get('achievements', [])
        return {a['name']: round(float(a['percent']), 2) for a in achievements}
