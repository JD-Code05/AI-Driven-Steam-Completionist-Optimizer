import time
import requests
from flask import current_app


class SteamAPIService:
    """Wrapper for Steam Web API calls with rate limiting."""

    BASE_URL = 'https://api.steampowered.com'
    STORE_URL = 'https://store.steampowered.com'
    CDN_URL = 'https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps'

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
        response = requests.get(url, params=params, timeout=15)
        response.raise_for_status()
        return response.json()

    def get_player_summary(self, steam_id):
        """Get player profile info from Steam."""
        url = f'{self.BASE_URL}/ISteamUser/GetPlayerSummaries/v2/'
        data = self._rate_limited_get(url, params={
            'key': self.api_key,
            'steamids': steam_id,
        })
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
            result.append({
                'app_id': app_id,
                'name': g.get('name'),
                'img_icon_url': f"{self.CDN_URL}/{app_id}/{g.get('img_icon_url')}.jpg" if g.get('img_icon_url') else None,
                'img_logo_url': f"{self.CDN_URL}/{app_id}/{g.get('img_logo_url')}.jpg" if g.get('img_logo_url') else None,
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
        except requests.exceptions.HTTPError:
            return []

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
        except requests.exceptions.HTTPError:
            return []

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
        except requests.exceptions.HTTPError:
            return {}

        achievements = data.get('achievementpercentages', {}).get('achievements', [])
        return {a['name']: round(float(a['percent']), 2) for a in achievements}
