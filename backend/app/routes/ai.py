import logging
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
import google.generativeai as genai
from ..extensions import db
from ..models.game import Game
from ..models.achievement import Achievement
from ..models.player_achievement import PlayerAchievement
from ..models.data_source import DataSource
from ..models.optimization_route import OptimizationRoute
from ..services.gemini import GeminiService
from ..services.scraper import ScraperService
from ..utils.auth import auth_required

logger = logging.getLogger(__name__)
ai_bp = Blueprint('ai', __name__)


@ai_bp.route('/generate/<int:game_id>', methods=['POST'])
@auth_required
def generate_optimization(game_id):
    """Generate an AI optimization route for a game.
    Scrapes sources, builds RAG context, calls Gemini, and caches the result.
    """
    game = db.session.get(Game, game_id)
    if not game:
        return jsonify({'error': 'Game not found'}), 404

    force = request.args.get('force', 'false').lower() == 'true'

    # 1. Gather achievements + player progress
    achievements = Achievement.query.filter_by(game_id=game_id).order_by(
        Achievement.global_percent.desc()
    ).all()

    player_achs = PlayerAchievement.query.filter_by(player_id=request.player_id).all()
    pa_map = {pa.achievement_id: pa for pa in player_achs if pa.achievement_id in {a.id for a in achievements}}

    if not achievements:
        return jsonify({'error': 'No achievements found. Sync achievements first.'}), 400

    # 2. Gather and scrape bookmarks (user-provided + auto-discovered Steam guides)
    data_sources = DataSource.query.filter_by(game_id=game_id).all()

    scraper = ScraperService()
    
    # Scrape user-provided sources
    for source in data_sources:
        if not source.scraped_content:
            result = scraper.scrape_url(source.url)
            if result.get('content'):
                source.scraped_content = result['content']
                source.title = source.title or result.get('title')
                source.last_scraped = datetime.now(timezone.utc)
    
    db.session.commit()
    
    # Auto-discover comprehensive Steam Community Guides (Broad-to-Narrow strategy)
    # These will provide rich context for Gemini to extract achievement-specific details
    logger.info(f"Auto-discovering comprehensive Steam guides for {game.name}...")
    steam_guides = scraper.scrape_steam_guides(game.steam_app_id, game.name, max_results=3)
    
    # Keep track of user-provided source IDs for later
    user_provided_source_ids = [s.id for s in data_sources]
    
    for guide in steam_guides:
        # Check if this guide is already in our data sources
        existing = DataSource.query.filter_by(
            game_id=game_id,
            url=guide['url']
        ).first()
        
        if not existing and guide.get('content'):
            # Create a temporary data source for this guide (not saved to DB)
            temp_source = DataSource(
                game_id=game_id,
                url=guide['url'],
                title=guide.get('title', 'Steam Community Guide'),
                source_type='steam_guide',
                scraped_content=guide['content'],
                last_scraped=datetime.now(timezone.utc),
            )
            data_sources.append(temp_source)
            logger.info(f"Added auto-discovered guide: {guide.get('title')}")

    # 3. Build context strings
    achievements_context = GeminiService.format_achievements_context(achievements, pa_map)
    sources_context = GeminiService.format_sources_context(data_sources)

    # 4. Check for cached result (prompt hash dedup)
    gemini = GeminiService()
    test_prompt = gemini._build_user_prompt(game.name, achievements_context, sources_context)
    prompt_hash = gemini._hash_prompt(test_prompt)

    if not force:
        existing = OptimizationRoute.query.filter_by(
            player_id=request.player_id,
            game_id=game_id,
            prompt_hash=prompt_hash,
        ).first()
        if existing:
            return jsonify({
                'message': 'Using cached optimization route (same context)',
                'cached': True,
                'route': existing.to_dict(),
            })

    # 5. Call Gemini
    try:
        result = gemini.generate_optimization(game.name, achievements_context, sources_context)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': f'AI generation failed: {str(e)}'}), 500

    # 6. Save result (only include user-provided source IDs, not auto-discovered ones)
    route = OptimizationRoute(
        player_id=request.player_id,
        game_id=game_id,
        summary_md=result['summary_md'],
        source_ids_used=user_provided_source_ids,
        model_used=result['model_used'],
        prompt_hash=result['prompt_hash'],
    )
    db.session.add(route)
    db.session.commit()

    return jsonify({
        'message': 'Optimization route generated successfully',
        'cached': False,
        'route': route.to_dict(),
    }), 201


