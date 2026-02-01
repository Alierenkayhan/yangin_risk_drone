FROM python:3.11-slim

WORKDIR /app

# System dependencies
RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Create directories
RUN mkdir -p detection/models media staticfiles

EXPOSE 8000

# Varsayılan komut — docker-compose'da override edilir
CMD ["gunicorn", "dronecommand.wsgi:application", "-b", "0.0.0.0:8000", "--workers", "2"]
