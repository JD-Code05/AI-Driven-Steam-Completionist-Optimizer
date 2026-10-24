from app.extensions import db
from app.models.achievement import Achievement
from app.models.data_source import DataSource
from app.models.player_achievement import PlayerAchievement
from app.models.player_game import PlayerGame
from tests.base import BaseTestCase


class AccessTests(BaseTestCase):
    PROTECTED = [('GET', '/api/games/1'), ('GET', '/api/games'), ('GET', '/api/achievements?game_id=1'),
                 ('GET', '/api/player-games'), ('PUT', '/api/player-games/1'),
                 ('GET', '/api/player-achievements?game_id=1'), ('GET', '/api/data-sources?game_id=1'),
                 ('POST', '/api/data-sources'), ('PUT', '/api/data-sources/1'),
                 ('DELETE', '/api/data-sources/1'), ('GET', '/api/steamgriddb/grid/1')]
    REMOVED = [('GET', '/api/players'), ('DELETE', '/api/players/1'), ('POST', '/api/games'),
               ('DELETE', '/api/games/1'), ('POST', '/api/achievements'),
               ('DELETE', '/api/player-games/1'), ('POST', '/api/player-achievements')]

    def setUp(self):
        super().setUp()
        self.a = self.make_player('1')
        self.b = self.make_player('2')
        self.game_a = self.make_game(10, 'Game A')
        self.game_b = self.make_game(20, 'Game B')
        self.pg_a = PlayerGame(player_id=self.a.id, game_id=self.game_a.id)
        self.pg_b = PlayerGame(player_id=self.b.id, game_id=self.game_b.id)
        db.session.add_all([self.pg_a, self.pg_b])
        db.session.commit()

    def test_protected_routes_need_login(self):
        for method, path in self.PROTECTED:
            with self.subTest(path=path):
                self.assertEqual(self.client.open(path, method=method).status_code, 401)

    def test_removed_routes_are_gone(self):
        for method, path in self.REMOVED:
            with self.subTest(path=path):
                status = self.client.open(path, method=method, headers=self.auth(self.a)).status_code
                self.assertIn(status, (404, 405))

    def test_player_games_only_lists_callers_games(self):
        # a asks for b's list via the old player_id parameter
        r = self.client.get(f'/api/player-games?player_id={self.b.id}', headers=self.auth(self.a))
        self.assertEqual([pg['game_id'] for pg in r.json], [self.game_a.id])

    def test_cannot_track_someone_elses_game(self):
        r = self.client.put(f'/api/player-games/{self.pg_b.id}', json={'is_tracked': True},
                            headers=self.auth(self.a))
        self.assertEqual(r.status_code, 404)

    def test_can_track_own_game_but_not_edit_playtime(self):
        r = self.client.put(f'/api/player-games/{self.pg_a.id}',
                            json={'is_tracked': True, 'playtime_hours': 999}, headers=self.auth(self.a))
        self.assertEqual(r.status_code, 200)
        pg = db.session.get(PlayerGame, self.pg_a.id)
        self.assertTrue(pg.is_tracked)
        self.assertEqual(float(pg.playtime_hours or 0), 0.0)

    def test_player_achievements_are_callers_only(self):
        # b has an unlocked achievement in a game a also owns
        db.session.add(PlayerGame(player_id=self.b.id, game_id=self.game_a.id))
        ach = Achievement(game_id=self.game_a.id, api_name='ACH')
        db.session.add(ach)
        db.session.commit()
        db.session.add(PlayerAchievement(player_id=self.b.id, achievement_id=ach.id, unlocked=True))
        db.session.commit()
        r = self.client.get(f'/api/player-achievements?game_id={self.game_a.id}&player_id={self.b.id}',
                            headers=self.auth(self.a))
        self.assertEqual(r.json, [])

    def test_data_source_writes_need_game_in_library(self):
        r = self.client.post('/api/data-sources', json={'game_id': self.game_b.id, 'url': 'https://x.example'},
                             headers=self.auth(self.a))
        self.assertEqual(r.status_code, 404)

        source = DataSource(game_id=self.game_b.id, url='https://y.example')
        db.session.add(source)
        db.session.commit()
        self.assertEqual(self.client.put(f'/api/data-sources/{source.id}', json={'title': 'x'},
                                         headers=self.auth(self.a)).status_code, 404)
        self.assertEqual(self.client.delete(f'/api/data-sources/{source.id}',
                                            headers=self.auth(self.a)).status_code, 404)

    def test_data_source_owner_can_create(self):
        r = self.client.post('/api/data-sources', json={'game_id': self.game_a.id, 'url': 'https://x.example'},
                             headers=self.auth(self.a))
        self.assertEqual(r.status_code, 201)

    def test_data_source_url_must_be_http(self):
        for url in ['javascript:alert(1)', 'file:///etc/passwd', 'https://', 123]:
            with self.subTest(url=url):
                r = self.client.post('/api/data-sources', json={'game_id': self.game_a.id, 'url': url},
                                     headers=self.auth(self.a))
                self.assertEqual(r.status_code, 400)

        source = DataSource(game_id=self.game_a.id, url='https://y.example')
        db.session.add(source)
        db.session.commit()
        r = self.client.put(f'/api/data-sources/{source.id}', json={'url': 'javascript:alert(1)'},
                            headers=self.auth(self.a))
        self.assertEqual(r.status_code, 400)
        self.assertEqual(db.session.get(DataSource, source.id).url, 'https://y.example')
