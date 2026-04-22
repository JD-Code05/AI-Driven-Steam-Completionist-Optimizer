from flask import Blueprint, request, jsonify
from ..extensions import db
from ..models.optimization_route import OptimizationRoute

optimization_routes_bp = Blueprint('optimization_routes', __name__)


@optimization_routes_bp.route('', methods=['GET'])
def list_optimization_routes():
    player_id = request.args.get('player_id', type=int)
    game_id = request.args.get('game_id', type=int)

    query = OptimizationRoute.query
    if player_id:
        query = query.filter_by(player_id=player_id)
    if game_id:
        query = query.filter_by(game_id=game_id)

    routes = query.order_by(OptimizationRoute.updated_at.desc()).all()
    return jsonify([r.to_dict() for r in routes])


@optimization_routes_bp.route('/<int:route_id>', methods=['GET'])
def get_optimization_route(route_id):
    route = db.session.get(OptimizationRoute, route_id)
    if not route:
        return jsonify({'error': 'Optimization route not found'}), 404
    return jsonify(route.to_dict())


@optimization_routes_bp.route('', methods=['POST'])
def create_optimization_route():
    data = request.get_json()
    if not data or not data.get('player_id') or not data.get('game_id'):
        return jsonify({'error': 'player_id and game_id are required'}), 400

    route = OptimizationRoute(
        player_id=data['player_id'],
        game_id=data['game_id'],
        summary_md=data.get('summary_md'),
        source_ids_used=data.get('source_ids_used'),
        model_used=data.get('model_used'),
        prompt_hash=data.get('prompt_hash'),
    )
    db.session.add(route)
    db.session.commit()
    return jsonify(route.to_dict()), 201


@optimization_routes_bp.route('/<int:route_id>', methods=['PUT'])
def update_optimization_route(route_id):
    route = db.session.get(OptimizationRoute, route_id)
    if not route:
        return jsonify({'error': 'Optimization route not found'}), 404

    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    for field in ['summary_md', 'source_ids_used', 'model_used', 'prompt_hash']:
        if field in data:
            setattr(route, field, data[field])

    db.session.commit()
    return jsonify(route.to_dict())


@optimization_routes_bp.route('/<int:route_id>', methods=['DELETE'])
def delete_optimization_route(route_id):
    route = db.session.get(OptimizationRoute, route_id)
    if not route:
        return jsonify({'error': 'Optimization route not found'}), 404

    db.session.delete(route)
    db.session.commit()
    return jsonify({'message': 'Optimization route deleted'}), 200
