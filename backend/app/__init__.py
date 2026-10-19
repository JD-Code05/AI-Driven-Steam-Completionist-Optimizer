from flask import Flask
from flask_cors import CORS

from .config import Config
from .extensions import db, migrate


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)
    CORS(app, supports_credentials=True)

    # Import models so Alembic detects them
    from .models import player, game, player_game, achievement, player_achievement, data_source, optimization_route  # noqa: F401

    # Register blueprints
    from .routes.games import games_bp
    from .routes.player_games import player_games_bp
    from .routes.achievements import achievements_bp
    from .routes.player_achievements import player_achievements_bp
    from .routes.data_sources import data_sources_bp
    from .routes.auth import auth_bp
    from .routes.sync import sync_bp
    from .routes.ai import ai_bp
    from .routes.steamgriddb import steamgriddb_bp

    app.register_blueprint(games_bp, url_prefix='/api/games')
    app.register_blueprint(player_games_bp, url_prefix='/api/player-games')
    app.register_blueprint(achievements_bp, url_prefix='/api/achievements')
    app.register_blueprint(player_achievements_bp, url_prefix='/api/player-achievements')
    app.register_blueprint(data_sources_bp, url_prefix='/api/data-sources')
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(sync_bp, url_prefix='/api/sync')
    app.register_blueprint(ai_bp, url_prefix='/api/ai')
    app.register_blueprint(steamgriddb_bp, url_prefix='/api/steamgriddb')

    @app.route('/api/health')
    def health():
        return {'status': 'healthy'}

    return app
