FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app

COPY pyproject.toml README.md /app/
COPY src /app/src

RUN apt-get update \
    && apt-get install -y --no-install-recommends traceroute iputils-ping \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir .
RUN python -m playwright install --with-deps chromium

COPY config.docker.yaml /app/config.yaml

RUN apt-get update \
    && apt-get install -y --no-install-recommends xvfb x11vnc novnc websockify \
    && rm -rf /var/lib/apt/lists/*
COPY scripts/recorder_desktop.py /app/recorder_desktop.py

EXPOSE 8000 8080

CMD ["python", "-m", "service_monitor"]
