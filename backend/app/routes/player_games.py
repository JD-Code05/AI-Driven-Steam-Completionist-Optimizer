from flask import Blueprint, request, jsonify
from ..extensions import db
from ..models.player_game import PlayerGame

player_games_bp = Blueprint('player_games', __name__)


@player_games_bp.route('', methods=['GET'])
def list_player_games():
    player_id = request.args.get('player_id', type=int)
    query = PlayerGame.query
    if player_id:
        query = query.filter_by(player_id=player_id)

    tracked_only = request.args.get('tracked', type=str)
    if tracked_only and tracked_only.lower() == 'true':
        query = query.filter_by(is_tracked=True)

    results = query.all()
    return jsonify([pg.to_dict() for pg in results])


@player_games_bp.route('/<int:pg_id>', methods=['GET'])
def get_player_game(pg_id):
    pg = db.session.get(PlayerGame, pg_id)
    if not pg:
        return jsonify({'error': 'Player-game record not found'}), 404
    return jsonify(pg.to_dict())


@player_games_bp.route('', methods=['POST'])
def create_player_game():
    data = request.get_json()
    if not data or not data.get('player_id') or not data.get('game_id'):
        return jsonify({'error': 'player_id and game_id are required'}), 400

    existing = PlayerGame.query.filter_by(
        player_id=data['player_id'], game_id=data['game_id']
    ).first()
    if existing:
        return jsonify({'error': 'Player-game association already exists'}), 409

    pg = PlayerGame(
        player_id=data['player_id'],
        game_id=data['game_id'],
        playtime_hours=data.get('playtime_hours', 0),
        is_tracked=data.get('is_tracked', False),
    )
    db.session.add(pg)
    db.session.commit()
    return jsonify(pg.to_dict()), 201


@player_games_bp.route('/<int:pg_id>', methods=['PUT'])
def update_player_game(pg_id):
    pg = db.session.get(PlayerGame, pg_id)
    if not pg:
        return jsonify({'error': 'Player-game record not found'}), 404

    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    if 'playtime_hours' in data:
        pg.playtime_hours = data['playtime_hours']
    if 'is_tracked' in data:
        pg.is_tracked = data['is_tracked']

    db.session.commit()
    return jsonify(pg.to_dict())


@player_games_bp.route('/<int:pg_id>', methods=['DELETE'])
def delete_player_game(pg_id):
    pg = db.session.get(PlayerGame, pg_id)
    if not pg:
        return jsonify({'error': 'Player-game record not found'}), 404

    db.session.delete(pg)
    db.session.commit()
    return jsonify({'message': 'Player-game association deleted'}), 200
