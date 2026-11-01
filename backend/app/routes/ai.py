import json
import logging
import time
from flask import Blueprint, request, jsonify
from ..extensions import db
from ..models.game import Game
from ..models.achievement import Achievement
from ..models.optimization_route import OptimizationRoute
from ..models.player_achievement import PlayerAchievement
from ..services.gemini import GeminiError, GeminiNotConfigured, generate_text, model_name
from ..services.guide_context import build_guide_context
from ..services.route_builder import ROUTE_SCHEMA, ROUTE_SYSTEM, build_route_prompt, output_limit, validate_route
from ..utils.auth import auth_required
from .data_sources import owns_game

logger = logging.getLogger(__name__)
ai_bp = Blueprint('ai', __name__)

ROUTE_SECONDS = 110  # scraping and every Gemini attempt must finish inside gunicorn's 120 s limit
MIN_ATTEMPT_SECONDS = 10


def saved_route(player_id, game_id):
    return OptimizationRoute.query.filter_by(player_id=player_id, game_id=game_id).first()


def route_response(row):
    return jsonify({
        'game_id': row.game_id,
        'route': json.loads(row.summary_md),
        'model_used': row.model_used,
        'source_ids_used': row.source_ids_used,
        'updated_at': row.updated_at.isoformat() if row.updated_at else None,
    })


@ai_bp.route('/routes/<int:game_id>', methods=['GET'])
@auth_required
def get_route(game_id):
    if not owns_game(game_id):
        return jsonify({'error': 'Game not found'}), 404
    row = saved_route(request.player_id, game_id)
    try:
        return route_response(row) if row else (jsonify({'error': 'No route yet'}), 404)
    except (TypeError, ValueError):
        return jsonify({'error': 'No route yet'}), 404


# shortcut: no limit on generations and the work runs inside the request, which is fine for one user; add a rate limit and a background job before other people can sign in
@ai_bp.route('/routes/<int:game_id>', methods=['POST'])
@auth_required
def generate_route(game_id):
    game = db.session.get(Game, game_id)
    if not game or not owns_game(game_id):
        return jsonify({'error': 'Game not found'}), 404

    achievements = Achievement.query.filter_by(game_id=game_id).all()
    if not achievements:
        return jsonify({'error': "Sync this game's achievements first"}), 400

    deadline = time.monotonic() + ROUTE_SECONDS

    unlocked_ids = {
        pa.achievement_id
        for pa in PlayerAchievement.query.filter_by(player_id=request.player_id, unlocked=True)
    }
    guide_text, source_ids = build_guide_context(game)
    prompt = build_route_prompt(game, achievements, unlocked_ids, guide_text)

    validated = None
    try:
        for _ in range(2):
            remaining = deadline - time.monotonic()
            if remaining < MIN_ATTEMPT_SECONDS:
                break
            # thinking would spend the output limit and the time large games need
            text = generate_text(
                ROUTE_SYSTEM, prompt, temperature=0.4,
                max_output_tokens=output_limit(len(achievements)), response_schema=ROUTE_SCHEMA,
                timeout_ms=int(remaining * 1000), thinking_budget=0,
            )
            try:
                validated = validate_route(json.loads(text), achievements)
                break
            except ValueError as e:
                logger.warning(f'Gemini returned an invalid route for game {game_id}: {e}')
    except GeminiNotConfigured:
        return jsonify({'error': 'GEMINI_API_KEY is not configured'}), 400
    except GeminiError as e:
        logger.error(f'Route generation error: {e}')
        return jsonify({'error': "Couldn't write a route right now. Try again."}), 502
    if validated is None:
        return jsonify({'error': "Couldn't write a valid route. Try again."}), 502

    row = saved_route(request.player_id, game_id)
    if not row:
        row = OptimizationRoute(player_id=request.player_id, game_id=game_id)
        db.session.add(row)
    row.summary_md = json.dumps(validated)
    row.source_ids_used = source_ids
    row.model_used = model_name()[:50]
    db.session.commit()
    return route_response(row)


@ai_bp.route('/achievement-tip/<int:achievement_id>', methods=['POST'])
@auth_required
def get_achievement_tip(achievement_id):
    """Generate a focused AI tip for a single achievement using Gemini + scraped guide context."""
    achievement = db.session.get(Achievement, achievement_id)
    if not achievement:
        return jsonify({'error': 'Achievement not found'}), 404

    game = achievement.game
    if not game:
        return jsonify({'error': 'Game not found for this achievement'}), 404

    # Check if the player has this achievement (for context)
    pa = PlayerAchievement.query.filter_by(
        player_id=request.player_id,
        achievement_id=achievement_id,
    ).first()
    already_unlocked = pa.unlocked if pa else False

    sources_context, _ = build_guide_context(game)

    # Build a focused, concise prompt for this one achievement
    status_str = "already unlocked ✅" if already_unlocked else "not yet unlocked 🔒"
    user_prompt = (
        f"# Game: {game.name}\n"
        f"# Achievement: {achievement.display_name}\n"
        f"  - API Name: {achievement.api_name}\n"
        f"  - Description: {achievement.description or 'Hidden achievement'}\n"
        f"  - Global Unlock Rate: {achievement.global_percent}% ({achievement.rarity_tier})\n"
        f"  - Player Status: {status_str}\n\n"
    )

    user_prompt += sources_context

    user_prompt += (
        "Based on the above, provide a focused guide for this single achievement.\n\n"
        "IMPORTANT: Generate ALL of the following sections in this exact order:\n"
        "1. How to Unlock - numbered steps\n"
        "2. Time Estimate - specific time range\n"
        "3. Important Warnings - any missable elements or prerequisites\n"
        "4. Pro Tips - tricks for faster completion\n\n"
        "Use markdown format with ## headers. Never skip any section."
    )

    ACHIEVEMENT_TIP_SYSTEM = (
        "You are a gaming achievement expert. Generate a clear, concise guide for a single achievement.\n\n"
        "CRITICAL: You MUST include ALL of the following sections in EXACTLY this order:\n\n"
        "## How to Unlock\n"
        "[Provide numbered steps (1. 2. 3. etc.) with specific, actionable instructions. Minimum 2-3 steps.]\n\n"
        "## Time Estimate\n"
        "[REQUIRED: Always provide a time estimate like '30-45 minutes' or '2 hours'. Must be a single estimate.]\n\n"
        "## Important Warnings\n"
        "[List any missable elements, point-of-no-return moments, or prerequisites. If none exist, write 'None'.]\n\n"
        "## Pro Tips\n"
        "[Provide 2-3 numbered tips (1. 2. 3. etc.) for faster or easier completion.]\n\n"
        "FORMATTING REQUIREMENTS:\n"
        "- Use markdown headers (## Header Name) for each section\n"
        "- Use numbered lists for steps, warnings, and tips (1. 2. 3.)\n"
        "- Keep steps/tips to 1-2 sentences each\n"
        "- Time Estimate section MUST NOT be empty - always provide a specific time range"
    )

    try:
        tip_md = generate_text(ACHIEVEMENT_TIP_SYSTEM, user_prompt, temperature=0.5, max_output_tokens=2048)
        return jsonify({
            'achievement_id': achievement_id,
            'achievement_name': achievement.display_name,
            'tip_md': tip_md,
            'model_used': model_name(),
        })

    except GeminiNotConfigured:
        return jsonify({'error': 'GEMINI_API_KEY is not configured'}), 400
    except GeminiError as e:
        logger.error(f"Achievement tip generation error: {e}")
        return jsonify({'error': f'AI generation failed: {str(e)}'}), 500
