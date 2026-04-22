from flask import Blueprint, request, jsonify
from ..extensions import db
from ..models.player_achievement import PlayerAchievement

player_achievements_bp = Blueprint('player_achievements', __name__)


@player_achievements_bp.route('', methods=['GET'])
def list_player_achievements():
    player_id = request.args.get('player_id', type=int)
    game_id = request.args.get('game_id', type=int)

    if not player_id:
        return jsonify({'error': 'player_id query parameter is required'}), 400

    query = PlayerAchievement.query.filter_by(player_id=player_id)

    if game_id:
        query = query.join(PlayerAchievement.achievement).filter_by(game_id=game_id)

    unlocked_only = request.args.get('unlocked', type=str)
    if unlocked_only and unlocked_only.lower() == 'true':
        query = query.filter(PlayerAchievement.unlocked.is_(True))

    results = query.all()
    return jsonify([pa.to_dict() for pa in results])


@player_achievements_bp.route('/<int:pa_id>', methods=['GET'])
def get_player_achievement(pa_id):
    pa = db.session.get(PlayerAchievement, pa_id)
    if not pa:
        return jsonify({'error': 'Player achievement not found'}), 404
    return jsonify(pa.to_dict())


@player_achievements_bp.route('', methods=['POST'])
def create_player_achievement():
    data = request.get_json()
    if not data or not data.get('player_id') or not data.get('achievement_id'):
        return jsonify({'error': 'player_id and achievement_id are required'}), 400

    existing = PlayerAchievement.query.filter_by(
        player_id=data['player_id'], achievement_id=data['achievement_id']
    ).first()
    if existing:
        return jsonify({'error': 'Player achievement record already exists'}), 409

    pa = PlayerAchievement(
        player_id=data['player_id'],
        achievement_id=data['achievement_id'],
        unlocked=data.get('unlocked', False),
        unlock_time=data.get('unlock_time'),
    )
    db.session.add(pa)
    db.session.commit()
    return jsonify(pa.to_dict()), 201


@player_achievements_bp.route('/<int:pa_id>', methods=['PUT'])
def update_player_achievement(pa_id):
    pa = db.session.get(PlayerAchievement, pa_id)
    if not pa:
        return jsonify({'error': 'Player achievement not found'}), 404

    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    if 'unlocked' in data:
        pa.unlocked = data['unlocked']
    if 'unlock_time' in data:
        pa.unlock_time = data['unlock_time']

    db.session.commit()
    return jsonify(pa.to_dict())


@player_achievements_bp.route('/<int:pa_id>', methods=['DELETE'])
def delete_player_achievement(pa_id):
    pa = db.session.get(PlayerAchievement, pa_id)
    if not pa:
        return jsonify({'error': 'Player achievement not found'}), 404

    db.session.delete(pa)
    db.session.commit()
    return jsonify({'message': 'Player achievement deleted'}), 200
