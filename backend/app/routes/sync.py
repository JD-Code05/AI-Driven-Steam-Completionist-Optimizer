from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from ..extensions import db
from ..models.game import Game
from ..models.player_game import PlayerGame
from ..models.achievement import Achievement
from ..models.player_achievement import PlayerAchievement
from ..services.steam_api import SteamAPIService
from ..utils.auth import auth_required

sync_bp = Blueprint('sync', __name__)


@sync_bp.route('/games', methods=['POST'])
@auth_required
def sync_games():
    """Fetch and upsert all owned games for the authenticated player."""
    steam_service = SteamAPIService()
    owned_games = steam_service.get_owned_games(request.steam_id)

    if not owned_games:
        return jsonify({'message': 'No games found or profile is private', 'synced': 0})

    synced_count = 0
    for g in owned_games:
        # Upsert game
        game = Game.query.filter_by(app_id=g['app_id']).first()
        if not game:
            game = Game(
                app_id=g['app_id'],
                name=g['name'],
                img_icon_url=g['img_icon_url'],
                img_logo_url=g['img_logo_url'],
            )
            db.session.add(game)
            db.session.flush()
        else:
            game.name = g['name'] or game.name
            if g['img_icon_url']:
                game.img_icon_url = g['img_icon_url']
            if g['img_logo_url']:
                game.img_logo_url = g['img_logo_url']

        # Upsert player-game association
        pg = PlayerGame.query.filter_by(
            player_id=request.player_id, game_id=game.id
        ).first()
        if not pg:
            pg = PlayerGame(
                player_id=request.player_id,
                game_id=game.id,
                playtime_hours=round(g['playtime_minutes'] / 60, 1),
                last_synced=datetime.now(timezone.utc),
            )
            db.session.add(pg)
        else:
            pg.playtime_hours = round(g['playtime_minutes'] / 60, 1)
            pg.last_synced = datetime.now(timezone.utc)

        synced_count += 1

    db.session.commit()
    return jsonify({'message': f'Synced {synced_count} games', 'synced': synced_count})


@sync_bp.route('/achievements/<int:app_id>', methods=['POST'])
@auth_required
def sync_achievements(app_id):
    """Fetch and upsert achievements + player progress for a specific game."""
    game = Game.query.filter_by(app_id=app_id).first()
    if not game:
        return jsonify({'error': f'Game with app_id {app_id} not found. Sync games first.'}), 404

    steam_service = SteamAPIService()

    # 1. Get achievement schema (definitions)
    schema = steam_service.get_game_achievements_schema(app_id)
    if not schema:
        return jsonify({'message': 'No achievements found for this game', 'synced': 0})

    # 2. Get global percentages
    global_pcts = steam_service.get_global_achievement_percentages(app_id)

    # 3. Get player's achievement status
    player_achs = steam_service.get_player_achievements(request.steam_id, app_id)
    player_ach_map = {a['api_name']: a for a in player_achs}

    # 4. Upsert achievements and player progress
    synced_count = 0
    for ach_def in schema:
        api_name = ach_def['api_name']

        # Upsert achievement definition
        achievement = Achievement.query.filter_by(
            game_id=game.id, api_name=api_name
        ).first()
        if not achievement:
            achievement = Achievement(
                game_id=game.id,
                api_name=api_name,
                display_name=ach_def['display_name'],
                description=ach_def['description'],
                icon_url=ach_def['icon_url'],
                icon_gray_url=ach_def['icon_gray_url'],
                global_percent=global_pcts.get(api_name, 0),
            )
            db.session.add(achievement)
            db.session.flush()
        else:
            achievement.display_name = ach_def['display_name'] or achievement.display_name
            achievement.description = ach_def['description'] or achievement.description
            achievement.icon_url = ach_def['icon_url'] or achievement.icon_url
            achievement.icon_gray_url = ach_def['icon_gray_url'] or achievement.icon_gray_url
            achievement.global_percent = global_pcts.get(api_name, achievement.global_percent)

        # Upsert player achievement status
        player_data = player_ach_map.get(api_name)
        pa = PlayerAchievement.query.filter_by(
            player_id=request.player_id, achievement_id=achievement.id
        ).first()

        unlocked = player_data['achieved'] if player_data else False
        unlock_time = None
        if player_data and player_data['unlock_time'] and player_data['unlock_time'] > 0:
            unlock_time = datetime.fromtimestamp(player_data['unlock_time'], tz=timezone.utc)

        if not pa:
            pa = PlayerAchievement(
                player_id=request.player_id,
                achievement_id=achievement.id,
                unlocked=unlocked,
                unlock_time=unlock_time,
            )
            db.session.add(pa)
        else:
            pa.unlocked = unlocked
            if unlock_time:
                pa.unlock_time = unlock_time

        synced_count += 1

    # Update game's total achievements count
    game.total_achievements = len(schema)

    pg = PlayerGame.query.filter_by(player_id=request.player_id, game_id=game.id).first()
    if pg:
        pg.last_synced = datetime.now(timezone.utc)

    db.session.commit()
    return jsonify({
        'message': f'Synced {synced_count} achievements for {game.name}',
        'synced': synced_count,
        'game': game.to_dict(),
    })
