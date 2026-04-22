import re
import urllib.parse
import requests
from flask import Blueprint, request, jsonify, redirect, current_app
from ..extensions import db
from ..models.player import Player
from ..utils.auth import generate_token, decode_token

auth_bp = Blueprint('auth', __name__)

STEAM_OPENID_URL = 'https://steamcommunity.com/openid/login'


@auth_bp.route('/login', methods=['GET'])
def login():
    """Redirect user to Steam OpenID login page."""
    return_url = request.args.get('return_url', 'http://localhost:3000')

    callback_url = request.host_url.rstrip('/') + '/api/auth/callback'
    callback_url += '?' + urllib.parse.urlencode({'return_url': return_url})

    params = {
        'openid.ns': 'http://specs.openid.net/auth/2.0',
        'openid.mode': 'checkid_setup',
        'openid.return_to': callback_url,
        'openid.realm': request.host_url,
        'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
        'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
    }
    steam_login_url = STEAM_OPENID_URL + '?' + urllib.parse.urlencode(params)
    return redirect(steam_login_url)


@auth_bp.route('/callback', methods=['GET'])
def callback():
    """Handle Steam OpenID callback, validate, create/update player, return JWT."""
    return_url = request.args.get('return_url', 'http://localhost:3000')

    # Validate the OpenID response with Steam
    validation_params = dict(request.args)
    validation_params['openid.mode'] = 'check_authentication'

    try:
        resp = requests.post(STEAM_OPENID_URL, data=validation_params, timeout=10)
    except requests.RequestException:
        return redirect(return_url + '?error=steam_validation_failed')

    if 'is_valid:true' not in resp.text:
        return redirect(return_url + '?error=invalid_steam_login')

    # Extract Steam ID from claimed_id
    claimed_id = request.args.get('openid.claimed_id', '')
    match = re.search(r'steamcommunity\.com/openid/id/(\d+)', claimed_id)
    if not match:
        return redirect(return_url + '?error=no_steam_id')

    steam_id = match.group(1)

    # Fetch player profile from Steam API
    from ..services.steam_api import SteamAPIService
    steam_service = SteamAPIService()
    profile = steam_service.get_player_summary(steam_id)

    # Create or update player in DB
    player = Player.query.filter_by(steam_id=steam_id).first()
    if player:
        if profile:
            player.persona_name = profile['persona_name']
            player.avatar_url = profile['avatar_url']
            player.profile_url = profile['profile_url']
    else:
        player = Player(
            steam_id=steam_id,
            persona_name=profile['persona_name'] if profile else steam_id,
            avatar_url=profile['avatar_url'] if profile else None,
            profile_url=profile['profile_url'] if profile else None,
        )
        db.session.add(player)

    db.session.commit()

    # Generate JWT
    token = generate_token(player.id, player.steam_id)

    # Redirect to frontend with token
    separator = '&' if '?' in return_url else '?'
    return redirect(f"{return_url}{separator}token={token}")


@auth_bp.route('/me', methods=['GET'])
def me():
    """Get current authenticated player info."""
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return jsonify({'error': 'Not authenticated'}), 401

    token = auth_header.split(' ', 1)[1]
    payload = decode_token(token)
    if not payload:
        return jsonify({'error': 'Invalid or expired token'}), 401

    player = db.session.get(Player, payload['player_id'])
    if not player:
        return jsonify({'error': 'Player not found'}), 404

    return jsonify(player.to_dict())


@auth_bp.route('/logout', methods=['POST'])
def logout():
    """Client-side logout — just acknowledge. JWT is stateless."""
    return jsonify({'message': 'Logged out successfully'})
