from ..extensions import db
from datetime import datetime, timezone


class OptimizationRoute(db.Model):
    __tablename__ = 'optimization_routes'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    player_id = db.Column(db.Integer, db.ForeignKey('players.id', ondelete='CASCADE'), nullable=False)
    game_id = db.Column(db.Integer, db.ForeignKey('games.id', ondelete='CASCADE'), nullable=False)
    summary_md = db.Column(db.Text)
    source_ids_used = db.Column(db.JSON)
    model_used = db.Column(db.String(50))
    prompt_hash = db.Column(db.String(64))
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))

    player = db.relationship('Player', back_populates='optimization_routes')
    game = db.relationship('Game', back_populates='optimization_routes')

    def to_dict(self):
        return {
            'id': self.id,
            'player_id': self.player_id,
            'game_id': self.game_id,
            'summary_md': self.summary_md,
            'source_ids_used': self.source_ids_used,
            'model_used': self.model_used,
            'prompt_hash': self.prompt_hash,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
