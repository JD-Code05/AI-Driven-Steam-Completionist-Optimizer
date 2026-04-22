from ..extensions import db


class Achievement(db.Model):
    __tablename__ = 'achievements'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    game_id = db.Column(db.Integer, db.ForeignKey('games.id', ondelete='CASCADE'), nullable=False)
    api_name = db.Column(db.String(255), nullable=False)
    display_name = db.Column(db.String(255))
    description = db.Column(db.Text)
    icon_url = db.Column(db.Text)
    icon_gray_url = db.Column(db.Text)
    global_percent = db.Column(db.Numeric(5, 2), default=0.00)

    __table_args__ = (
        db.UniqueConstraint('game_id', 'api_name', name='uq_game_achievement'),
    )

    game = db.relationship('Game', back_populates='achievements')
    player_achievements = db.relationship('PlayerAchievement', back_populates='achievement', cascade='all, delete-orphan')

    @property
    def rarity_tier(self):
        pct = float(self.global_percent) if self.global_percent else 0
        if pct < 5:
            return 'ultra-rare'
        elif pct < 15:
            return 'rare'
        elif pct < 30:
            return 'uncommon'
        return 'common'

    def to_dict(self):
        return {
            'id': self.id,
            'game_id': self.game_id,
            'api_name': self.api_name,
            'display_name': self.display_name,
            'description': self.description,
            'icon_url': self.icon_url,
            'icon_gray_url': self.icon_gray_url,
            'global_percent': float(self.global_percent) if self.global_percent else 0,
            'rarity_tier': self.rarity_tier,
        }
