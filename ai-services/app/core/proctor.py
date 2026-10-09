"""Visual and behavioural proctoring beyond identity.

face.py answers "is it them, and are they alone". This module answers the
questions that catch the rest of the ways an interview gets cheated:

  * Is there a phone, a book or notes in shot?
  * Is the camera looking at a real person, or at a photo/screen/deepfake?
  * Are they reading something off to one side instead of looking ahead?
  * Is the screen they are sharing showing ChatGPT, search results or notes?

The first, second and fourth need to *understand* a picture, so they go to
Gemini Vision. The third is pure geometry and runs locally on landmarks the
face detector already produces — no extra model, no extra latency, no cost.

Everything here fails soft. A proctoring check that errors must never end
someone's interview, so every path returns "nothing detected" rather than
raising, and every result carries its own confidence for the caller to weigh.
"""

import numpy as np

from app.core import face, gemini

# Gemini judges a picture, and pictures are ambiguous. Only act on a detection
# the model is actually sure about — below this it is recorded but never
# flagged, because a warning that fires on a coffee mug mistaken for a phone
# destroys the candidate's trust in the whole process.
_MIN_CONFIDENCE = 70


# ── Gaze: are they reading something off-screen? ────────────────────────────
#
# YuNet already returns five landmarks per face (both eyes, nose, both mouth
# corners). Where the nose sits horizontally between the two eyes tells us which
# way the head is turned, with no extra model to load and nothing to send
# anywhere. It is a coarse signal — deliberately so. It cannot tell "glanced at
# the clock" from "read a note", which is exactly why a single frame never
# counts and the caller requires a sustained run of them.

# Nose offset from the eye midpoint, as a fraction of the inter-eye distance.
# A centred face sits near 0. Beyond this the head is clearly turned away.
_GAZE_TURN = 0.42
# Vertical is NOT symmetric with horizontal: on a normal face the nose tip
# already sits well below the eye line, so this offset has a large positive
# resting value (typically ~0.5-0.8 depending on the person and the camera
# angle) even when someone is looking straight ahead. Measuring "down" against
# a threshold near zero therefore flags everybody.
#
# It is measured against a resting baseline instead, and only a clear departure
# from that person's own neutral counts. Until enough samples exist to know
# their neutral, vertical gaze is not judged at all — which is why `direction`
# can be "center" on a frame whose raw offsetY looks large.
_GAZE_DOWN_DELTA = 0.30
# Frames needed before a baseline is trusted. Small enough to settle in the
# first half-minute, large enough not to be set by one odd frame.
_GAZE_BASELINE_MIN = 5


def gaze(
    frame_b64: str | bytes,
    baseline_y: float | None = None,
    baseline_n: int = 0,
) -> dict:
    """Estimate where the candidate is looking from face landmarks alone.

    `baseline_y` is this candidate's own resting vertical nose offset, averaged
    over `baseline_n` earlier frames and passed back in by the caller (this
    service is stateless). Vertical "looking down" is judged against it, because
    the resting value differs per face and per camera angle; without a settled
    baseline only left/right is reported.

    Returns {ok, direction, offsetX, offsetY, lookingAway, baselineReady}.
    `direction` is one of "center", "left", "right", "down" — named from the
    viewer's side of the camera, which is how a reviewer will picture it.
    """
    img = face.decode_image(frame_b64)
    if img is None:
        return {"ok": False, "reason": "decode_failed"}

    faces = face._detect(img)
    if faces.shape[0] == 0:
        return {"ok": False, "reason": "no_face"}

    row = face._largest(faces)
    # YuNet landmark layout: x,y,w,h then (rightEye, leftEye, nose, rightMouth,
    # leftMouth) as x,y pairs from index 4.
    try:
        r_eye = np.array([row[4], row[5]], dtype=np.float32)
        l_eye = np.array([row[6], row[7]], dtype=np.float32)
        nose = np.array([row[8], row[9]], dtype=np.float32)
    except (IndexError, ValueError):
        return {"ok": False, "reason": "no_landmarks"}

    eye_mid = (r_eye + l_eye) / 2.0
    eye_dist = float(np.linalg.norm(l_eye - r_eye))
    # A face too small or too side-on to measure gives a meaningless ratio.
    if eye_dist < 1e-3:
        return {"ok": False, "reason": "face_too_small"}

    # Normalised by inter-eye distance so the result does not change when the
    # candidate leans towards or away from the camera.
    offset_x = float((nose[0] - eye_mid[0]) / eye_dist)
    offset_y = float((nose[1] - eye_mid[1]) / eye_dist)

    baseline_ready = baseline_y is not None and baseline_n >= _GAZE_BASELINE_MIN

    direction = "center"
    if offset_x > _GAZE_TURN:
        direction = "left"
    elif offset_x < -_GAZE_TURN:
        direction = "right"
    elif baseline_ready and offset_y - baseline_y > _GAZE_DOWN_DELTA:
        # Dropped clearly below their own neutral head position.
        direction = "down"

    return {
        "ok": True,
        "direction": direction,
        "offsetX": round(offset_x, 3),
        "offsetY": round(offset_y, 3),
        "lookingAway": direction != "center",
        # The caller folds this frame into the running baseline. Only frames
        # facing forward contribute, or a candidate who spent the first minute
        # reading their notes would calibrate "looking down" as their normal.
        "baselineReady": baseline_ready,
        "baselineSample": round(offset_y, 3) if abs(offset_x) <= _GAZE_TURN else None,
    }


