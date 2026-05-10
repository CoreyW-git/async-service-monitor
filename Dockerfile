FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY pyproject.toml README.md /app/
COPY src /app/src

RUN apt-get update \
    && apt-get install -y --no-install-recommends traceroute iputils-ping \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir .

COPY config.docker.yaml /app/config.yaml

EXPOSE 8000 8080

CMD ["python", "-m", "service_monitor"]
