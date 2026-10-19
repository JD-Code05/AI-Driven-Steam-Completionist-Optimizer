from flask import Blueprint, jsonify
from ..extensions import db
from ..models.game import Game
from ..utils.auth import auth_required

games_bp = Blueprint('games', __name__)


@games_bp.route('', methods=['GET'])
@auth_required
def list_games():
    games = Game.query.all()
    return jsonify([g.to_dict() for g in games])


@games_bp.route('/<int:game_id>', methods=['GET'])
@auth_required
def get_game(game_id):
    game = db.session.get(Game, game_id)
    if not game:
        return jsonify({'error': 'Game not found'}), 404
    return jsonify(game.to_dict())
