from pydantic import BaseModel, Field


class ParseTextRequest(BaseModel):
    text: str = Field(..., description="Raw resume text")


class ParseResponse(BaseModel):
    skills: list[str]
    experienceYears: float
    education: list[str]
    charCount: int


class MatchRequest(BaseModel):
    resumeText: str = Field(..., description="Raw resume text")
    jobSkills: list[str] = Field(default_factory=list)
    jobExperience: str = Field(default="", description="e.g. '2-4 years'")
    # Skills ticked on the candidate's profile, and the years they declared —
    # both fill gaps a thin CV leaves behind.
    profileSkills: list[str] = Field(default_factory=list)
    experienceYears: float | None = None


class MatchResponse(BaseModel):
    score: int
    matchedSkills: list[str]
    missingSkills: list[str]
    resumeSkills: list[str]
    resumeExperienceYears: float
    requiredExperienceYears: int


class MatchJob(BaseModel):
    id: str
    skills: list[str] = Field(default_factory=list)
    experience: str = ""


class MatchBatchRequest(BaseModel):
    resumeText: str = ""
    jobs: list[MatchJob] = Field(default_factory=list)
    profileSkills: list[str] = Field(default_factory=list)
    experienceYears: float | None = None


class MatchBatchResult(BaseModel):
    id: str
    score: int
    matchedSkills: list[str]
    missingSkills: list[str]


class MatchBatchResponse(BaseModel):
    results: list[MatchBatchResult]


# ── Interview (Phase 4) ──
class QA(BaseModel):
    question: str = ""
    answer: str = ""
    score: int | None = None
    strengths: list[str] = Field(default_factory=list)
    improvements: list[str] = Field(default_factory=list)


# Who we are interviewing — lets questions be pitched at their real level
# instead of a generic mid-level default.
class CandidateContext(BaseModel):
    skills: list[str] = Field(default_factory=list)
    experienceYears: float | None = None
    headline: str = ""


class QuestionRequest(BaseModel):
    jobTitle: str
    jobSkills: list[str] = Field(default_factory=list)
    previousQA: list[QA] = Field(default_factory=list)
    number: int = 1
    total: int = 5
    language: str = "English"
    field: str = ""  # blank -> auto-detected from title + skills
    candidate: CandidateContext | None = None


class QuestionResponse(BaseModel):
    question: str
    field: str = ""


class ScoreRequest(BaseModel):
    question: str
    answer: str
    jobTitle: str = ""
    jobSkills: list[str] = Field(default_factory=list)
    language: str = "English"
    field: str = ""
    candidate: CandidateContext | None = None


class ScoreResponse(BaseModel):
    score: int
    feedback: str
    strengths: list[str]
    improvements: list[str]


# One line of side conversation — the candidate asking something, or the AI
# answering. Kept apart from QA because these are never scored.
class Turn(BaseModel):
    role: str = ""  # "candidate" | "ai"
    text: str = ""
    intent: str = ""


class ConverseRequest(BaseModel):
    utterance: str
    question: str = ""
    jobTitle: str = ""
    jobSkills: list[str] = Field(default_factory=list)
    previousQA: list[QA] = Field(default_factory=list)
    turns: list[Turn] = Field(default_factory=list)
    language: str = "English"
    field: str = ""
    candidate: CandidateContext | None = None


class ConverseResponse(BaseModel):
    intent: str
    # False when they answered but haven't finished — the interviewer follows up
    # instead of moving to the next question.
    complete: bool = True
    reply: str = ""
    answer: str = ""


class Engagement(BaseModel):
    questionsAsked: int = 0
    issuesReported: int = 0
    note: str = ""


class SummaryRequest(BaseModel):
    jobTitle: str = ""
    qa: list[QA] = Field(default_factory=list)
    passThreshold: int = 75
    turns: list[Turn] = Field(default_factory=list)


class SummaryResponse(BaseModel):
    overallScore: int
    verdict: str
    strengths: list[str]
    improvements: list[str]
    engagement: Engagement = Field(default_factory=Engagement)


# ── Face + Emotion (Phase 5) ──
class FaceAnalyzeRequest(BaseModel):
    frame: str = Field(..., description="Base64 (or data URL) of the live frame")
    baseline: str | None = Field(default=None, description="Base64 of the enrolment/baseline photo")


# ── Visual proctoring (Phase 7) ──
class ProctorFrameRequest(BaseModel):
    frame: str = Field(..., description="Base64 (or data URL) of the webcam frame")
    # Each check costs a Gemini Vision call, so the caller says which it needs
    # rather than paying for all three on every frame.
    checks: list[str] = Field(
        default_factory=lambda: ["gaze"],
        description="Any of: gaze, objects, liveness",
    )
    # This service is stateless, so the caller carries the candidate's resting
    # head position between frames — see proctor.gaze().
    gazeBaseline: float | None = Field(
        default=None, description="Mean resting vertical nose offset so far"
    )
    gazeSamples: int = Field(default=0, description="Frames that baseline averages")


class ProctorScreenRequest(BaseModel):
    shot: str = Field(..., description="Base64 (or data URL) of the screen capture")


# ── Voice biometrics (Phase 6) ──
class VoiceAnalyzeRequest(BaseModel):
    audio: str = Field(..., description="Base64 of Int16 PCM (mono)")
    sampleRate: int = Field(default=16000)
    reference: list[float] | None = Field(default=None, description="Reference speaker embedding")
    interviewer: list[float] | None = Field(default=None, description="Interviewer (TTS) voiceprint to ignore")


class VoiceEmbedRequest(BaseModel):
    audio: str = Field(..., description="Base64 of Int16 PCM (mono)")
    sampleRate: int = Field(default=16000)
