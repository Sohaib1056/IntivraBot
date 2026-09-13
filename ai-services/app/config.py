from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    port: int = 8000
    allowed_origins: str = "http://localhost:5000"
    gemini_api_key: str = ""
    # Pinned deliberately: the 'gemini-flash-latest' alias this used to point at
    # returns 503 "high demand" on every call for this key, which silently sent
    # every interview to the offline question bank.
    gemini_model: str = "gemini-3.5-flash"
    # Tried when the primary is unavailable, before giving up to the offline bank.
    gemini_fallback_model: str = "gemini-3.5-flash-lite"

    # ── Groq: the last resort before the offline question bank ──────────────
    # Gemini's free tier allows 20 requests/day per model, which one interview
    # can exhaust on its own — and a spent daily quota does not clear the way a
    # rate-limit does, so both Gemini models can be down for the rest of the
    # day. Groq's free tier is thousands of requests/day, needs no card, and
    # keeps interviews running on a real model instead of the generic bank.
    groq_api_key: str = ""
    # Verified against this key on 2026-09-13: the Llama models this originally
    # pointed at are gone from Groq's free catalogue (404 model_not_found), and
    # the Qwen ones 429 on interview-sized prompts. gpt-oss-120b handles both
    # Roman Urdu and JSON mode. Re-list with GET /openai/v1/models if questions
    # start coming from the offline bank again.
    groq_model: str = "openai/gpt-oss-120b"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


settings = Settings()
