from ..extensions import db
from datetime import datetime, timezone


class Player(db.Model):
    __tablename__ = 'players'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    steam_id = db.Column(db.String(20), unique=True, nullable=False)
    persona_name = db.Column(db.String(255))
    avatar_url = db.Column(db.Text)
    profile_url = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))

    player_games = db.relationship('PlayerGame', back_populates='player', cascade='all, delete-orphan')
    player_achievements = db.relationship('PlayerAchievement', back_populates='player', cascade='all, delete-orphan')
    optimization_routes = db.relationship('OptimizationRoute', back_populates='player', cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'steam_id': self.steam_id,
            'persona_name': self.persona_name,
            'avatar_url': self.avatar_url,
            'profile_url': self.profile_url,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
