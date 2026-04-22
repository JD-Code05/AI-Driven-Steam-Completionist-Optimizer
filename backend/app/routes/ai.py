from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from ..extensions import db
from ..models.game import Game
from ..models.achievement import Achievement
from ..models.player_achievement import PlayerAchievement
from ..models.data_source import DataSource
from ..models.optimization_route import OptimizationRoute
from ..services.gemini import GeminiService
from ..services.scraper import ScraperService
from ..utils.auth import auth_required

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
        Achievement.global_percent.asc()
    ).all()

    player_achs = PlayerAchievement.query.filter_by(player_id=request.player_id).all()
    pa_map = {pa.achievement_id: pa for pa in player_achs if pa.achievement_id in {a.id for a in achievements}}

    if not achievements:
        return jsonify({'error': 'No achievements found. Sync achievements first.'}), 400

    # 2. Gather and scrape data sources
    data_sources = DataSource.query.filter_by(game_id=game_id).all()

    scraper = ScraperService()
    for source in data_sources:
        if not source.scraped_content:
            result = scraper.scrape_url(source.url)
            if result.get('content'):
                source.scraped_content = result['content']
                source.title = source.title or result.get('title')
                source.last_scraped = datetime.now(timezone.utc)
    db.session.commit()

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

    # 6. Save result
    source_ids = [s.id for s in data_sources if s.scraped_content]
    route = OptimizationRoute(
        player_id=request.player_id,
        game_id=game_id,
        summary_md=result['summary_md'],
        source_ids_used=source_ids,
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
        Achievement.global_percent.asc()
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
