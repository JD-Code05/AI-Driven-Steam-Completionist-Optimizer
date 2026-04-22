from ..extensions import db


class PlayerAchievement(db.Model):
    __tablename__ = 'player_achievements'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    player_id = db.Column(db.Integer, db.ForeignKey('players.id', ondelete='CASCADE'), nullable=False)
    achievement_id = db.Column(db.Integer, db.ForeignKey('achievements.id', ondelete='CASCADE'), nullable=False)
    unlocked = db.Column(db.Boolean, default=False)
    unlock_time = db.Column(db.DateTime, nullable=True)

    __table_args__ = (
        db.UniqueConstraint('player_id', 'achievement_id', name='uq_player_achievement'),
    )

    player = db.relationship('Player', back_populates='player_achievements')
    achievement = db.relationship('Achievement', back_populates='player_achievements')

    def to_dict(self):
        return {
            'id': self.id,
            'player_id': self.player_id,
            'achievement_id': self.achievement_id,
            'unlocked': self.unlocked,
            'unlock_time': self.unlock_time.isoformat() if self.unlock_time else None,
            'achievement': self.achievement.to_dict() if self.achievement else None,
        }
