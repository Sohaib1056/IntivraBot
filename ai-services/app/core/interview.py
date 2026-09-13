"""AI interview logic: adaptive question generation, answer scoring, and a
final summary. Uses Gemini when configured, otherwise a deterministic offline
engine so the whole flow works end-to-end without an API key."""

from app.core import gemini
from app.core.extract import extract_skills
from app.core.fields import detect_field, rubric

# ── Offline question bank (used when Gemini is not configured) ──
_GENERIC_QUESTIONS = [
    "Tell us briefly about yourself and your background.",
    "Describe a challenging project you worked on and your role in it.",
    "How do you approach learning a new technology or tool?",
    "Tell us about a time you worked in a team to solve a problem.",
    "Where do you see your skills adding the most value in this role?",
    "How do you handle tight deadlines or competing priorities?",
    "Describe a mistake you made and what you learned from it.",
]


# The opener, per language. Used when Gemini is unavailable — see next_question.
_OPENERS = {
    "English": (
        "Hello, and thanks for joining. To start us off, could you tell me a "
        "little about yourself and what you have been working on recently?"
    ),
    "Urdu": (
        "السلام علیکم، انٹرویو میں شامل ہونے کا شکریہ۔ آغاز کے لیے، اپنے بارے میں "
        "کچھ بتائیے اور یہ کہ آپ حال ہی میں کس کام پر کام کر رہے تھے؟"
    ),
    "Roman Urdu": (
        "Assalam-o-Alaikum, interview mein shamil hone ka shukriya. Shuruaat ke "
        "liye, apne baare mein kuch bataiye aur yeh ke aap recently kis cheez par "
        "kaam kar rahe the?"
    ),
    "Both": (
        "Assalam-o-Alaikum, thanks for joining. Shuruaat ke liye, apne baare mein "
        "thora bataiye — your background, aur recently aap kis project par kaam "
        "kar rahe the?"
    ),
}


def _skill_question(skill: str) -> str:
    return f"Can you describe your hands-on experience with {skill} and give a concrete example?"


def _level(years) -> str:
    """Difficulty band, so a fresher isn't asked staff-engineer questions."""
    try:
        y = float(years or 0)
    except (TypeError, ValueError):
        y = 0.0
    if y < 1:
        return "entry level (fresher) — keep questions foundational and practical"
    if y < 3:
        return "junior/mid level — expect hands-on detail but not architecture ownership"
    if y < 6:
        return "mid/senior level — expect design trade-offs and ownership"
    return "senior level — expect architecture, mentoring and judgement at scale"


# How each supported language is described to the model. Roman Urdu needs
# spelling out — asked for "Roman Urdu" alone the model tends to drift into
# Urdu script or into English, and a candidate who chose it gets neither.
_LANGUAGE_LINES = {
    "English": "English",
    "Urdu": "Urdu, written in Urdu script (اردو)",
    "Roman Urdu": (
        "Roman Urdu — Urdu written in the Latin alphabet, the way Pakistanis "
        "write in everyday chat (e.g. 'Aap ne is project mein kya kaam kiya?'). "
        "Never use Urdu script, and do not switch to plain English. Ordinary "
        "technical words (React, database, API, deploy) stay in English, exactly "
        "as people say them"
    ),
    # What most Pakistani interviews actually sound like: the interviewer moves
    # between English and Roman Urdu mid-sentence, and so does the candidate.
    # Forcing either one on its own makes a bilingual candidate sound worse than
    # they are — they spend effort translating instead of answering.
    "Both": (
        "a natural mix of English and Roman Urdu, the way bilingual Pakistani "
        "professionals actually speak — switching between the two mid-sentence "
        "wherever it reads more naturally (e.g. 'Aap ne is project mein "
        "authentication kaise handle kiya?'). Never use Urdu script. Technical "
        "terms always stay in English. The candidate may answer in English, in "
        "Roman Urdu, or in a mix of both, and all three are equally acceptable — "
        "never penalise or comment on which they chose"
    ),
}


