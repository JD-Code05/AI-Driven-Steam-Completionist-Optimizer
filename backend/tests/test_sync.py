from datetime import datetime
from unittest.mock import patch

from app.extensions import db
from app.models.achievement import Achievement
from app.models.game import Game
from app.models.player_achievement import PlayerAchievement
from app.models.player_game import PlayerGame
from app.services.steam_api import SteamAPIError
from tests.base import BaseTestCase

WHEN = datetime(2024, 1, 2, 3, 4, 5)
SCHEMA =[{'api_name': 'A1', 'display_name': 'One', 'description': '', 'icon_url': '', 'icon_gray_url': ''}]
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

    def unlocked_setup(self):
        me = self.make_player('1')
        game = self.make_game(10, 'X')
        ach = Achievement(game_id=game.id, api_name='A1', display_name='One')
        db.session.add(ach)
        db.session.flush()
        pa = PlayerAchievement(player_id=me.id, achievement_id=ach.id, unlocked=True, unlock_time=WHEN)
        db.session.add(pa)
        db.session.commit()
        return me, pa

    def assert_unlock_kept(self, pa):
        db.session.expire_all()
        kept = db.session.get(PlayerAchievement, pa.id)
        self.assertTrue(kept.unlocked)
        self.assertEqual(kept.unlock_time, WHEN)

    def sync_with(self, me, **calls):
        patches = {'get_game_achievements_schema': {'return_value': SCHEMA},
                   'get_global_achievement_percentages': {'return_value': {'A1': 5.0}},
                   'get_player_achievements': {'return_value': []}}
        patches.update(calls)
        with patch(f'{SVC}.get_game_achievements_schema', **patches['get_game_achievements_schema']), \
             patch(f'{SVC}.get_global_achievement_percentages', **patches['get_global_achievement_percentages']), \
             patch(f'{SVC}.get_player_achievements', **patches['get_player_achievements']):
            return self.client.post('/api/sync/achievements/10', headers=self.auth(me))

    def test_steam_failure_leaves_existing_unlocks_untouched(self):
        me, pa = self.unlocked_setup()
        r = self.sync_with(me, get_player_achievements={'side_effect': SteamAPIError(status=500)})
        self.assertEqual(r.status_code, 502)
        self.assert_unlock_kept(pa)

    def test_rate_limit_reaches_the_browser(self):
        me, pa = self.unlocked_setup()
        r = self.sync_with(me, get_game_achievements_schema={'side_effect': SteamAPIError(status=429)})
        self.assertEqual(r.status_code, 429)
        self.assert_unlock_kept(pa)

    def test_private_profile_reaches_the_browser(self):
        me, pa = self.unlocked_setup()
        r = self.sync_with(me, get_player_achievements={'side_effect': SteamAPIError(status=403)})
        self.assertEqual(r.status_code, 403)
        self.assert_unlock_kept(pa)

    def test_empty_player_response_keeps_unlock(self):
        me, pa = self.unlocked_setup()
        self.assertEqual(self.sync_with(me).status_code, 200)
        self.assert_unlock_kept(pa)

    def owned(self, *games):
        return [{'app_id': a, 'name': f'G{a}', 'img_icon_url': None, 'img_logo_url': None, 'img_capsule_url': None,
                 'playtime_minutes': 0, 'has_stats': s} for a, s in games]

    def sync_games(self, me, *games):
        with patch(f'{SVC}.get_owned_games', return_value=self.owned(*games)):
            return self.client.post('/api/sync/games', headers=self.auth(me))

    def test_sync_games_lists_only_games_with_stats(self):
        me = self.make_player('1')
        r = self.sync_games(me, (10, True), (20, False))
        self.assertEqual(r.json['achievement_app_ids'], [10])
        self.assertEqual(Game.query.filter_by(app_id=20).first().total_achievements, 0)

    def test_sync_games_marks_unchecked_as_null(self):
        me = self.make_player('1')
        stale = self.make_game(30, 'Old')
        counted = self.make_game(40, 'Counted')
        counted.total_achievements = 12
        db.session.commit()
        self.sync_games(me, (10, True), (30, True), (40, True))
        db.session.expire_all()
        self.assertIsNone(Game.query.filter_by(app_id=10).first().total_achievements)
        self.assertIsNone(db.session.get(Game, stale.id).total_achievements)
        self.assertEqual(db.session.get(Game, counted.id).total_achievements, 12)

    def test_empty_schema_records_zero(self):
        me = self.make_player('1')
        self.sync_games(me, (10, True))
        with patch(f'{SVC}.get_game_achievements_schema', return_value=[]):
            r = self.client.post('/api/sync/achievements/10', headers=self.auth(me))
        self.assertEqual(r.status_code, 200)
        db.session.expire_all()
        self.assertEqual(Game.query.filter_by(app_id=10).first().total_achievements, 0)

    def test_empty_schema_does_not_zero_a_game_with_achievements(self):
        me, _ = self.unlocked_setup()
        game = Game.query.filter_by(app_id=10).first()
        game.total_achievements = 1
        db.session.commit()
        with patch(f'{SVC}.get_game_achievements_schema', return_value=[]):
            r = self.client.post('/api/sync/achievements/10', headers=self.auth(me))
        self.assertEqual(r.status_code, 200)
        db.session.expire_all()
        self.assertEqual(Game.query.filter_by(app_id=10).first().total_achievements, 1)

    def test_failure_leaves_total_null(self):
        me = self.make_player('1')
        self.sync_games(me, (10, True))
        r = self.sync_with(me, get_game_achievements_schema={'side_effect': SteamAPIError(status=500)})
        self.assertEqual(r.status_code, 502)
        db.session.expire_all()
        self.assertIsNone(Game.query.filter_by(app_id=10).first().total_achievements)

    def test_sync_games_failure_reports_status(self):
        me = self.make_player('1')
        with patch(f'{SVC}.get_owned_games', side_effect=SteamAPIError(status=429)):
            r = self.client.post('/api/sync/games', headers=self.auth(me))
        self.assertEqual(r.status_code, 429)
