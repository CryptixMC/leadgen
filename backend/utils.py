from urllib.parse import urlparse

SOCIAL_MEDIA_DOMAINS = {
    "facebook.com", "instagram.com", "twitter.com", "x.com",
    "linkedin.com", "tiktok.com", "youtube.com", "pinterest.com",
    "snapchat.com",
}

AGGREGATOR_DOMAINS = {
    "skipthedishes.com", "doordash.com", "ubereats.com", "grubhub.com",
    "seamless.com", "postmates.com", "menulog.com", "justeat.com",
    "deliveroo.com", "toasttab.com", "square.site",
}


def _domain_match(url: str | None, domain_set: set) -> bool:
    if not url:
        return False
    try:
        domain = urlparse(url).netloc.lower().lstrip("www.")
        return any(domain == d or domain.endswith("." + d) for d in domain_set)
    except Exception:
        return False


def is_social_media_url(url: str | None) -> bool:
    return _domain_match(url, SOCIAL_MEDIA_DOMAINS)


def is_aggregator_url(url: str | None) -> bool:
    return _domain_match(url, AGGREGATOR_DOMAINS)
