from flask import Blueprint, request, jsonify
from ..extensions import db
from ..models.player import Player

players_bp = Blueprint('players', __name__)


@players_bp.route('', methods=['GET'])
def list_players():
    players = Player.query.all()
    return jsonify([p.to_dict() for p in players])


@players_bp.route('/<int:player_id>', methods=['GET'])
def get_player(player_id):
    player = db.session.get(Player, player_id)
    if not player:
        return jsonify({'error': 'Player not found'}), 404
    return jsonify(player.to_dict())


@players_bp.route('', methods=['POST'])
def create_player():
    data = request.get_json()
    if not data or not data.get('steam_id'):
        return jsonify({'error': 'steam_id is required'}), 400

    existing = Player.query.filter_by(steam_id=data['steam_id']).first()
    if existing:
        return jsonify({'error': 'Player with this steam_id already exists'}), 409

    player = Player(
        steam_id=data['steam_id'],
        persona_name=data.get('persona_name'),
        avatar_url=data.get('avatar_url'),
        profile_url=data.get('profile_url'),
    )
    db.session.add(player)
    db.session.commit()
    return jsonify(player.to_dict()), 201


@players_bp.route('/<int:player_id>', methods=['PUT'])
def update_player(player_id):
    player = db.session.get(Player, player_id)
    if not player:
        return jsonify({'error': 'Player not found'}), 404

    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    if 'persona_name' in data:
        player.persona_name = data['persona_name']
    if 'avatar_url' in data:
        player.avatar_url = data['avatar_url']
    if 'profile_url' in data:
        player.profile_url = data['profile_url']

    db.session.commit()
    return jsonify(player.to_dict())


@players_bp.route('/<int:player_id>', methods=['DELETE'])
def delete_player(player_id):
    player = db.session.get(Player, player_id)
    if not player:
        return jsonify({'error': 'Player not found'}), 404

    db.session.delete(player)
    db.session.commit()
    return jsonify({'message': 'Player deleted'}), 200