@ai_bp.route('/routes/<int:game_id>', methods=['GET'])
@auth_required
def get_optimization_route(game_id):
    """Get the latest cached optimization route for a game."""
    route = OptimizationRoute.query.filter_by(
        player_id=request.player_id,
        game_id=game_id,
    ).order_by(OptimizationRoute.updated_at.desc()).first()

    if not route:
        return jsonify({'error': 'No optimization route found. Generate one first.'}), 404

    return jsonify(route.to_dict())


@ai_bp.route('/regenerate/<int:game_id>', methods=['POST'])
@auth_required
def regenerate_optimization(game_id):
    """Force regeneration of an optimization route (ignores cache)."""
    game = db.session.get(Game, game_id)
    if not game:
        return jsonify({'error': 'Game not found'}), 404

    achievements = Achievement.query.filter_by(game_id=game_id).order_by(
        Achievement.global_percent.desc()
    ).all()

    player_achs = PlayerAchievement.query.filter_by(player_id=request.player_id).all()
    pa_map = {pa.achievement_id: pa for pa in player_achs if pa.achievement_id in {a.id for a in achievements}}

    if not achievements:
        return jsonify({'error': 'No achievements found. Sync achievements first.'}), 400

    data_sources = DataSource.query.filter_by(game_id=game_id).all()

    # Re-scrape all sources
    scraper = ScraperService()
    for source in data_sources:
        result = scraper.scrape_url(source.url)
        if result.get('content'):
            source.scraped_content = result['content']
            source.title = source.title or result.get('title')
            source.last_scraped = datetime.now(timezone.utc)
    db.session.commit()

    achievements_context = GeminiService.format_achievements_context(achievements, pa_map)
    sources_context = GeminiService.format_sources_context(data_sources)

    try:
        gemini = GeminiService()
        gen_result = gemini.generate_optimization(game.name, achievements_context, sources_context)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': f'AI generation failed: {str(e)}'}), 500

    source_ids = [s.id for s in data_sources if s.scraped_content]
    route = OptimizationRoute(
        player_id=request.player_id,
        game_id=game_id,
        summary_md=gen_result['summary_md'],
        source_ids_used=source_ids,
        model_used=gen_result['model_used'],
        prompt_hash=gen_result['prompt_hash'],
    )
    db.session.add(route)
    db.session.commit()

    return jsonify({
        'message': 'Optimization route regenerated successfully',
        'cached': False,
        'route': route.to_dict(),
    }), 201


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

    # Gather scraped sources for the game
    data_sources = DataSource.query.filter_by(game_id=game.id).all()
    sources_context = GeminiService.format_sources_context(data_sources)

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
            "## Reference Materials (scraped from guides/wikis/videos)\n"
            "Use the information below to give specific, actionable advice:\n\n"
            + sources_context + "\n\n---\n"
        )

    user_prompt += (
        "Based on the above, provide a focused guide for this single achievement. "
        "Include: step-by-step instructions, any prerequisites, missable warnings, "
        "and an estimated time to unlock. Keep it concise and practical."
    )

    ACHIEVEMENT_TIP_SYSTEM = (
        "You are a gaming achievement expert. Generate a clear, concise guide for a single achievement.\n\n"
        "Format your response with these sections (each on a new line, starting with the section header):\n\n"
        "How to Unlock\n"
        "[Numbered steps on separate lines: 1. step text, 2. step text, etc.]\n\n"
        "Important Warnings\n"
        "[Numbered warnings if any exist, or 'None' if no warnings]\n\n"
        "Estimated Time\n"
        "[Single time estimate only, e.g., '30-45 minutes']\n\n"
        "Pro Tips\n"
        "[Numbered tips on separate lines: 1. tip text, 2. tip text, etc.]\n\n"
        "Requirements:\n"
        "- Be specific and actionable\n"
        "- Reference guide materials when available\n"
        "- Keep each step/warning/tip to 1-2 sentences max\n"
        "- Use numbered lists (1. 2. 3.) for steps, warnings, and tips"
    )

    try:
        from flask import current_app
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
