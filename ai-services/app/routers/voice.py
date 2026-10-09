from fastapi import APIRouter

from app.core import voice
from app.models.schemas import VoiceAnalyzeRequest, VoiceEmbedRequest

router = APIRouter()


@router.get("/voice/status")
def voice_status():
    """Whether the voice-biometrics model (Resemblyzer) is importable, and
    whether it has finished loading — until it has, an analyze call can take
    minutes and the caller is better off waiting than timing out."""
    return {"voiceEnabled": voice.voice_available(), "warm": voice.is_warm()}


@router.post("/voice/analyze")
def voice_analyze(body: VoiceAnalyzeRequest):
    """Speaker embedding + identity match (vs reference) + multi-voice check
    for one answer's audio clip (raw Int16 PCM)."""
    return voice.analyze(body.audio, body.sampleRate, body.reference, body.interviewer)


@router.post("/voice/embed")
def voice_embed(body: VoiceEmbedRequest):
    """Voiceprint only — learns the interviewer's voice as the mic hears it."""
    return voice.embed_only(body.audio, body.sampleRate)
