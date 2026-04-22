from flask import Blueprint, request, jsonify
from ..extensions import db
from ..models.game import Game

games_bp = Blueprint('games', __name__)


@games_bp.route('', methods=['GET'])
def list_games():
    games = Game.query.all()
    return jsonify([g.to_dict() for g in games])


@games_bp.route('/<int:game_id>', methods=['GET'])
def get_game(game_id):
    game = db.session.get(Game, game_id)
    if not game:
        return jsonify({'error': 'Game not found'}), 404
    return jsonify(game.to_dict())


@games_bp.route('', methods=['POST'])
def create_game():
    data = request.get_json()
    if not data or not data.get('app_id'):
        return jsonify({'error': 'app_id is required'}), 400

    existing = Game.query.filter_by(app_id=data['app_id']).first()
    if existing:
        return jsonify({'error': 'Game with this app_id already exists'}), 409

    game = Game(
        app_id=data['app_id'],
        name=data.get('name'),
        img_icon_url=data.get('img_icon_url'),
        img_logo_url=data.get('img_logo_url'),
        total_achievements=data.get('total_achievements', 0),
    )
    db.session.add(game)
    db.session.commit()
    return jsonify(game.to_dict()), 201


@games_bp.route('/<int:game_id>', methods=['PUT'])
def update_game(game_id):
    game = db.session.get(Game, game_id)
    if not game:
        return jsonify({'error': 'Game not found'}), 404

    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    if 'name' in data:
        game.name = data['name']
    if 'img_icon_url' in data:
        game.img_icon_url = data['img_icon_url']
    if 'img_logo_url' in data:
        game.img_logo_url = data['img_logo_url']
    if 'total_achievements' in data:
        game.total_achievements = data['total_achievements']

    db.session.commit()
    return jsonify(game.to_dict())


@games_bp.route('/<int:game_id>', methods=['DELETE'])
def delete_game(game_id):
    game = db.session.get(Game, game_id)
    if not game:
        return jsonify({'error': 'Game not found'}), 404

    db.session.delete(game)
    db.session.commit()
    return jsonify({'message': 'Game deleted'}), 200
