from unittest.mock import Mock, patch

import requests

from app.services.steam_api import SteamAPIError, SteamAPIService
from tests.base import BaseTestCase

GET = 'app.services.steam_api.requests.get'


def response(status, body=None):
    r = Mock(status_code=status)
    r.json.return_value = body or {}
    r.raise_for_status.side_effect = (
        requests.exceptions.HTTPError(response=r) if status >= 400 else None
    )
    return r


class SteamErrorTests(BaseTestCase):
    def setUp(self):
        super().setUp()
        SteamAPIService._last_request_time = 0
        self.app.config['STEAM_API_KEY'] = 'k'
        self.service = SteamAPIService()
        self.service._rate_limit_interval = 0

    def test_player_no_stats_answer_is_empty(self):
        body = {'playerstats': {'success': False, 'error': 'Requested app has no stats'}}
        with patch(GET, return_value=response(400, body)):
            self.assertEqual(self.service.get_player_achievements('1', 10), [])

    def test_schema_400_is_empty(self):
        with patch(GET, return_value=response(400)):
            self.assertEqual(self.service.get_game_achievements_schema(10), [])

    def test_schema_500_raises(self):
        with patch(GET, return_value=response(500)):
            with self.assertRaises(SteamAPIError) as caught:
                self.service.get_game_achievements_schema(10)
        self.assertEqual(caught.exception.status, 500)

    def test_timeout_raises(self):
        with patch(GET, side_effect=requests.exceptions.Timeout()):
            with self.assertRaises(SteamAPIError) as caught:
                self.service.get_game_achievements_schema(10)
        self.assertIsNone(caught.exception.status)

    def test_player_403_raises(self):
        with patch(GET, return_value=response(403)):
            with self.assertRaises(SteamAPIError) as caught:
                self.service.get_player_achievements('1', 10)
        self.assertEqual(caught.exception.status, 403)

    def test_player_400_for_another_reason_raises(self):
        with patch(GET, return_value=response(400, {'playerstats': {'success': False, 'error': 'Invalid'}})):
            with self.assertRaises(SteamAPIError):
                self.service.get_player_achievements('1', 10)

    def test_global_percent_failure_is_empty_except_rate_limit(self):
        with patch(GET, return_value=response(500)):
            self.assertEqual(self.service.get_global_achievement_percentages(10), {})
        with patch(GET, return_value=response(429)):
            with self.assertRaises(SteamAPIError):
                self.service.get_global_achievement_percentages(10)

    def test_player_summary_failure_is_none(self):
        with patch(GET, return_value=response(500)):
            self.assertIsNone(self.service.get_player_summary('1'))
