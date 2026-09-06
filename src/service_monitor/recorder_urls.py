"""Normalize user-entered recorder addresses before browser navigation."""

import re
from urllib.parse import urlsplit


def normalize_recorder_url(value: str) -> str:
    value = value.strip()
    link = re.fullmatch(r'\[[^\]\r\n]*\]\((https?://[^\s()]+)\)', value)
    if link:
        value = link.group(1)
    if not value or any(char.isspace() or ord(char) < 32 for char in value):
        raise ValueError('Enter a website address such as https://www.bing.com.')
    if value.startswith('//'):
        value = 'https:' + value
    elif '://' not in value:
        # Permit host:port while rejecting non-web schemes such as javascript:.
        if re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:', value) and not re.match(r'^[^/:]+:\d+(?:/|$)', value):
            raise ValueError('Recorder URLs must use http:// or https://.')
        value = 'https://' + value
    try:
        parsed = urlsplit(value)
        valid = parsed.scheme in {'http', 'https'} and parsed.hostname and parsed.port != 0
        if not valid or any(char in parsed.netloc for char in '\\<>"'):
            raise ValueError()
    except ValueError:
        raise ValueError('Enter a valid HTTP or HTTPS website address.') from None
    return value
