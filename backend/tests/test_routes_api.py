import json
from unittest.mock import patch

from app.extensions import db
from app.models.achievement import Achievement
from app.models.optimization_route import OptimizationRoute
from app.models.player_game import PlayerGame
from app.services.gemini import GeminiError, GeminiNotConfigured
from tests.base import BaseTestCase

GENERATE = 'app.routes.ai.generate_text'
GOOD = json.dumps({'message': 'Start easy.', 'shape': 'themed', 'branches': [
    {'name': 'One', 'kind': 'side', 'branches_from': None, 'steps': [
        {'api_name': 'A1', 'missable': False, 'missable_note': None},
        {'api_name': 'A2', 'missable': True, 'missable_note': 'Before the end'},
    ]},
]})
SECOND = GOOD.replace('Start easy.', 'Rewritten.')


class RoutesApiTests(BaseTestCase):
    def setUp(self):
        super().setUp()
        self.me = self.make_player('1')
        self.other = self.make_player('2')
        self.game = self.make_game(10, 'X')
        db.session.add_all([
            PlayerGame(player_id=self.me.id, game_id=self.game.id),
            PlayerGame(player_id=self.other.id, game_id=self.game.id),
            Achievement(game_id=self.game.id, api_name='A1', display_name='One', global_percent=50),
            Achievement(game_id=self.game.id, api_name='A2', display_name='Two', global_percent=5),
        ])
        db.session.commit()
        self.url = f'/api/ai/routes/{self.game.id}'

    def get(self, player=None):
        return self.client.get(self.url, headers=self.auth(player or self.me))

    def post(self, player=None):
        return self.client.post(self.url, headers=self.auth(player or self.me))

    def test_routes_need_login(self):
        self.assertEqual(self.client.get(self.url).status_code, 401)
        self.assertEqual(self.client.post(self.url).status_code, 401)

    def test_game_must_be_in_library(self):
        stranger = self.make_player('3')
        self.assertEqual(self.get(stranger).status_code, 404)
        self.assertEqual(self.post(stranger).status_code, 404)

    def test_get_without_route_is_404(self):
        self.assertEqual(self.get().status_code, 404)

    def test_get_with_corrupt_json_is_404(self):
        db.session.add(OptimizationRoute(player_id=self.me.id, game_id=self.game.id, summary_md='## not json'))
        db.session.commit()
        self.assertEqual(self.get().status_code, 404)

    def test_post_without_achievements_is_400(self):
        empty = self.make_game(20, 'Empty')
        db.session.add(PlayerGame(player_id=self.me.id, game_id=empty.id))
        db.session.commit()
        r = self.client.post(f'/api/ai/routes/{empty.id}', headers=self.auth(self.me))
        self.assertEqual(r.status_code, 400)

    def test_post_saves_and_get_returns_parsed(self):
        with patch(GENERATE, return_value=GOOD):
            r = self.post()
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json['route']['message'], 'Start easy.')
        got = self.get().json
        self.assertEqual(got['game_id'], self.game.id)
        self.assertEqual(got['route']['branches'][0]['steps'][1]['missable_note'], 'Before the end')
        self.assertIn('model_used', got)
        self.assertIn('updated_at', got)

    def test_second_post_replaces_row(self):
        with patch(GENERATE, side_effect=[GOOD, SECOND]):
            self.post()
            self.post()
        self.assertEqual(OptimizationRoute.query.count(), 1)
        self.assertEqual(self.get().json['route']['message'], 'Rewritten.')

    def test_invalid_json_retries_once(self):
        with patch(GENERATE, side_effect=['{"cut off', GOOD]) as generate:
            r = self.post()
        self.assertEqual(r.status_code, 200)
        self.assertEqual(generate.call_count, 2)

    def test_invalid_twice_is_502_and_keeps_old_route(self):
        with patch(GENERATE, return_value=GOOD):
            self.post()
        with patch(GENERATE, side_effect=['nope', 'still nope']):
            r = self.post()
        self.assertEqual(r.status_code, 502)
        self.assertIn('error', r.json)
        self.assertEqual(self.get().json['route']['message'], 'Start easy.')

    def test_gemini_failure_is_502_and_missing_key_is_400(self):
        with patch(GENERATE, side_effect=GeminiError('boom')):
            self.assertEqual(self.post().status_code, 502)
        with patch(GENERATE, side_effect=GeminiNotConfigured()):
            self.assertEqual(self.post().status_code, 400)

    def test_routes_are_per_player(self):
        with patch(GENERATE, return_value=GOOD):
            self.post()
        self.assertEqual(self.get(self.other).status_code, 404)

    def test_no_attempt_without_enough_time_left(self):
        with patch('app.routes.ai.ROUTE_SECONDS', 5), patch(GENERATE, return_value=GOOD) as generate:
            r = self.post()
        self.assertEqual(r.status_code, 502)
        generate.assert_not_called()

    def test_attempt_gets_the_time_left_and_no_thinking(self):
        with patch(GENERATE, return_value=GOOD) as generate:
            self.post()
        self.assertLessEqual(generate.call_args.kwargs['timeout_ms'], 110000)
        self.assertGreater(generate.call_args.kwargs['timeout_ms'], 100000)
        self.assertEqual(generate.call_args.kwargs['thinking_budget'], 0)

    def test_output_limit_grows_with_achievements(self):
        with patch(GENERATE, return_value=GOOD) as generate:
            self.post()
        self.assertEqual(generate.call_args.kwargs['max_output_tokens'], 2048 + 60 * 2)
