from flask import Blueprint, request, jsonify
from ..extensions import db
from ..models.player_game import PlayerGame
from ..utils.auth import auth_required

player_games_bp = Blueprint('player_games', __name__)


@player_games_bp.route('', methods=['GET'])
@auth_required
def list_player_games():
    query = PlayerGame.query.filter_by(player_id=request.player_id)

    tracked_only = request.args.get('tracked', type=str)
    if tracked_only and tracked_only.lower() == 'true':
        query = query.filter_by(is_tracked=True)

    results = query.all()
    return jsonify([pg.to_dict() for pg in results])


@player_games_bp.route('/<int:pg_id>', methods=['PUT'])
@auth_required
def update_player_game(pg_id):
    pg = db.session.get(PlayerGame, pg_id)
    if not pg or pg.player_id != request.player_id:
        return jsonify({'error': 'Player-game record not found'}), 404

    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    if 'is_tracked' in data:
        pg.is_tracked = data['is_tracked']

    db.session.commit()
    return jsonify(pg.to_dict())
