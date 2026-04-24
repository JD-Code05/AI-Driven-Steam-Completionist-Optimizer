from ..extensions import db
from datetime import datetime, timezone


class Game(db.Model):
    __tablename__ = 'games'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    app_id = db.Column(db.Integer, unique=True, nullable=False)
    name = db.Column(db.String(255))
    img_icon_url = db.Column(db.Text)
    img_logo_url = db.Column(db.Text)
    img_capsule_url = db.Column(db.Text)
    total_achievements = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    achievements = db.relationship('Achievement', back_populates='game', cascade='all, delete-orphan')
    player_games = db.relationship('PlayerGame', back_populates='game', cascade='all, delete-orphan')
    data_sources = db.relationship('DataSource', back_populates='game', cascade='all, delete-orphan')
    optimization_routes = db.relationship('OptimizationRoute', back_populates='game', cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'app_id': self.app_id,
            'name': self.name,
            'img_icon_url': self.img_icon_url,
            'img_logo_url': self.img_logo_url,
            'img_capsule_url': self.img_capsule_url,
            'total_achievements': self.total_achievements,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
