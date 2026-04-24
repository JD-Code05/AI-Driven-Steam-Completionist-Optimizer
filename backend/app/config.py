import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    SECRET_KEY = os.getenv('FLASK_SECRET_KEY', 'dev-secret-key')

    BACKEND_URL = os.getenv('BACKEND_URL', 'http://localhost:5000')

    MYSQL_HOST = os.getenv('MYSQL_HOST', 'localhost')
    MYSQL_PORT = int(os.getenv('MYSQL_PORT', 3306))
    MYSQL_DATABASE = os.getenv('MYSQL_DATABASE', 'steam_optimizer')
    MYSQL_USER = os.getenv('MYSQL_USER', 'steam_user')
    MYSQL_PASSWORD = os.getenv('MYSQL_PASSWORD', 'change_me_in_production')

    SQLALCHEMY_DATABASE_URI = (
        f"mysql+pymysql://{MYSQL_USER}:{MYSQL_PASSWORD}"
        f"@{MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_DATABASE}"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    STEAM_API_KEY = os.getenv('STEAM_API_KEY', '')
    GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', '')
    GEMINI_MODEL = os.getenv('GEMINI_MODEL', 'gemini-2.0-flash')

    JWT_ALGORITHM = 'HS256'
    JWT_EXPIRATION_HOURS = 24
