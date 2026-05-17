import logging
from flask import Blueprint, request, jsonify
import google.generativeai as genai
from ..extensions import db
from ..models.game import Game
from ..models.achievement import Achievement
from ..models.player_achievement import PlayerAchievement
from ..utils.auth import auth_required

logger = logging.getLogger(__name__)
ai_bp = Blueprint('ai', __name__)

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
