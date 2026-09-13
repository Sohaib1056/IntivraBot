"""Minimal Gemini REST client. Returns None on any failure so callers can
fall back to the offline engine — the interview never hard-fails."""

import json
import re
import time

import requests

from app.config import settings

_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
# A healthy model answers in 2-5s. Kept at 15 so that a primary timeout plus a
# fallback timeout (30s) still lands inside the backend's 35s abort.
_TIMEOUT = 12

# Groq runs first and answers in ~1.5s here, so anything approaching this is
# already an outage rather than a slow reply. Kept well under _TIMEOUT so a
# stuck Groq still leaves Gemini room to answer inside the total budget.
_GROQ_TIMEOUT = 8

# Hard wall-clock cap across every attempt and every fallback model combined.
# A slow-but-non-timeout error response (e.g. a 503 that takes 10s to arrive)
# isn't bounded by _TIMEOUT the way a hung connection is, so retries plus a
# fallback model could otherwise add up past the backend's 35s abort
# (backend/src/services/aiService.js TIMEOUT_MS) even if no single request
# ever times out. Keep a healthy margin under that.
_TOTAL_BUDGET = 28

# Gemini returns 503 "high demand" and 429 (rate limit) fairly often. Both clear
# on their own within a second or two, and dropping to the offline question bank
# on the first blip makes interviews noticeably worse — so retry briefly.
_RETRY_STATUSES = {429, 500, 502, 503, 504}
_RETRY_DELAYS = (0.6, 1.8)  # two retries, then give up and let the caller fall back


def _quota_exhausted(body: str) -> bool:
    """Tell a spent daily quota apart from ordinary rate limiting.

    Google returns 429 for both. The per-minute kind clears almost at once;
    the daily kind does not, and retrying it just delays the fallback.
    """
    text = (body or "").lower()
    return "quota" in text and ("exceeded" in text or "exhausted" in text)


def is_enabled() -> bool:
    """Whether any live model is configured.

    True for Groq alone: `generate()` falls through to it, so an installation
    with only a Groq key still gets real questions rather than the offline bank.
    """
    return bool(settings.gemini_api_key or settings.groq_api_key)


def vision_enabled() -> bool:
    """Whether image understanding is available — Gemini only.

    Kept separate from is_enabled() because the proctoring checks send pictures,
    and Groq's free text models cannot see them. Without this split a Groq-only
    setup would ask Groq to describe an image it never received and act on
    whatever it invented.
    """
    return bool(settings.gemini_api_key)


def generate(
    prompt: str,
    *,
    json_mode: bool = False,
    temperature: float = 0.7,
    image_b64: str | None = None,
    mime: str = "image/jpeg",
) -> str | None:
    """Send a single prompt to Gemini; return the text response (or None).

    `image_b64` attaches one image to the prompt, which is what the visual
    proctoring checks use. Bare base64 only — a `data:` URL prefix is stripped
    here rather than at every call site, because sending one through unnoticed
    fails as an opaque 400 from Google.
    """
    if not is_enabled():
        return None

    parts: list[dict] = [{"text": prompt}]
    if image_b64:
        clean = image_b64
        if clean.startswith("data:"):
            clean = clean.split(",", 1)[-1]
        parts.append({"inline_data": {"mime_type": mime, "data": clean}})

    body = {
        "contents": [{"parts": parts}],
        "generationConfig": {"temperature": temperature},
    }
    if json_mode:
        body["generationConfig"]["responseMimeType"] = "application/json"

    deadline = time.monotonic() + _TOTAL_BUDGET

    # ── Groq first for text ──────────────────────────────────────────────────
    #
    # Measured on this installation: Groq answers in ~1.5s, while Gemini's free
    # tier is capped at 20 requests per day per model and spends the rest of the
    # day returning 429. Each of those 429s still costs the candidate a
    # round-trip plus two retry sleeps (0.6s + 1.8s) before Groq is reached at
    # all — which is most of the 7.5s gap between answering and hearing the
    # next question.
    #
    # So the fast, unexhausted provider goes first and Gemini becomes the
    # fallback. Gemini is still tried whenever Groq fails, so a Groq outage
    # costs nothing but the old ordering.
    #
    # Images are the exception and always go to Gemini below: Groq's free
    # models are text-only and would answer a question about a frame they never
    # received — see _groq's note.
    if image_b64 is None and settings.groq_api_key:
        text = _groq(prompt, json_mode=json_mode, temperature=temperature, deadline=deadline)
        if text is not None:
            return text

    # Try the configured model, then the fallback — a model being unavailable is
    # not the same as the request being bad, and dropping straight to the
    # offline bank makes interviews noticeably worse.
    models = [settings.gemini_model]
    if settings.gemini_fallback_model and settings.gemini_fallback_model != settings.gemini_model:
        models.append(settings.gemini_fallback_model)

    for i, model in enumerate(models):
        if time.monotonic() >= deadline:
            print("Gemini: out of time budget, giving up before trying", model)
            break
        text = _call(model, body, deadline)
        if text is not None:
            if i > 0:
                print(f"Gemini: served by fallback model {model}")
            return text

    # Both providers failed (or, for an image prompt, Gemini alone did). The
    # caller falls back to the offline engine from here.
    return None


