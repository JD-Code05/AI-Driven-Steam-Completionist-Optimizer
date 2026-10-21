from unittest.mock import patch

from app.extensions import db
from app.models.player_game import PlayerGame
from tests.base import BaseTestCase

SCHEMA = [{'api_name': 'A1', 'display_name': 'One', 'description': '', 'icon_url': '', 'icon_gray_url': ''}]
SVC = 'app.routes.sync.SteamAPIService'


class SyncAchievementsTests(BaseTestCase):
    def sync(self, player, app_id):
        with patch(f'{SVC}.get_game_achievements_schema', return_value=SCHEMA), \
             patch(f'{SVC}.get_global_achievement_percentages', return_value={'A1': 5.0}), \
             patch(f'{SVC}.get_player_achievements', return_value=[]):
            return self.client.post(f'/api/sync/achievements/{app_id}', headers=self.auth(player))

    def test_sets_last_synced_for_callers_player_game_only(self):
        me = self.make_player('1')
        other = self.make_player('2')
        game = self.make_game(10, 'X')
        mine = PlayerGame(player_id=me.id, game_id=game.id)
        theirs = PlayerGame(player_id=other.id, game_id=game.id)
        db.session.add_all([mine, theirs])
        db.session.commit()

        self.assertEqual(self.sync(me, 10).status_code, 200)

        db.session.refresh(mine)
        db.session.refresh(theirs)
        self.assertIsNotNone(mine.last_synced)
        self.assertIsNone(theirs.last_synced)

    def test_player_without_the_game_still_syncs(self):
        me = self.make_player('1')
        self.make_game(10, 'X')
        self.assertEqual(self.sync(me, 10).status_code, 200)
        self.assertEqual(PlayerGame.query.count(), 0)
