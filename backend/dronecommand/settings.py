"""
Django settings for DroneCommand AI Backend
RabbitMQ-centric architecture — no WebSocket/Channels

Tüm konfigürasyon değerleri environment variable'lardan okunur.
Varsayılan değerler sadece geliştirme ortamı içindir.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

# ============================================
# Core Django
# ============================================

SECRET_KEY = os.getenv('DJANGO_SECRET_KEY', 'dev-insecure-key-change-in-production')

DEBUG = os.getenv('DEBUG', 'True').lower() == 'true'

ALLOWED_HOSTS = [
    h.strip()
    for h in os.getenv('ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',')
    if h.strip()
]

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third party
    'rest_framework',
    'corsheaders',
    # Local
    'api',
    'detection',
    'rabbitmq_service',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'dronecommand.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'dronecommand.wsgi.application'

# ============================================
# Database
# ============================================

_db_engine = os.getenv('DATABASE_ENGINE', 'django.db.backends.sqlite3')

if 'sqlite' in _db_engine:
    DATABASES = {
        'default': {
            'ENGINE': _db_engine,
            'NAME': BASE_DIR / os.getenv('DATABASE_NAME', 'db.sqlite3'),
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': _db_engine,
            'NAME': os.environ['DATABASE_NAME'],
            'USER': os.environ['DATABASE_USER'],
            'PASSWORD': os.environ['DATABASE_PASSWORD'],
            'HOST': os.environ['DATABASE_HOST'],
            'PORT': os.getenv('DATABASE_PORT', '5432'),
        }
    }

# ============================================
# Auth
# ============================================

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# ============================================
# Logging
# ============================================

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '[{asctime}] {levelname} {name}: {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
    },
    'loggers': {
        'dronecommand': {
            'handlers': ['console'],
            'level': os.getenv('LOG_LEVEL', 'INFO'),
            'propagate': False,
        },
    },
}

# ============================================
# Internationalization
# ============================================

LANGUAGE_CODE = 'tr-tr'
TIME_ZONE = 'Europe/Istanbul'
USE_I18N = True
USE_TZ = True

# ============================================
# Static & Media
# ============================================

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
MEDIA_URL = 'media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ============================================
# CORS Settings
# ============================================

_cors_origins = os.getenv('CORS_ALLOWED_ORIGINS', '')
if _cors_origins:
    CORS_ALLOW_ALL_ORIGINS = False
    CORS_ALLOWED_ORIGINS = [o.strip() for o in _cors_origins.split(',') if o.strip()]
else:
    CORS_ALLOW_ALL_ORIGINS = DEBUG

CORS_ALLOW_CREDENTIALS = True

# ============================================
# REST Framework
# ============================================

REST_FRAMEWORK = {
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.AllowAny',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': int(os.getenv('REST_PAGE_SIZE', 50)),
}

# ============================================
# RabbitMQ Configuration
# ============================================

RABBITMQ_CONFIG = {
    'HOST': os.environ.get('RABBITMQ_HOST', 'localhost'),
    'PORT': int(os.environ.get('RABBITMQ_PORT', 5672)),
    'USERNAME': os.environ.get('RABBITMQ_USERNAME', 'guest'),
    'PASSWORD': os.environ.get('RABBITMQ_PASSWORD', 'guest'),
    'VIRTUAL_HOST': os.getenv('RABBITMQ_VHOST', '/'),

    # Web STOMP — tarayıcı bağlantısı için
    'STOMP_HOST': os.environ.get('RABBITMQ_STOMP_HOST', 'localhost'),
    'STOMP_PORT': int(os.environ.get('RABBITMQ_STOMP_PORT', 15674)),

    # Exchange names
    'EXCHANGE_TELEMETRY': os.getenv('RABBITMQ_EXCHANGE_TELEMETRY', 'drone.telemetry'),
    'EXCHANGE_COMMANDS': os.getenv('RABBITMQ_EXCHANGE_COMMANDS', 'drone.commands'),
    'EXCHANGE_VIDEO': os.getenv('RABBITMQ_EXCHANGE_VIDEO', 'drone.video'),
    'EXCHANGE_ALERTS': os.getenv('RABBITMQ_EXCHANGE_ALERTS', 'drone.alerts'),
    'EXCHANGE_GUI': os.getenv('RABBITMQ_EXCHANGE_GUI', 'drone.gui'),
}

# ============================================
# YOLO Fire/Smoke Detection Configuration
# ============================================

YOLO_CONFIG = {
    'MODEL_PATH': os.getenv('YOLO_MODEL_PATH', str(BASE_DIR / 'detection' / 'models' / 'fire_smoke.pt')),
    'CONFIDENCE_THRESHOLD': float(os.getenv('YOLO_CONFIDENCE', 0.5)),
    'IOU_THRESHOLD': float(os.getenv('YOLO_IOU', 0.45)),
    'CLASSES': ['fire', 'smoke'],
    'DEVICE': os.getenv('YOLO_DEVICE', 'cpu'),
}

# ============================================
# Video Streaming Configuration
# ============================================

VIDEO_CONFIG = {
    'FRAME_WIDTH': int(os.getenv('VIDEO_FRAME_WIDTH', 640)),
    'FRAME_HEIGHT': int(os.getenv('VIDEO_FRAME_HEIGHT', 480)),
    'FPS': int(os.getenv('VIDEO_FPS', 30)),
    'JPEG_QUALITY': int(os.getenv('VIDEO_JPEG_QUALITY', 80)),
}
