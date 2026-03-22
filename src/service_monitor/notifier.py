from __future__ import annotations

import asyncio
import smtplib
from email.message import EmailMessage

from service_monitor.config import EmailConfig


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
