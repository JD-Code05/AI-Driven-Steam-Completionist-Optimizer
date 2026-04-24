import hashlib
import logging
import google.generativeai as genai
from flask import current_app

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a gaming achievement optimization expert. Given a player's current achievement progress, global rarity data, and reference materials scraped from guides/wikis/videos, produce a structured achievement optimization guide.

Your output MUST be in Markdown format and include ALL of the following sections:

## 🎯 Overview
Brief summary of the game's achievement landscape and the player's current progress.

## 📋 Recommended Completion Order
A numbered list of remaining (locked) achievements ordered from easiest to hardest, considering:
- Global unlock percentage (higher % = more players have it = easier)
- Dependencies between achievements
- Natural gameplay progression

## ⏱️ Time Estimates
A table with columns: Achievement | Estimated Time | Difficulty | Notes

## 📝 Step-by-Step Techniques
For each remaining achievement (grouped logically), provide:
- Specific steps to unlock it
- Any prerequisites or setup needed
- Tips and tricks from the reference materials

## ⚠️ Missable Achievements
List any achievements that can be permanently missed (e.g., point-of-no-return, one-time events). Explain when and how to avoid missing them.

## 🔗 Achievement Dependencies
Describe any achievements that must be completed in a specific order or that unlock prerequisites for others.

## 📚 Sources Referenced
List the reference materials used, with brief descriptions of what each contributed.

Important guidelines:
- Be specific and actionable — avoid vague advice
- Reference the source material explicitly when giving tips
- Prioritize efficiency — suggest routes that minimize total time
- Flag any achievements that conflict (e.g., mutually exclusive endings requiring multiple playthroughs)
- Use the global rarity percentages to gauge difficulty
"""


class GeminiService:
    """Handles Gemini API calls for achievement optimization."""

    def __init__(self):
        api_key = current_app.config['GEMINI_API_KEY']
        if not api_key:
            raise ValueError("GEMINI_API_KEY is not configured")
        genai.configure(api_key=api_key)
        self.model_name = current_app.config.get('GEMINI_MODEL', 'gemini-2.5-flash')

    def generate_optimization(self, game_name, achievements_context, sources_context):
        """Generate an optimization guide using Gemini with RAG context.

        Args:
            game_name: Name of the game
            achievements_context: Formatted string of player's achievement status
            sources_context: Concatenated scraped content from data sources

        Returns:
            dict with 'summary_md', 'prompt_hash', 'model_used'
        """
        user_prompt = self._build_user_prompt(game_name, achievements_context, sources_context)
        prompt_hash = self._hash_prompt(user_prompt)

        try:
            model = genai.GenerativeModel(
                model_name=self.model_name,
                system_instruction=SYSTEM_PROMPT,
            )
            response = model.generate_content(
                user_prompt,
                generation_config=genai.types.GenerationConfig(
                    temperature=0.7,
                    max_output_tokens=8192,
                ),
            )

            summary_md = response.text
            if not summary_md:
                raise ValueError("Gemini returned empty response")

            return {
                'summary_md': summary_md,
                'prompt_hash': prompt_hash,
                'model_used': self.model_name,
            }

        except Exception as e:
            logger.error(f"Gemini API error: {e}")
            raise

    def _build_user_prompt(self, game_name, achievements_context, sources_context):
        """Build the user prompt with RAG context."""
        parts = [f"# Game: {game_name}\n"]

        parts.append("## Player's Achievement Status\n")
        parts.append(achievements_context)
        parts.append("\n")

        if sources_context:
            parts.append("## Reference Materials\n")
            parts.append("The following content was scraped from achievement guides, wikis, and videos. "
                         "Use this information to provide specific, actionable advice.\n\n")
            parts.append(sources_context)
            parts.append("\n")

        parts.append("---\n")
        parts.append("Based on the above information, generate a comprehensive achievement optimization guide.")

        return '\n'.join(parts)

    @staticmethod
    def _hash_prompt(prompt):
        """SHA-256 hash of the prompt for deduplication."""
        return hashlib.sha256(prompt.encode('utf-8')).hexdigest()

    @staticmethod
    def format_achievements_context(achievements, player_achievements_map):
        """Format achievement data into a context string for the prompt.

        Args:
            achievements: list of Achievement model instances
            player_achievements_map: dict mapping achievement_id -> PlayerAchievement

        Returns:
            Formatted string
        """
        lines = []
        unlocked = []
        locked = []

        for ach in achievements:
            pa = player_achievements_map.get(ach.id)
            status = "✅ UNLOCKED" if (pa and pa.unlocked) else "🔒 LOCKED"
            entry = (
                f"- [{status}] {ach.display_name} "
                f"(Global: {ach.global_percent}% | Rarity: {ach.rarity_tier})\n"
                f"  Description: {ach.description or 'Hidden achievement'}"
            )
            if pa and pa.unlocked:
                unlocked.append(entry)
            else:
                locked.append(entry)

        lines.append(f"### Unlocked ({len(unlocked)}/{len(achievements)})")
        lines.extend(unlocked)
        lines.append(f"\n### Locked ({len(locked)}/{len(achievements)})")
        lines.extend(locked)

        return '\n'.join(lines)

    @staticmethod
    def format_sources_context(data_sources):
        """Format scraped data source content for the prompt.

        Args:
            data_sources: list of DataSource model instances with scraped_content

        Returns:
            Formatted string, truncated to fit context window
        """
        parts = []
        total_chars = 0
        max_total = 100000  # ~100k chars total context budget for sources

        for source in data_sources:
            if not source.scraped_content:
                continue

            content = source.scraped_content
            # Truncate individual source if too long
            if len(content) > 20000:
                content = content[:20000] + "\n[... truncated]"

            if total_chars + len(content) > max_total:
                remaining = max_total - total_chars
                if remaining > 1000:
                    content = content[:remaining] + "\n[... truncated]"
                else:
                    break

            source_header = f"### Source: {source.title or source.url} ({source.source_type})"
            parts.append(f"{source_header}\n{content}")
            total_chars += len(content)

        return '\n\n---\n\n'.join(parts) if parts else ''
