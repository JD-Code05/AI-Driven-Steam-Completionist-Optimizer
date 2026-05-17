#!/usr/bin/env python3
"""Test script to run the scraper and show logging output."""

import sys
import logging

# Configure logging to show everything
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

# Add backend to path
sys.path.insert(0, '/Users/margrette/Desktop/code/github/ai-driven-steam-completionist-optimizer/backend')

from app.services.scraper import ScraperService

print("=" * 80)
print("STEAM SCRAPER TEST - Demonstrating Real Scraping")
print("=" * 80)
print()

scraper = ScraperService()

# Test with Stardew Valley (app_id: 413150) and a common achievement
app_id = 413150  # Stardew Valley
achievement_name = "Spring Foraging"

print(f"🔍 Searching Steam Community Guides for:")
print(f"   Game ID: {app_id}")
print(f"   Achievement: {achievement_name}")
print()
print("-" * 80)
print()

results = scraper.scrape_steam_guides(app_id, achievement_name, max_results=2)

print()
print("=" * 80)
print(f"RESULTS: Found {len(results)} guide(s)")
print("=" * 80)
print()

for i, result in enumerate(results, 1):
    print(f"\n{'=' * 80}")
    print(f"GUIDE #{i}")
    print(f"{'=' * 80}")
    print(f"Title: {result['title']}")
    print(f"URL: {result['url']}")
    print(f"\nContent Preview (first 1000 chars):")
    print("-" * 80)
    print(result['content'][:1000] if result['content'] else "[No content]")
    print("-" * 80)
    if result['content'] and len(result['content']) > 1000:
        print(f"[... {len(result['content']) - 1000} more characters ...]")
    print()

