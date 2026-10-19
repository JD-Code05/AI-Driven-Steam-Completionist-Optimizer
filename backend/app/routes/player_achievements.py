from flask import Blueprint, request, jsonify
from ..models.player_achievement import PlayerAchievement
from ..utils.auth import auth_required

player_achievements_bp = Blueprint('player_achievements', __name__)


@player_achievements_bp.route('', methods=['GET'])
@auth_required
def list_player_achievements():
    game_id = request.args.get('game_id', type=int)

    query = PlayerAchievement.query.filter_by(player_id=request.player_id)

    if game_id:
        query = query.join(PlayerAchievement.achievement).filter_by(game_id=game_id)

    unlocked_only = request.args.get('unlocked', type=str)
    if unlocked_only and unlocked_only.lower() == 'true':
        query = query.filter(PlayerAchievement.unlocked.is_(True))

    results = query.all()
    return jsonify([pa.to_dict() for pa in results])
