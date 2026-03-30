from __future__ import annotations

import asyncio
import smtplib
from email.message import EmailMessage

import httpx

from service_monitor.config import EmailConfig, SlackConfig


class EmailNotifier:
    def __init__(self, config: EmailConfig) -> None:
        self.config = config

    async def send(self, subject: str, body: str) -> None:
        if not self.config.enabled:
            return
        await asyncio.to_thread(self._send_sync, subject, body)

    def _send_sync(self, subject: str, body: str) -> None:
        message = EmailMessage()
        message["Subject"] = f"{self.config.subject_prefix} {subject}"
        message["From"] = self.config.from_address
        message["To"] = ", ".join(self.config.to_addresses)
        message.set_content(body)

        if self.config.use_ssl:
            server = smtplib.SMTP_SSL(self.config.host, self.config.port, timeout=10)
        else:
            server = smtplib.SMTP(self.config.host, self.config.port, timeout=10)

        try:
            if self.config.use_tls and not self.config.use_ssl:
                server.starttls()
            if self.config.username:
                server.login(self.config.username, self.config.password or "")
            server.send_message(message)
        finally:
            server.quit()


class SlackNotifier:
    def __init__(self, config: SlackConfig) -> None:
        self.config = config

    async def send(self, subject: str, body: str) -> None:
        if not self.config.enabled or not self.config.webhook_url:
            return
        payload = {
            "text": self._render_text(subject, body),
        }
        if self.config.channel:
            payload["channel"] = self.config.channel
        if self.config.username:
            payload["username"] = self.config.username
        if self.config.icon_emoji:
            payload["icon_emoji"] = self.config.icon_emoji
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(self.config.webhook_url, json=payload)
            response.raise_for_status()

    def _render_text(self, subject: str, body: str) -> str:
        prefix = self.config.message_prefix.strip() if self.config.message_prefix else ""
        mention = "<!here> " if self.config.mention_here else ""
        header = f"{mention}{prefix} *{subject}*".strip()
        return f"{header}\n{body}".strip()


class NotificationManager:
    def __init__(self, email: EmailConfig, slack: SlackConfig) -> None:
        self.email = EmailNotifier(email)
        self.slack = SlackNotifier(slack)

    def update(self, email: EmailConfig, slack: SlackConfig) -> None:
        self.email.config = email
        self.slack.config = slack

    async def send(self, subject: str, body: str) -> None:
        results = await asyncio.gather(
            self.email.send(subject, body),
            self.slack.send(subject, body),
            return_exceptions=True,
        )
        errors = [result for result in results if isinstance(result, Exception)]
        if errors:
            raise RuntimeError("; ".join(str(error) for error in errors))
