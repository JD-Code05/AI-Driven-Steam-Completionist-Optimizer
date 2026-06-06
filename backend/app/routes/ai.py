import logging
import hashlib
import json
from flask import Blueprint, request, jsonify, current_app
import google.generativeai as genai
from ..extensions import db
from ..models.game import Game
from ..models.achievement import Achievement
from ..models.data_source import DataSource
from ..models.optimization_route import OptimizationRoute
from ..models.player_achievement import PlayerAchievement
from ..utils.auth import auth_required

logger = logging.getLogger(__name__)
ai_bp = Blueprint('ai', __name__)


def _configure_gemini():
    api_key = current_app.config.get('GEMINI_API_KEY', '')
    model_name = current_app.config.get('GEMINI_MODEL', 'gemini-2.5-flash')

    if not api_key:
        return None, model_name, jsonify({'error': 'GEMINI_API_KEY is not configured'}), 400

    genai.configure(api_key=api_key)
    return genai.GenerativeModel(model_name), model_name, None, None


def _build_route_prompt(game, achievements, player_achievement_map, data_sources):
    unlocked = []
    locked = []

    for achievement in achievements:
        progress = player_achievement_map.get(achievement.id)
        item = {
            'name': achievement.display_name or achievement.api_name,
            'description': achievement.description or 'Hidden achievement',
            'rarity': achievement.rarity_tier,
            'global_percent': float(achievement.global_percent or 0),
        }
        if progress and progress.unlocked:
            unlocked.append(item)
        else:
            locked.append(item)

    source_summaries = []
    for source in data_sources[:8]:
        content = (source.scraped_content or '').strip()
        source_summaries.append({
            'id': source.id,
            'title': source.title or source.url,
            'type': source.source_type,
            'url': source.url,
            'content_excerpt': content[:2500],
        })

    payload = {
        'game': {'id': game.id, 'app_id': game.app_id, 'name': game.name},
        'player_progress': {
            'unlocked_count': len(unlocked),
            'locked_count': len(locked),
            'unlocked': unlocked[:50],
            'locked': locked[:80],
        },
        'reference_sources': source_summaries,
    }

    prompt_hash = hashlib.sha256(
        json.dumps(payload, sort_keys=True, default=str).encode('utf-8')
    ).hexdigest()

    prompt = (
        "Create a practical Steam achievement optimization route for the player.\n"
        "Use the JSON context below. Prioritize locked achievements, grouping tasks that can be done together.\n"
        "Return markdown with these sections: Overview, Fastest Route, Achievement Order, Prep Checklist, Risks.\n"
        "Keep it specific and action-oriented.\n\n"
        f"{json.dumps(payload, indent=2, default=str)}"
    )

    return prompt, prompt_hash, [source.id for source in data_sources[:8]]


def _generate_optimization_route(game_id, force=False):
    game = db.session.get(Game, game_id)
    if not game:
        return jsonify({'error': 'Game not found'}), 404

    existing_route = OptimizationRoute.query.filter_by(
        player_id=request.player_id,
        game_id=game_id,
    ).order_by(OptimizationRoute.updated_at.desc()).first()

    if existing_route and not force:
        return jsonify({'route': existing_route.to_dict(), 'cached': True}), 200

    achievements = Achievement.query.filter_by(game_id=game_id).order_by(
        Achievement.global_percent.asc(),
        Achievement.display_name.asc(),
    ).all()
    if not achievements:
        return jsonify({'error': 'No achievements found. Sync achievements first.'}), 400

    player_achievements = PlayerAchievement.query.filter_by(
        player_id=request.player_id
    ).filter(
        PlayerAchievement.achievement_id.in_([achievement.id for achievement in achievements])
    ).all()
    player_achievement_map = {
        player_achievement.achievement_id: player_achievement
        for player_achievement in player_achievements
    }

    data_sources = DataSource.query.filter_by(game_id=game_id).order_by(
        DataSource.last_scraped.desc(),
        DataSource.created_at.desc(),
    ).all()

    model, model_name, error_response, status_code = _configure_gemini()
    if error_response:
        return error_response, status_code

    prompt, prompt_hash, source_ids = _build_route_prompt(
        game,
        achievements,
        player_achievement_map,
        data_sources,
    )

    try:
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                temperature=0.4,
                max_output_tokens=3072,
            ),
        )
        summary_md = response.text
        if not summary_md:
            return jsonify({'error': 'Gemini returned an empty response'}), 500

        route = existing_route or OptimizationRoute(
            player_id=request.player_id,
            game_id=game_id,
        )
        route.summary_md = summary_md
        route.source_ids_used = source_ids
        route.model_used = model_name
        route.prompt_hash = prompt_hash

        if not existing_route:
            db.session.add(route)

        db.session.commit()
        return jsonify({'route': route.to_dict(), 'cached': False}), 200
    except Exception as e:
        logger.error("Optimization route generation error: %s", e)
        return jsonify({'error': f'AI route generation failed: {str(e)}'}), 500


