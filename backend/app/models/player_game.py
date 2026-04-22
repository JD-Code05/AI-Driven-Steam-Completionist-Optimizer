from ..extensions import db


class PlayerGame(db.Model):
    __tablename__ = 'player_games'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    player_id = db.Column(db.Integer, db.ForeignKey('players.id', ondelete='CASCADE'), nullable=False)
    game_id = db.Column(db.Integer, db.ForeignKey('games.id', ondelete='CASCADE'), nullable=False)
    playtime_hours = db.Column(db.Numeric(10, 1), default=0.0)
    is_tracked = db.Column(db.Boolean, default=False)
    last_synced = db.Column(db.DateTime, nullable=True)

    __table_args__ = (
        db.UniqueConstraint('player_id', 'game_id', name='uq_player_game'),
    )

    player = db.relationship('Player', back_populates='player_games')
    game = db.relationship('Game', back_populates='player_games')

    def to_dict(self):
        return {
            'id': self.id,
            'player_id': self.player_id,
            'game_id': self.game_id,
            'playtime_hours': float(self.playtime_hours) if self.playtime_hours else 0.0,
            'is_tracked': self.is_tracked,
            'last_synced': self.last_synced.isoformat() if self.last_synced else None,
            'game': self.game.to_dict() if self.game else None,
        }
