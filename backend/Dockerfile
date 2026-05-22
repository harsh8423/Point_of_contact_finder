FROM python:3.11-slim

# System deps for spaCy + lxml + aiohttp
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential gcc libxml2-dev libxslt1-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download spaCy model
RUN python -m spacy download en_core_web_sm

# Playwright is optional (web_crawl fallback) — install only if needed
# Uncomment the next two lines to enable Playwright JS rendering:
# RUN pip install playwright
# RUN playwright install chromium --with-deps

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
