from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from ..extensions import db
from ..models.data_source import DataSource
from ..models.game import Game

data_sources_bp = Blueprint('data_sources', __name__)


@data_sources_bp.route('', methods=['GET'])
def list_data_sources():
    game_id = request.args.get('game_id', type=int)
    if not game_id:
        return jsonify({'error': 'game_id query parameter is required'}), 400

    sources = DataSource.query.filter_by(game_id=game_id).order_by(
        DataSource.created_at.desc()
    ).all()
    return jsonify([s.to_dict() for s in sources])


@data_sources_bp.route('/<int:source_id>', methods=['GET'])
def get_data_source(source_id):
    source = db.session.get(DataSource, source_id)
    if not source:
        return jsonify({'error': 'Data source not found'}), 404
    return jsonify(source.to_dict())


@data_sources_bp.route('', methods=['POST'])
def create_data_source():
    data = request.get_json()
    if not data or not data.get('game_id') or not data.get('url'):
        return jsonify({'error': 'game_id and url are required'}), 400

    source = DataSource(
        game_id=data['game_id'],
        url=data['url'],
        title=data.get('title'),
        source_type=data.get('source_type', 'other'),
        is_auto=data.get('is_auto', False),
    )
    db.session.add(source)
    db.session.commit()
    return jsonify(source.to_dict()), 201


@data_sources_bp.route('/<int:source_id>', methods=['PUT'])
def update_data_source(source_id):
    source = db.session.get(DataSource, source_id)
    if not source:
        return jsonify({'error': 'Data source not found'}), 404

    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    for field in ['url', 'title', 'source_type']:
        if field in data:
            setattr(source, field, data[field])

    db.session.commit()
    return jsonify(source.to_dict())


@data_sources_bp.route('/<int:source_id>', methods=['DELETE'])
def delete_data_source(source_id):
    source = db.session.get(DataSource, source_id)
    if not source:
        return jsonify({'error': 'Data source not found'}), 404

    db.session.delete(source)
    db.session.commit()
    return jsonify({'message': 'Data source deleted'}), 200