# ── Objects in shot: phone, book, notes, a second screen ────────────────────

_OBJECT_PROMPT = (
    "You are invigilating a live video job interview. Look at this webcam frame "
    "and report ONLY what you can actually see.\n\n"
    "Report these if clearly visible:\n"
    "  phone   — a mobile phone or tablet held, propped up, or in use\n"
    "  notes   — handwritten notes, printed sheets, or an open book/notebook\n"
    "  screen  — a second monitor, laptop or TV whose content is visible\n"
    "  person  — another person, or part of one (a hand, an arm, a reflection)\n\n"
    "Rules you MUST follow:\n"
    "- Report an object only if you can genuinely identify it. A mug, a bottle, "
    "a keyboard, headphones, a mouse, a plain wall poster and a closed laptop the "
    "candidate is using for this interview are all NORMAL — never report them.\n"
    "- A dark, blurred or badly lit frame means you report nothing, not a guess.\n"
    "- Being unsure means NOT reporting it. A false accusation costs someone a job.\n\n"
    "Respond in strict JSON: {\"objects\": [{\"type\": \"phone|notes|screen|person\", "
    "\"confidence\": 0-100, \"note\": \"a few words on what you saw and where\"}]}. "
    "Return an empty array when nothing of concern is visible."
)

_VALID_OBJECTS = {"phone", "notes", "screen", "person"}


def objects(frame_b64: str | bytes) -> dict:
    """Look for phones, notes, extra screens or people in a webcam frame."""
    if not gemini.vision_enabled():
        return {"ok": False, "reason": "vision_unavailable", "objects": []}

    b64 = frame_b64.decode() if isinstance(frame_b64, bytes) else frame_b64
    data = gemini.generate_json(_OBJECT_PROMPT, temperature=0.0, image_b64=b64)
    # `is None` rather than a falsy check: a clean frame legitimately comes back
    # as {"objects": []}, which is the single most common answer here. Reading
    # that as "no response" would mark every honest frame as a failed check.
    if data is None:
        return {"ok": False, "reason": "no_response", "objects": []}

    found = []
    for item in (data.get("objects") or [])[:6]:
        kind = str(item.get("type", "")).lower().strip()
        if kind not in _VALID_OBJECTS:
            continue
        found.append(
            {
                "type": kind,
                "confidence": _clamp(item.get("confidence")),
                "note": str(item.get("note", ""))[:160],
            }
        )

    # Only the confident detections are worth acting on; the rest are kept in
    # the payload so a reviewer can see what was considered and rejected.
    actionable = [o for o in found if o["confidence"] >= _MIN_CONFIDENCE]
    return {"ok": True, "objects": found, "actionable": actionable}


# ── Liveness: a real person, or a photo / video / deepfake? ─────────────────

_LIVENESS_PROMPT = (
    "You are checking whether a webcam is pointed at a real, physically present "
    "person or is being spoofed.\n\n"
    "Signs of a SPOOF:\n"
    "  - The face is clearly a photo: flat, no depth, paper edges or a held print\n"
    "  - The face is on a screen: visible bezel, moire/scan lines, screen glare, "
    "a rectangle border around the face, reflections of a display\n"
    "  - The face looks synthetic: waxy or plastic skin, blurred or warped edges "
    "around the jaw/hairline/ears, eyes and mouth that do not match the head pose, "
    "lighting on the face that disagrees with the room\n\n"
    "Signs of a REAL person: natural skin texture and pores, consistent lighting "
    "and shadow, hair with depth, a background the person is genuinely sitting in.\n\n"
    "Be careful and conservative. A low-quality webcam, a compressed image, poor "
    "lighting, a blurry frame or a virtual/blurred background are all NORMAL and "
    "are NOT spoofing. If you are not clearly convinced it is a spoof, say it is real.\n\n"
    "Respond in strict JSON: {\"live\": true|false, \"confidence\": 0-100, "
    "\"reason\": \"a short phrase naming what you actually saw\"}."
)


