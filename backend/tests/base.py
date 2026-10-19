import unittest

from app import create_app
from app.config import Config
from app.extensions import db
from app.models.game import Game
from app.models.player import Player
from app.utils.auth import generate_token


class TestConfig(Config):
    SQLALCHEMY_DATABASE_URI = 'sqlite://'
    TESTING = True
    SECRET_KEY = 'test-secret'
    FRONTEND_URL = 'http://localhost:3000'


class BaseTestCase(unittest.TestCase):
    def setUp(self):
        self.app = create_app(TestConfig)
        self.ctx = self.app.app_context()
        self.ctx.push()
        db.create_all()
        self.client = self.app.test_client()

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.ctx.pop()

    def make_player(self, steam_id):
        player = Player(steam_id=steam_id, persona_name=f'player-{steam_id}')
        db.session.add(player)
        db.session.commit()
        return player

    def make_game(self, app_id, name):
        game = Game(app_id=app_id, name=name)
        db.session.add(game)
        db.session.commit()
        return game

    def auth(self, player):
        return {'Authorization': f'Bearer {generate_token(player.id, player.steam_id)}'}
