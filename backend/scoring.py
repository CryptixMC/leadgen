"""Unified lead scoring — single source of truth for the backend.

Import calculate_score in routers; do not re-implement scoring elsewhere
inside the backend package. scripts/score_leads.py intentionally duplicates
this logic because it cannot import from the backend package.
"""


def calculate_score(data: dict) -> tuple[int, str]:
    """Return (score, priority) for a lead dict.

    Score is capped at 100.
    Priority is 'high' (>=60), 'medium' (>=30), or 'low' (<30).
    """
    score = 0

    # Website presence
    if not data.get("has_website"):
        if data.get("website_inferred"):
            score += 20
        else:
            score += 40

    # Mobile friendliness
    if data.get("mobile_friendly") is False:
        score += 20

    # PageSpeed mobile — graduated tiers
    pagespeed_mobile = data.get("pagespeed_mobile")
    if pagespeed_mobile is not None:
        if pagespeed_mobile < 25:
            score += 20
        elif pagespeed_mobile < 50:
            score += 15
        elif pagespeed_mobile < 75:
            score += 5

    # PageSpeed SEO
    pagespeed_seo = data.get("pagespeed_seo")
    if pagespeed_seo is not None:
        if pagespeed_seo < 50:
            score += 10
        elif pagespeed_seo < 80:
            score += 5

    # PageSpeed best practices
    pagespeed_bp = data.get("pagespeed_best_practices")
    if pagespeed_bp is not None:
        if pagespeed_bp < 50:
            score += 10
        elif pagespeed_bp < 80:
            score += 5

    # HTTPS
    if not data.get("has_https"):
        score += 10

    # Review count
    if (data.get("review_count") or 0) < 10:
        score += 10

    # Yelp presence (null-safe; only meaningful when GBP is confirmed)
    if data.get("also_on_yelp") is False and data.get("has_gbp"):
        score += 5

    score = min(score, 100)
    priority = "high" if score >= 60 else "medium" if score >= 30 else "low"
    return score, priority
