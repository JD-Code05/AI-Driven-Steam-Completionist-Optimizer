from flask import Blueprint, jsonify
from ..services.steamgriddb import SteamGridDBService
from ..utils.auth import auth_required

steamgriddb_bp = Blueprint('steamgriddb', __name__)


@steamgriddb_bp.route('/grid/<int:app_id>', methods=['GET'])
@auth_required
def get_grid_image(app_id):
    """
    Return the best high-quality portrait grid image URL for a game
    from SteamGridDB, identified by its Steam app ID.

    Falls back gracefully if the API key is missing or no image is found.
    """
    service = SteamGridDBService()
    url = service.get_grid_image_url(app_id)

    if not url:
        # Try the hero image as a secondary option
        url = service.get_hero_image_url(app_id)

    if not url:
        return jsonify({'url': None, 'source': 'none'}), 200

    return jsonify({'url': url, 'source': 'steamgriddb'}), 200
