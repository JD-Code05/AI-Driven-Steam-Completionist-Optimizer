from ..extensions import db
from datetime import datetime, timezone


class DataSource(db.Model):
    __tablename__ = 'data_sources'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    game_id = db.Column(db.Integer, db.ForeignKey('games.id', ondelete='CASCADE'), nullable=False)
    url = db.Column(db.Text, nullable=False)
    title = db.Column(db.String(500))
    source_type = db.Column(db.Enum('wiki', 'article', 'blog', 'youtube', 'other', name='source_type_enum'), default='other')
    scraped_content = db.Column(db.Text)
    last_scraped = db.Column(db.DateTime, nullable=True)
    is_auto = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    game = db.relationship('Game', back_populates='data_sources')

    def to_dict(self):
        return {
            'id': self.id,
            'game_id': self.game_id,
            'url': self.url,
            'title': self.title,
            'source_type': self.source_type,
            'has_content': bool(self.scraped_content),
            'last_scraped': self.last_scraped.isoformat() if self.last_scraped else None,
            'is_auto': self.is_auto,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