@ai_bp.route('/routes/<int:game_id>', methods=['GET'])
@auth_required
def get_optimization_route(game_id):
    """Return the latest cached optimization route for the authenticated player."""
    route = OptimizationRoute.query.filter_by(
        player_id=request.player_id,
        game_id=game_id,
    ).order_by(OptimizationRoute.updated_at.desc()).first()

    if not route:
        return jsonify({'error': 'Optimization route not found'}), 404

    return jsonify(route.to_dict())


@ai_bp.route('/routes/<int:game_id>', methods=['POST'])
@auth_required
def generate_optimization_route(game_id):
    """Generate or return a cached optimization route for a game."""
    return _generate_optimization_route(game_id, force=False)


@ai_bp.route('/routes/<int:game_id>/regenerate', methods=['POST'])
@auth_required
def regenerate_optimization_route(game_id):
    """Force regeneration of the optimization route for a game."""
    return _generate_optimization_route(game_id, force=True)

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

    sources_context = ""
    # Hardcoded fallback RAG context for Stardew Valley showcasing
    if game.app_id == 413150:
        from ..services.scraper import ScraperService
        scraper = ScraperService()
        logger.info("Stardew Valley detected. Scraping Stardew Valley Wiki for RAG context...")
        result = scraper.scrape_url("https://stardewvalleywiki.com/Achievements")
        if result.get('content'):
            sources_context = f"### Source: Stardew Valley Wiki (https://stardewvalleywiki.com/Stardew_Valley_Wiki)\n\n{result['content']}"

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

    if sources_context:
        user_prompt += (
            "## Reference Materials (scraped from Stardew Valley Wiki)\n"
            "Use the information below to give specific, actionable advice:\n\n"
            + sources_context + "\n\n---\n"
        )

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
        api_key = current_app.config.get('GEMINI_API_KEY', '')
        model_name = current_app.config.get('GEMINI_MODEL', 'gemini-2.5-flash')

        if not api_key:
            return jsonify({'error': 'GEMINI_API_KEY is not configured'}), 400

        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(
            model_name=model_name,
            system_instruction=ACHIEVEMENT_TIP_SYSTEM,
        )
        response = model.generate_content(
            user_prompt,
            generation_config=genai.types.GenerationConfig(
                temperature=0.5,
                max_output_tokens=2048,
            ),
        )
        tip_md = response.text
        if not tip_md:
            return jsonify({'error': 'Gemini returned an empty response'}), 500

        return jsonify({
            'achievement_id': achievement_id,
            'achievement_name': achievement.display_name,
            'tip_md': tip_md,
            'model_used': model_name,
        })

    except Exception as e:
        logger.error(f"Achievement tip generation error: {e}")
        return jsonify({'error': f'AI generation failed: {str(e)}'}), 500
