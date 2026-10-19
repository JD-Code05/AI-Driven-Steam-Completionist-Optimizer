from flask import Blueprint, request, jsonify
from ..models.achievement import Achievement
from ..utils.auth import auth_required

achievements_bp = Blueprint('achievements', __name__)


@achievements_bp.route('', methods=['GET'])
@auth_required
def list_achievements():
    game_id = request.args.get('game_id', type=int)
    if not game_id:
        return jsonify({'error': 'game_id query parameter is required'}), 400

    achievements = Achievement.query.filter_by(game_id=game_id).order_by(
        Achievement.global_percent.desc()
    ).all()
    return jsonify([a.to_dict() for a in achievements])
