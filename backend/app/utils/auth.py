import jwt
import datetime
from functools import wraps
from flask import request, jsonify, current_app


def generate_token(player_id, steam_id):
    """Generate a JWT token for a player."""
    payload = {
        'player_id': player_id,
        'steam_id': steam_id,
        'exp': datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(
            hours=current_app.config['JWT_EXPIRATION_HOURS']
        ),
        'iat': datetime.datetime.now(datetime.timezone.utc),
    }
    return jwt.encode(
        payload,
        current_app.config['SECRET_KEY'],
        algorithm=current_app.config['JWT_ALGORITHM'],
    )


def decode_token(token):
    """Decode and validate a JWT token. Returns payload or None."""
    try:
        return jwt.decode(
            token,
            current_app.config['SECRET_KEY'],
            algorithms=[current_app.config['JWT_ALGORITHM']],
        )
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None


def auth_required(f):
    """Decorator to require JWT authentication on a route."""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.split(' ', 1)[1]

        if not token:
            return jsonify({'error': 'Authentication required'}), 401

        payload = decode_token(token)
        if not payload:
            return jsonify({'error': 'Invalid or expired token'}), 401

        request.player_id = payload['player_id']
        request.steam_id = payload['steam_id']
        return f(*args, **kwargs)

    return decorated
