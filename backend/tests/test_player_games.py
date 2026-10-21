from datetime import datetime

from app.extensions import db
from app.models.achievement import Achievement
from app.models.player_achievement import PlayerAchievement
from app.models.player_game import PlayerGame
from tests.base import BaseTestCase


class PlayerGamesTests(BaseTestCase):
    def test_unlocked_count_per_game(self):
        me = self.make_player('1')
        other = self.make_player('2')
        x = self.make_game(10, 'X')
        y = self.make_game(20, 'Y')
        db.session.add_all([PlayerGame(player_id=me.id, game_id=x.id), PlayerGame(player_id=me.id, game_id=y.id)])
        achs = [Achievement(game_id=x.id, api_name=f'ACH{i}') for i in range(3)]
        db.session.add_all(achs)
        db.session.commit()
        db.session.add_all([
            PlayerAchievement(player_id=me.id, achievement_id=achs[0].id, unlocked=True),
            PlayerAchievement(player_id=me.id, achievement_id=achs[1].id, unlocked=True),
            PlayerAchievement(player_id=me.id, achievement_id=achs[2].id, unlocked=False),
            PlayerAchievement(player_id=other.id, achievement_id=achs[2].id, unlocked=True),
        ])
        db.session.commit()

        r = self.client.get('/api/player-games', headers=self.auth(me))
        counts = {pg['game_id']: pg['unlocked_count'] for pg in r.json}
        self.assertEqual(counts, {x.id: 2, y.id: 0})

    def test_completed_at_is_latest_own_unlock(self):
        me = self.make_player('1')
        other = self.make_player('2')
        x = self.make_game(10, 'X')
        y = self.make_game(20, 'Y')
        db.session.add_all([PlayerGame(player_id=me.id, game_id=x.id), PlayerGame(player_id=me.id, game_id=y.id)])
        achs = [Achievement(game_id=x.id, api_name=f'ACH{i}') for i in range(3)]
        db.session.add_all(achs)
        db.session.commit()
        db.session.add_all([
            PlayerAchievement(player_id=me.id, achievement_id=achs[0].id, unlocked=True, unlock_time=datetime(2026, 3, 1)),
            PlayerAchievement(player_id=me.id, achievement_id=achs[1].id, unlocked=True, unlock_time=datetime(2026, 5, 9, 14, 30)),
            PlayerAchievement(player_id=other.id, achievement_id=achs[2].id, unlocked=True, unlock_time=datetime(2026, 9, 1)),
        ])
        db.session.commit()

        r = self.client.get('/api/player-games', headers=self.auth(me))
        done = {pg['game_id']: pg['completed_at'] for pg in r.json}
        self.assertEqual(done, {x.id: '2026-05-09T14:30:00', y.id: None})