def liveness(frame_b64: str | bytes) -> dict:
    """Judge whether the frame shows a live person or a photo/screen/deepfake."""
    if not gemini.vision_enabled():
        return {"ok": False, "reason": "vision_unavailable"}

    # "Is this face real?" is only a question when there IS a face. Asked about
    # a frame with nobody in it, the model answers live:false with total
    # confidence — it is not wrong, there genuinely is no live person — and that
    # became a spoofing accusation. A candidate who stepped out of shot, or
    # whose room went dark, was told their camera showed a deepfake.
    #
    # Absence is already reported as no_face by the caller, which is the honest
    # description of it. So: no face detected, nothing to judge here.
    img = face.decode_image(frame_b64)
    if img is None:
        return {"ok": False, "reason": "decode_failed"}
    if face._detect(img).shape[0] == 0:
        return {"ok": False, "reason": "no_face"}

    b64 = frame_b64.decode() if isinstance(frame_b64, bytes) else frame_b64
    data = gemini.generate_json(_LIVENESS_PROMPT, temperature=0.0, image_b64=b64)
    if not data or "live" not in data:
        return {"ok": False, "reason": "no_response"}

    live = bool(data.get("live"))
    confidence = _clamp(data.get("confidence"))
    return {
        "ok": True,
        "live": live,
        "confidence": confidence,
        "reason": str(data.get("reason", ""))[:160],
        # Only a confident "not live" is worth acting on. An unsure model
        # saying "maybe a photo" must never end an interview.
        "spoofed": (not live) and confidence >= _MIN_CONFIDENCE,
    }


# ── Screen content: what is on the shared screen? ───────────────────────────

_SCREEN_PROMPT = (
    "You are invigilating a live job interview. This is a screenshot of the "
    "candidate's shared screen. Identify anything that would help them cheat.\n\n"
    "Report these if clearly visible:\n"
    "  ai_chat  — ChatGPT, Claude, Gemini, Copilot or any AI assistant\n"
    "  search   — a search engine results page, or Stack Overflow / a Q&A site\n"
    "  notes    — a document, notes app, PDF or spreadsheet with prepared content\n"
    "  messaging— WhatsApp, Slack, Teams, Discord or any chat app\n"
    "  code     — an IDE or code editor showing prepared code\n\n"
    "Rules you MUST follow:\n"
    "- The interview page itself is expected and is NEVER reported.\n"
    "- IGNORE the browser and OS frame: tab titles, the address bar, bookmarks, "
    "toolbar or extension buttons (e.g. an 'Ask Gemini' or Copilot button), and "
    "taskbar icons. Only report content actually open and readable in a window.\n"
    "- A blank desktop, a wallpaper, a clock, or an empty browser tab are normal.\n"
    "- Report only what is actually legible on screen. Do not guess from an icon "
    "in a taskbar or a minimised window.\n"
    "- If unsure, report nothing.\n\n"
    "Respond in strict JSON: {\"findings\": [{\"type\": "
    "\"ai_chat|search|notes|messaging|code\", \"confidence\": 0-100, "
    "\"note\": \"what was on screen, in a few words\"}]}. "
    "Return an empty array when the screen shows nothing of concern."
)

_VALID_SCREEN = {"ai_chat", "search", "notes", "messaging", "code"}


def screen_content(shot_b64: str | bytes) -> dict:
    """Look for cheating aids on a shared-screen screenshot."""
    if not gemini.vision_enabled():
        return {"ok": False, "reason": "vision_unavailable", "findings": []}

    b64 = shot_b64.decode() if isinstance(shot_b64, bytes) else shot_b64
    data = gemini.generate_json(_SCREEN_PROMPT, temperature=0.0, image_b64=b64)
    # As in objects(): a clean screen returns {"findings": []}, which is a
    # successful check reporting nothing — not a missing response.
    if data is None:
        return {"ok": False, "reason": "no_response", "findings": []}

    found = []
    for item in (data.get("findings") or [])[:6]:
        kind = str(item.get("type", "")).lower().strip()
        if kind not in _VALID_SCREEN:
            continue
        found.append(
            {
                "type": kind,
                "confidence": _clamp(item.get("confidence")),
                "note": str(item.get("note", ""))[:160],
            }
        )

    actionable = [f for f in found if f["confidence"] >= _MIN_CONFIDENCE]
    return {"ok": True, "findings": found, "actionable": actionable}


def _clamp(v) -> int:
    try:
        return max(0, min(100, int(round(float(v)))))
    except (TypeError, ValueError):
        return 0