# The primary text provider (see generate). Vision never reaches here: Groq's
# free models are text-in/text-out, so the proctoring checks stay on Gemini and
# fall back to "unavailable" rather than to a blind guess.
def _groq(prompt: str, *, json_mode: bool, temperature: float, deadline: float) -> str | None:
    remaining = deadline - time.monotonic()
    if remaining <= 1:
        return None

    # Now that this runs first, cap it well short of the whole budget: a hung
    # Groq request must still leave enough time for Gemini to answer, or moving
    # Groq to the front would have turned its outage into an offline interview.
    attempt_timeout = min(_TIMEOUT, remaining, _GROQ_TIMEOUT)

    body = {
        "model": settings.groq_model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": temperature,
    }
    if json_mode:
        body["response_format"] = {"type": "json_object"}

    try:
        res = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {settings.groq_api_key}"},
            json=body,
            timeout=attempt_timeout,
        )
        if res.status_code == 200:
            return res.json()["choices"][0]["message"]["content"].strip()
        print(f"Groq {res.status_code}: {res.text[:200]}")
    except Exception as e:
        print(f"Groq call failed: {e}")
    return None


def _call(model: str, body: dict, deadline: float) -> str | None:
    url = f"{_BASE}/{model}:generateContent?key={settings.gemini_api_key}"

    for attempt in range(len(_RETRY_DELAYS) + 1):
        remaining = deadline - time.monotonic()
        if remaining <= 1:
            print("Gemini: out of time budget, giving up")
            return None

        try:
            res = requests.post(url, json=body, timeout=min(_TIMEOUT, remaining))
            if res.status_code == 200:
                data = res.json()
                return data["candidates"][0]["content"]["parts"][0]["text"].strip()

            # A 429 comes in two flavours. Per-minute rate limiting clears in a
            # second or two and is worth retrying; an exhausted daily quota
            # will not clear today, so retrying only spends 2.4s of the
            # candidate's time before falling back anyway.
            if res.status_code == 429 and _quota_exhausted(res.text):
                print("Gemini: daily quota exhausted, not retrying")
                return None

            if res.status_code in _RETRY_STATUSES and attempt < len(_RETRY_DELAYS):
                delay = _RETRY_DELAYS[attempt]
                if deadline - time.monotonic() <= delay + 1:
                    print(f"Gemini {res.status_code}, no time left to retry")
                    return None
                print(f"Gemini {res.status_code}, retrying in {delay}s")
                time.sleep(delay)
                continue

            print(f"Gemini {res.status_code}: {res.text[:200]}")
            return None
        except requests.Timeout:
            # Deliberately not retried within this call: the remaining-budget
            # check above already keeps the total (across models/attempts)
            # inside the backend's abort window.
            print("Gemini timed out")
            return None
        except Exception as e:  # network, parsing, quota, etc.
            print(f"Gemini call failed: {e}")
            return None
    return None


def generate_json(
    prompt: str,
    *,
    temperature: float = 0.4,
    image_b64: str | None = None,
    mime: str = "image/jpeg",
) -> dict | None:
    """Ask Gemini for JSON and parse it robustly (handles ```json fences)."""
    text = generate(
        prompt, json_mode=True, temperature=temperature, image_b64=image_b64, mime=mime
    )
    if not text:
        return None
    cleaned = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        # last resort: grab the first {...} block
        m = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                return None
        return None
