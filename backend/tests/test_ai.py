from unittest.mock import patch

from app.extensions import db
from app.models.achievement import Achievement
from app.services.gemini import GeminiError, GeminiNotConfigured
from tests.base import BaseTestCase

GENERATE = 'app.routes.ai.generate_text'


class AchievementTipTests(BaseTestCase):
    def setUp(self):
        super().setUp()
        self.me = self.make_player('1')
        self.game = self.make_game(10, 'X')
        self.ach = Achievement(game_id=self.game.id, api_name='A1', display_name='One')
        db.session.add(self.ach)
        db.session.commit()

    def tip(self):
        return self.client.post(f'/api/ai/achievement-tip/{self.ach.id}', headers=self.auth(self.me))

    def test_tip_returns_markdown(self):
        with patch(GENERATE, return_value='## How to Unlock\n1. Go.'):
            r = self.tip()
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json['tip_md'], '## How to Unlock\n1. Go.')
        self.assertEqual(r.json['achievement_id'], self.ach.id)
        self.assertIn('model_used', r.json)

    def test_tip_without_key_is_400(self):
        with patch(GENERATE, side_effect=GeminiNotConfigured()):
            r = self.tip()
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json['error'], 'GEMINI_API_KEY is not configured')

    def test_tip_failure_is_500(self):
        with patch(GENERATE, side_effect=GeminiError('boom')):
            r = self.tip()
        self.assertEqual(r.status_code, 500)