# A spoken question has to survive being heard once. Past roughly this length
# the candidate is reconstructing the question instead of answering it, and
# multi-part questions ("walk me through X, and how did you handle Y, and what
# about Z") get half-answered — which then scores as a weak answer even though
# the fault was the question's.
#
# Asking for it in the prompt is not enough on its own: models drift over it,
# especially when the field rubric asks for depth. So it is checked and, when
# needed, enforced by a second call.
_MAX_QUESTION_WORDS = 25
# Allow a little slack before paying for a rewrite — 27 words is not the
# problem this guard exists to solve, and every rewrite costs a request.
_QUESTION_WORD_SLACK = 4


def _word_count(text: str) -> int:
    return len([w for w in (text or "").split() if w.strip()])


def _first_sentence(text: str) -> str:
    """The first complete sentence, preferring the first question in the text.

    A long question is nearly always several questions joined together, and the
    first one is the one worth asking — the rest are the follow-ups a real
    interviewer would ask afterwards anyway.
    """
    text = (text or "").strip()
    # Prefer cutting at a question mark: that is where the actual question ends.
    for mark in ("? ", "?\n"):
        idx = text.find(mark)
        if idx != -1:
            return text[: idx + 1].strip()
    if text.endswith("?") and _word_count(text) <= _MAX_QUESTION_WORDS:
        return text
    # Otherwise fall back to the first sentence-ending punctuation.
    for sep in (". ", "! ", "\n"):
        idx = text.find(sep)
        if idx != -1:
            return text[: idx + 1].strip()
    return text


def _hard_trim(question: str) -> str:
    """Last resort: cut to the word limit without leaving a dangling clause.

    Only reached when the model has twice failed to produce something short
    enough, so the choice is between a clipped question and an unusable one.
    Cutting at the last comma or connective keeps it readable; the question mark
    is restored so it still reads as a question.
    """
    words = question.split()
    if len(words) <= _MAX_QUESTION_WORDS:
        return question
    clipped = " ".join(words[:_MAX_QUESTION_WORDS])
    # Back off to the last natural break so we don't end mid-clause.
    for sep in (",", " and", " but", " or", " which", " that"):
        idx = clipped.rfind(sep)
        if idx > len(clipped) * 0.5:
            clipped = clipped[:idx]
            break
    # Never end on a word that promises more to come — "…designed from scratch
    # including?" reads as a broken sentence rather than a question. Drop
    # trailing connectives until it ends on something that can carry a question
    # mark.
    dangling = {
        "including", "and", "but", "or", "with", "for", "to", "of", "in", "on",
        "at", "by", "from", "as", "that", "which", "while", "when", "where",
        "the", "a", "an", "your", "their", "its", "this", "these", "those",
        "about", "over", "into", "how", "what", "why", "if", "so", "than",
    }
    parts = clipped.rstrip(" ,;:-").split()
    while parts and parts[-1].strip(".,;:-").lower() in dangling:
        parts.pop()
    if not parts:
        return clipped.rstrip(" ,;:-") + "?"
    return " ".join(parts).rstrip(" ,;:-") + "?"


def _enforce_length(question: str, language: str | None) -> str:
    """Guarantee a question short enough to be asked out loud.

    Four steps, each a fallback for the one before, because asking the model
    nicely is not a guarantee and the caller needs one:
      1. Already short enough — nothing to do.
      2. It is several questions joined up: keep the first.
      3. Ask the model to rewrite it.
      4. Cut it in code.

    Step 4 means this NEVER returns something over the limit, which is the
    whole point: a question the candidate cannot hold in their head produces a
    half-answer, and that half-answer is then scored as if it were their best.
    """
    limit = _MAX_QUESTION_WORDS + _QUESTION_WORD_SLACK
    if _word_count(question) <= limit:
        return question

    # 2. Most over-long questions are two or three questions in a row. Taking
    #    the first is free, needs no model call, and keeps the wording exactly
    #    as written rather than paraphrasing it.
    first = _first_sentence(question)
    if first and _word_count(first) <= limit:
        return first

    # 3. Genuinely one long sentence — the model has to do the rewriting, since
    #    cutting mid-clause in code would mangle it.
    shortened = gemini.generate(
        "Rewrite this interview question so it can be asked out loud in one "
        f"breath: at most {_MAX_QUESTION_WORDS} words, one sentence, asking about "
        "ONE thing only. Keep the same subject and the same difficulty — if it "
        "asks about several things, keep only the first. Do not add a greeting "
        "or any preamble.\n"
        f"Answer in {_language_line(language)}.\n\n"
        f"Question: {question}\n\n"
        "Return ONLY the rewritten question.",
        temperature=0.3,
    )
    if shortened:
        shortened = shortened.strip().strip('"')
        if _word_count(shortened) <= limit:
            return shortened
        # Even the rewrite ran long — its first sentence may still be usable.
        first = _first_sentence(shortened)
        if first and _word_count(first) <= limit:
            return first
        question = shortened if _word_count(shortened) < _word_count(question) else question

    # 4. Nothing worked. Clip it rather than ask something unanswerable.
    return _hard_trim(question)


