from fastapi import APIRouter

from app.core import gemini, proctor
from app.models.schemas import ProctorFrameRequest, ProctorScreenRequest

router = APIRouter()


@router.get("/proctor/status")
def proctor_status():
    """What the proctor can currently do.

    Gaze is local geometry and works whenever the face models are loaded; the
    rest need Gemini Vision. The caller uses this to decide which checks to
    ask for, so it never pays for a call that cannot succeed.
    """
    vision = gemini.vision_enabled()
    return {
        "proctorEnabled": True,
        "gazeEnabled": True,
        "visionEnabled": vision,
        "checks": ["gaze"] + (["objects", "liveness", "screen"] if vision else []),
    }


@router.post("/proctor/frame")
def proctor_frame(body: ProctorFrameRequest):
    """Run the requested checks over one webcam frame.

    Each check is independent and failure-isolated: a Gemini outage must not
    take the local gaze check down with it, and neither may end an interview.
    """
    wanted = set(body.checks or ["gaze"])
    out: dict = {"ok": True}

    if "gaze" in wanted:
        out["gaze"] = proctor.gaze(body.frame, body.gazeBaseline, body.gazeSamples)
    if "objects" in wanted:
        out["objects"] = proctor.objects(body.frame)
    if "liveness" in wanted:
        out["liveness"] = proctor.liveness(body.frame)

    return out


@router.post("/proctor/screen")
def proctor_screen(body: ProctorScreenRequest):
    """Inspect a shared-screen screenshot for cheating aids."""
    return proctor.screen_content(body.shot)
