from flask import Blueprint, request, jsonify
from ..extensions import db
from ..models.achievement import Achievement

achievements_bp = Blueprint('achievements', __name__)


@achievements_bp.route('', methods=['GET'])
def list_achievements():
    game_id = request.args.get('game_id', type=int)
    if not game_id:
        return jsonify({'error': 'game_id query parameter is required'}), 400

    achievements = Achievement.query.filter_by(game_id=game_id).order_by(
        Achievement.global_percent.desc()
    ).all()
    return jsonify([a.to_dict() for a in achievements])


@achievements_bp.route('/<int:ach_id>', methods=['GET'])
def get_achievement(ach_id):
    ach = db.session.get(Achievement, ach_id)
    if not ach:
        return jsonify({'error': 'Achievement not found'}), 404
    return jsonify(ach.to_dict())


@achievements_bp.route('', methods=['POST'])
def create_achievement():
    data = request.get_json()
    if not data or not data.get('game_id') or not data.get('api_name'):
        return jsonify({'error': 'game_id and api_name are required'}), 400

    existing = Achievement.query.filter_by(
        game_id=data['game_id'], api_name=data['api_name']
    ).first()
    if existing:
        return jsonify({'error': 'Achievement already exists for this game'}), 409

    ach = Achievement(
        game_id=data['game_id'],
        api_name=data['api_name'],
        display_name=data.get('display_name'),
        description=data.get('description'),
        icon_url=data.get('icon_url'),
        icon_gray_url=data.get('icon_gray_url'),
        global_percent=data.get('global_percent', 0),
    )
    db.session.add(ach)
    db.session.commit()
    return jsonify(ach.to_dict()), 201


@achievements_bp.route('/<int:ach_id>', methods=['PUT'])
def update_achievement(ach_id):
    ach = db.session.get(Achievement, ach_id)
    if not ach:
        return jsonify({'error': 'Achievement not found'}), 404

    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    for field in ['display_name', 'description', 'icon_url', 'icon_gray_url', 'global_percent']:
        if field in data:
            setattr(ach, field, data[field])

    db.session.commit()
    return jsonify(ach.to_dict())


@achievements_bp.route('/<int:ach_id>', methods=['DELETE'])
def delete_achievement(ach_id):
    ach = db.session.get(Achievement, ach_id)
    if not ach:
        return jsonify({'error': 'Achievement not found'}), 404

    db.session.delete(ach)
    db.session.commit()
    return jsonify({'message': 'Achievement deleted'}), 200