def _language_line(language: str | None) -> str:
    """The instruction text for the requested language."""
    return _LANGUAGE_LINES.get(language or "English", _LANGUAGE_LINES["English"])


def _candidate_block(candidate: dict | None) -> str:
    """What we know about this specific candidate, for the prompt."""
    if not candidate:
        return ""
    skills = ", ".join((candidate.get("skills") or [])[:20])
    parts = []
    if skills:
        parts.append(f"Skills on their CV: {skills}.")
    if candidate.get("headline"):
        parts.append(f"They describe themselves as: {candidate['headline']}.")
    years = candidate.get("experienceYears")
    if years is not None:
        parts.append(f"Experience: {years} year(s) — {_level(years)}.")
    if not parts:
        return ""
    return "About this candidate:\n" + " ".join(parts) + "\n"


# ── Question generation ──
def next_question(
    job_title,
    job_skills,
    previous_qa,
    number,
    total,
    language="English",
    field=None,
    candidate=None,
):
    field_id = field or detect_field(job_title, job_skills)
    guide = rubric(field_id)

    if gemini.is_enabled():
        history = "\n".join(
            f"Q{i+1}: {qa.get('question','')}\nA{i+1}: {qa.get('answer','')}"
            for i, qa in enumerate(previous_qa or [])
        ) or "(no previous answers yet)"
        # No real interviewer opens with a system-design question. Warming up
        # is not politeness — a candidate whose first words are their own
        # background settles, and the answers that follow are worth more.
        if number == 1:
            stage = (
                "This is the FIRST question, so open the interview the way a human "
                "interviewer does. Greet them warmly by starting with a short hello, "
                "then ask them to introduce themselves and walk you through their "
                "background and what they have been working on.\n"
                "It MUST be an easy, open, conversational opener. Do NOT ask anything "
                "technical, do NOT ask about a specific technology, and do NOT ask a "
                "problem-solving question — those come later.\n"
            )
        elif number == 2:
            stage = (
                "This is the second question. Ease into the role: ask about their "
                "general experience with the kind of work this job involves, or what "
                "drew them to it. Keep it light — save the deep technical probing for "
                "later questions.\n"
            )
        else:
            stage = (
                f"This is question {number} of {total}, so the interview is under way. "
                "Probe properly now: build on their previous answers and, if an answer "
                "was vague, drill into it.\n"
            )

        prompt = (
            f"You are an experienced {guide['label']} interviewer hiring for a '{job_title}' role.\n"
            f"Required skills: {', '.join(job_skills) or 'general'}.\n\n"
            f"{_candidate_block(candidate)}\n"
            f"What to probe for this field: {guide['probe']}.\n"
            f"How to ask: {guide['style']}\n"
            f"Constraint: {guide['avoid']}\n\n"
            f"Conversation so far:\n{history}\n\n"
            f"{stage}\n"
            f"Ask ONE interview question (#{number} of {total}). "
            f"Never repeat a question already asked. "
            f"Pitch the difficulty at the candidate's level. "
            f"Speak it aloud as a person would — one plain spoken sentence, no bullet "
            f"points, no numbered sub-parts, and at most {_MAX_QUESTION_WORDS} words. "
            f"The candidate HEARS this rather than reading it, so a question too long "
            f"to hold in your head is a bad question however well written. Ask about "
            f"ONE thing: if you find yourself joining two questions with 'and', drop "
            f"the second — you can follow up afterwards.\n"
            f"Ask exactly one question, in {_language_line(language)}. "
            f"Return ONLY the question text, no numbering or preamble."
        )
        text = gemini.generate(prompt, temperature=0.8)
        if text:
            return _enforce_length(text.strip().strip('"'), language)

    # Offline fallback. Alternates this field's own bank with skill-specific
    # questions, so a network engineer isn't handed developer questions just
    # because Gemini is unavailable.
    #
    # Question 1 is always the warm-up, matching the live path above: an
    # interview that opens cold is a worse interview whether or not Gemini
    # happened to be reachable.
    # Every return below goes through _enforce_length too. The banks are all
    # well inside the limit today, but nothing stops a future edit from adding
    # a long one, and "no question is ever too long" has to hold everywhere or
    # it is not a guarantee.
    if number == 1:
        return _enforce_length(
            _OPENERS.get(language or "English", _OPENERS["English"]), language
        )
    idx = max(0, number - 1)
    if job_skills and idx % 2 == 1:
        skill = job_skills[(idx // 2) % len(job_skills)]
        return _enforce_length(_skill_question(skill), language)
    bank = guide.get("fallbacks") or _GENERIC_QUESTIONS
    return _enforce_length(bank[(idx // 2) % len(bank)], language)


# ── Conversation: understanding what the candidate just said ──
#
# A real interview is not a form. The candidate might answer the question, ask
# one of their own, say the audio cut out, or ask for a moment. Treating all of
# that as "the answer" and scoring it is what made the old flow feel robotic —
# and it scored people badly for saying "sorry, could you repeat that?".
#
# So every utterance is classified first, and only a genuine answer is scored.

_INTENTS = ("answer", "question", "issue", "clarification", "smalltalk")

# Phrases that betray an intent even with no model available. Deliberately
# conservative: when the offline path is unsure it says "answer", because
# mis-scoring an answer as chatter loses the candidate their marks entirely.
_QUESTION_CUES = (
    "can i ask", "i have a question", "may i ask", "what about", "could you tell me",
    "is this role", "does the role", "what is the team", "who would i", "how many",
    "what does the company", "quick question", "one question",
)
_ISSUE_CUES = (
    "can't hear", "cannot hear", "can not hear", "didn't hear", "did not hear",
    "mic is not", "mic isn't", "microphone is not", "microphone isn't",
    "not working", "cut out", "cutting out", "broke up", "breaking up",
    "internet is", "connection is", "lagging", "freeze", "frozen", "froze",
    "repeat that", "say that again", "repeat the question", "come again",
)
_CLARIFY_CUES = (
    "what do you mean", "do you mean", "are you asking", "just to clarify",
    "should i talk about", "in what sense", "which one do you",
)


def _offline_intent(text: str) -> str:
    low = (text or "").strip().lower()
    if not low:
        return "answer"
    if any(c in low for c in _ISSUE_CUES):
        return "issue"
    if any(c in low for c in _CLARIFY_CUES):
        return "clarification"
    if any(c in low for c in _QUESTION_CUES):
        return "question"
    # A short utterance that is only a question is a question, not an answer.
    if low.endswith("?") and len(low.split()) <= 25:
        return "question"
    return "answer"


def _offline_reply(intent: str, question: str) -> str:
    if intent == "issue":
        return (
            "No problem, thanks for flagging it — take your time. "
            f"The question again: {question}"
        )
    if intent == "clarification":
        return (
            "Sure, let me put it another way. Answer it from your own experience — "
            f"whatever you have actually done is what I'm interested in. {question}"
        )
    if intent == "question":
        return (
            "That's a fair question. I don't have the full detail on that from here — "
            "the hiring team will cover it properly at the next stage, and I'll note that you asked. "
            f"Shall we carry on? {question}"
        )
    return "Got it, thanks. Let's keep going."


def converse(
    utterance,
    question,
    job_title,
    job_skills=None,
    previous_qa=None,
    turns=None,
    language="English",
    field=None,
    candidate=None,
):
    """Classify what the candidate just said and, if it isn't an answer, reply.

    Returns {intent, complete, reply, answer}:
      intent   — one of _INTENTS
      complete — False when they answered but clearly haven't finished, so the
                 interviewer should probe rather than move on
      reply    — what the interviewer says back ("" when the answer is complete,
                 because the next question is the reply)
      answer   — the part of the utterance to score, when they answered *and*
                 asked something in the same breath. Empty means "not an answer".
    """
    job_skills = job_skills or []
    guide = rubric(field or detect_field(job_title, job_skills))

    if gemini.is_enabled():
        history = "\n".join(
            f"Q: {qa.get('question','')}\nA: {qa.get('answer','')}"
            for qa in (previous_qa or [])[-3:]
        ) or "(this is the first question)"
        recent = "\n".join(
            f"{t.get('role','')}: {t.get('text','')}" for t in (turns or [])[-6:]
        ) or "(no side conversation yet)"
        prompt = (
            f"You are a warm, professional {guide['label']} interviewer conducting a live "
            f"interview for a '{job_title}' role. You are mid-interview, speaking with the candidate.\n\n"
            f"The question you just asked: {question}\n\n"
            f"Earlier in the interview:\n{history}\n\n"
            f"Recent side conversation:\n{recent}\n\n"
            f"The candidate just said:\n\"{utterance}\"\n\n"
            "Work out what they are doing:\n"
            "  answer        — they are answering your question\n"
            "  question      — they are asking you something (about the role, team, process, company)\n"
            "  issue         — they hit a problem (audio, connection, didn't hear you, need a moment)\n"
            "  clarification — they want your question explained before they answer\n"
            "  smalltalk     — pleasantries, thinking aloud, nothing to score\n\n"
            "When it IS an answer, decide whether they have actually finished answering:\n"
            "  complete   — they gave a real answer to what you asked. Move on.\n"
            "  incomplete — they trailed off mid-thought, or answered only part of a "
            "multi-part question, or said something so vague it is not yet an answer "
            "(\"I've used it a bit\", \"yeah I know that one\").\n"
            "Set \"complete\" to true or false. When false, write a short spoken follow-up in "
            "\"reply\" that presses on exactly the missing part — the way a real interviewer says "
            "\"can you give me an example of that?\" or \"and how did you handle the errors?\". "
            "Ask about what they left out, never re-read the original question.\n"
            "Be fair: a brief but genuinely complete answer is complete. Only mark it incomplete "
            "when a real interviewer would actually push for more.\n"
            "If they answered AND asked something, set intent to \"answer\", put the answer part in "
            "\"answer\", and briefly address their aside in \"reply\".\n"
            "Otherwise write what you would actually say out loud: acknowledge them like a human "
            "interviewer would, help if you can, then steer back to the question.\n"
            "Your reply is the ONLY thing the candidate hears — the question is not read out "
            "again separately. So when they did not hear you, want it repeated, or need it "
            "explained, your reply MUST end by actually asking the question again in full. "
            "\"Sure, let me repeat that\" on its own leaves them with nothing, and they will "
            "ask a second time.\n"
            "CRITICAL — you know nothing about this employer beyond the job title and required "
            "skills listed above. You do NOT know the salary, the location or whether it is "
            "remote, the team size, who they would report to, the benefits, the other stages, or "
            "when they will hear back. If they ask about any of that you MUST say you don't have "
            "that detail and that you will pass the question to the hiring team. Never guess and "
            "never state such a detail as fact, even a plausible-sounding one — a candidate acting "
            "on an invented answer is worse than no answer. You may only explain what the question "
            "itself is asking, or how the interview works mechanically.\n"
            "Never reveal the score, how answers are graded, or what a good answer would be.\n"
            "Keep the reply under 60 words, spoken plainly, no lists or markdown.\n"
            f"Speak in {_language_line(language)}.\n\n"
            'Respond in strict JSON with keys: intent (one of "answer", "question", "issue", '
            '"clarification", "smalltalk"), complete (boolean — only meaningful when intent is '
            '"answer"), reply (string), answer (string — the scorable part, '
            'or "" if they did not answer).'
        )
        # Low temperature: the classification decides whether someone gets
        # scored at all, so it must not wobble between runs.
        data = gemini.generate_json(prompt, temperature=0.3)
        if data and data.get("intent") in _INTENTS:
            intent = data["intent"]
            return {
                "intent": intent,
                # Only an answer can be incomplete; everything else was never an
                # attempt to answer in the first place.
                "complete": bool(data.get("complete", True)) if intent == "answer" else True,
                "reply": str(data.get("reply") or "")[:600],
                "answer": str(data.get("answer") or (utterance if intent == "answer" else ""))[:5000],
            }

    intent = _offline_intent(utterance)
    return {
        "intent": intent,
        # With no model to judge depth, treat every answer as finished. Probing
        # on a word count alone would nag candidates who gave a good short
        # answer, which is worse than occasionally moving on too early.
        "complete": True,
        "reply": "" if intent == "answer" else _offline_reply(intent, question),
        "answer": utterance if intent == "answer" else "",
    }


# ── Answer scoring ──
def score_answer(question, answer, job_title, job_skills, language="English", field=None, candidate=None):
    guide = rubric(field or detect_field(job_title, job_skills))

    if gemini.is_enabled():
        prompt = (
            f"You are an experienced {guide['label']} interviewer scoring one answer "
            f"for a '{job_title}' role.\n"
            f"Required skills: {', '.join(job_skills) or 'general'}.\n"
            f"For this field, a strong answer shows: {guide['probe']}.\n"
            f"{_candidate_block(candidate)}"
            f"Judge the answer against what is reasonable for their experience level, "
            f"not against a perfect textbook answer.\n"
            # Without this the model quietly marks down Roman Urdu and mixed
            # answers as "unclear" or "poorly articulated" — penalising a
            # candidate for the language the employer chose for them.
            f"This interview is conducted in {_language_line(language)}. "
            f"Score ONLY the substance of what they said. Never reward or penalise "
            f"the language, spelling, grammar or accent — an answer in Roman Urdu, "
            f"or one that mixes English and Roman Urdu, must score exactly the same "
            f"as the identical answer in fluent English. Speech-to-text errors and "
            f"informal spelling are not the candidate's mistakes.\n\n"
            f"Question: {question}\n"
            f"Answer: {answer}\n\n"
            f"Score honestly — a vague or evasive answer must score low even if it is well worded, "
            f"and an answer that is off-topic for this field scores low regardless of length.\n\n"
            # An explicit band table is what keeps two candidates who gave
            # equally good answers from landing 13 points apart.
            f"Use this scale, and pick the band the answer actually fits:\n"
            f"  90-100  Specific, correct, and shows depth: real examples, trade-offs or measurable outcomes.\n"
            f"  75-89   Solid and relevant with a concrete example, but thin on depth or reasoning.\n"
            f"  60-74   Correct but general - little evidence they have done this themselves.\n"
            f"  40-59   Partly relevant, vague, or leaves the question half answered.\n"
            f"  20-39   Generic filler, or mostly restates the question.\n"
            f"  0-19    Off-topic, empty, or a list of keywords with no answer in it.\n\n"
            f"A short answer that is specific and correct beats a long one that says nothing.\n"
            f"Respond in strict JSON with keys: "
            f'score (integer 0-100), feedback (one short sentence), '
            f"strengths (array of up to 2 short phrases), "
            f"improvements (array of up to 2 short phrases)."
        )
        # Temperature 0 for scoring: the same answer must earn the same mark
        # every time, or two candidates who said the same thing are ranked by
        # chance. Creativity belongs in question generation, not marking.
        data = gemini.generate_json(prompt, temperature=0.0)
        if data and "score" in data:
            return {
                "score": _clamp(data.get("score")),
                "feedback": str(data.get("feedback", ""))[:300],
                "strengths": _as_list(data.get("strengths")),
                "improvements": _as_list(data.get("improvements")),
            }

    return _fallback_score(answer, job_skills)


# Words that carry no information about competence. A long answer built from
# these is padding, and scoring it on length alone rewards waffle.
_FILLER = {
    "basically", "actually", "really", "very", "just", "quite", "always", "definitely",
    "passionate", "hardworking", "hard", "worker", "team", "player", "dedicated",
    "motivated", "enthusiastic", "believe", "think", "feel", "try", "best", "good",
    "great", "nice", "thing", "things", "stuff", "etc", "many", "various", "several",
}

# Signals that an answer describes something the candidate actually did, rather
# than what they believe about themselves.
# Ordinary connective words. Real sentences are full of them; a pasted list of
# technologies has none.
_FUNCTION_WORDS = {
    "the", "a", "an", "and", "or", "but", "if", "so", "because", "then", "than",
    "with", "without", "to", "from", "for", "of", "in", "on", "at", "by", "as",
    "that", "this", "these", "those", "it", "its", "was", "were", "is", "are",
    "we", "i", "my", "our", "had", "have", "has", "did", "do", "does", "when",
    "where", "which", "while", "after", "before", "over", "into", "about",
}

_SPECIFIC_MARKERS = (
    "i built", "i wrote", "i designed", "i implemented", "i used", "i created",
    "i led", "i fixed", "i debugged", "i migrated", "i deployed", "i added",
    "we built", "we used", "for example", "such as", "resulted in", "reduced",
    "improved", "increased", "the problem was", "the issue was", "so i", "because",
)


def _fallback_score(answer, job_skills):
    """Heuristic score used when the AI service is unavailable.

    Deliberately harder to game than a length-plus-keyword count: that version
    scored a repeated keyword list higher than a thoughtful answer that simply
    did not name the exact skills, which is backwards. Four signals are blended
    so no single one can carry a weak answer.
    """
    answer = (answer or "").strip()
    tokens = [t.strip(".,!?;:()\"'").lower() for t in answer.split()]
    tokens = [t for t in tokens if t]
    words = len(tokens)

    if words < 5:
        return {
            "score": max(0, words * 2),
            "feedback": "Too short to assess - describe what you did and how.",
            "strengths": [],
            "improvements": ["Give a concrete example", "Explain your reasoning"],
        }

    lower = answer.lower()

    # 1. Substance: length, but saturating early so rambling gains nothing.
    length_score = min(1.0, words / 60.0)

    # 2. Relevance: skills named, credited generously (2 of the required set
    #    is already a relevant answer - naming all of them is not the point).
    mentioned = set(extract_skills(answer))
    relevant = mentioned.intersection(set(job_skills)) if job_skills else mentioned
    target = min(len(job_skills or []), 2) or 1
    relevance = min(1.0, len(relevant) / target)

    # 3. Specificity: did they describe real work? This is what separates a
    #    genuine short answer from a long generic one.
    specificity = min(1.0, sum(m in lower for m in _SPECIFIC_MARKERS) / 3.0)
    # Concrete numbers ("10,000 rows", "200ms", "3 seconds") are strong evidence.
    if any(t.replace(",", "").replace(".", "").isdigit() for t in tokens):
        specificity = min(1.0, specificity + 0.25)

    # 4. Density: what share of the answer is meaningful, and how varied is it?
    #    Repetition drives this down, which is what defeats keyword stuffing.
    unique_ratio = len(set(tokens)) / words
    filler_ratio = sum(t in _FILLER for t in tokens) / words
    density = max(0.0, min(1.0, unique_ratio - filler_ratio))

    score = round(
        (0.20 * length_score + 0.25 * relevance + 0.35 * specificity + 0.20 * density) * 100
    )

    # A list of technologies is not an answer to anything. Prose has function
    # words - "the", "a", "with", "to" - and a keyword dump has almost none, so
    # their absence is the clearest signal that nothing was actually said.
    function_words = sum(t in _FUNCTION_WORDS for t in tokens) / words
    if words >= 8 and function_words < 0.10:
        score = min(score, 15)
    # A wall of repeated words is likewise not an answer.
    if unique_ratio < 0.60:
        score = min(score, 20)
    score = _clamp(score)

    if specificity < 0.34:
        feedback = "Describe something you actually built or solved, and how."
    elif relevance < 0.34:
        feedback = "Good detail - tie it more directly to the skills this role needs."
    elif words < 25:
        feedback = "On the right track - a little more depth would strengthen it."
    else:
        feedback = "Clear, specific answer with relevant detail."

    strengths = []
    if specificity >= 0.5:
        strengths.append("Concrete example")
    if relevance >= 0.5:
        strengths.append("Relevant to the role")
    improvements = []
    if specificity < 0.5:
        improvements.append("Add a specific example")
    if relevance < 0.5:
        improvements.append("Mention the role's key skills")
    if words < 25:
        improvements.append("Go into more depth")

    return {
        "score": score,
        "feedback": feedback,
        "strengths": strengths,
        "improvements": improvements[:2],
    }


# ── Final summary ──
def summarize(job_title, qa, pass_threshold=75, turns=None):
    scores = [q.get("score", 0) for q in qa if q.get("score") is not None]
    overall = round(sum(scores) / len(scores)) if scores else 0

    # What the candidate raised outside their answers. Counted here so the
    # report can show it, but never folded into the score — asking questions is
    # a signal for the employer to read, not a mark to earn.
    turns = turns or []
    asked = [t for t in turns if t.get("role") == "candidate" and t.get("intent") == "question"]
    issues = [t for t in turns if t.get("role") == "candidate" and t.get("intent") == "issue"]

    if gemini.is_enabled():
        transcript = "\n".join(
            f"Q: {q.get('question','')}\nA: {q.get('answer','')}\nScore: {q.get('score')}"
            for q in qa
        )
        asked_block = "\n".join(f"- {t.get('text','')}" for t in asked) or "(none)"
        prompt = (
            f"Summarize this interview for a '{job_title}' role.\n{transcript}\n\n"
            f"Questions the candidate asked the interviewer:\n{asked_block}\n\n"
            "Judge the answers only. The questions they asked are context on how engaged "
            "they were — describe them in 'engagementNote', and do not let them change the verdict.\n\n"
            f"Respond in strict JSON with keys: verdict (one short sentence), "
            f"strengths (array of up to 3 phrases), improvements (array of up to 3 phrases), "
            f"engagementNote (one short sentence on what their questions show about their "
            f"interest and understanding, or \"\" if they asked none)."
        )
        data = gemini.generate_json(prompt)
        if data:
            return {
                "overallScore": overall,
                "verdict": str(data.get("verdict", ""))[:300] or _verdict(overall, pass_threshold),
                "strengths": _as_list(data.get("strengths")),
                "improvements": _as_list(data.get("improvements")),
                "engagement": {
                    "questionsAsked": len(asked),
                    "issuesReported": len(issues),
                    "note": str(data.get("engagementNote", ""))[:300],
                },
            }

    # Fallback: aggregate per-question feedback.
    strengths, improvements = [], []
    for q in qa:
        strengths += q.get("strengths", [])
        improvements += q.get("improvements", [])
    return {
        "overallScore": overall,
        "verdict": _verdict(overall, pass_threshold),
        "strengths": _dedupe(strengths)[:3],
        "improvements": _dedupe(improvements)[:3],
        "engagement": {
            "questionsAsked": len(asked),
            "issuesReported": len(issues),
            "note": (
                f"Asked {len(asked)} question{'' if len(asked) == 1 else 's'} during the interview."
                if asked else ""
            ),
        },
    }


def _verdict(overall, threshold):
    if overall >= threshold:
        return f"Strong interview ({overall}%) — meets the bar for this role."
    if overall >= threshold - 15:
        return f"Solid interview ({overall}%) — close, with room to grow."
    return f"Interview scored {overall}% — below the pass threshold for this role."


# ── helpers ──
def _clamp(v):
    try:
        return max(0, min(100, int(round(float(v)))))
    except (TypeError, ValueError):
        return 0


def _as_list(v):
    if isinstance(v, list):
        return [str(x)[:120] for x in v][:3]
    if v:
        return [str(v)[:120]]
    return []


def _dedupe(items):
    seen, out = set(), []
    for i in items:
        if i and i not in seen:
            seen.add(i)
            out.append(i)
    return out
