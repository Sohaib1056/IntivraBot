"""IntivraBot's own answer-scoring model (trained locally, no API).

TF-IDF word features + answer-length features -> Logistic Regression.
Trained by training/train.py, saved to models/answer_scorer.pkl.
"""
import re
from pathlib import Path

import numpy as np

MODEL_PATH = Path(__file__).resolve().parents[2] / "models" / "answer_scorer.pkl"
# Score each class stands for, used to turn probabilities into 0-100.
CLASS_SCORE = {"poor": 20, "average": 55, "good": 90}

_model = None


def clean(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def length_features(texts):
    """[log word count, unique-word ratio] — short, repetitive answers are weak."""
    out = []
    for t in texts:
        words = t.split()
        out.append([np.log1p(len(words)), len(set(words)) / max(1, len(words))])
    return np.array(out)


def predict(answer: str) -> dict | None:
    global _model
    if _model is None:
        if not MODEL_PATH.exists():
            return None
        import joblib
        _model = joblib.load(MODEL_PATH)
    probs = _model.predict_proba([clean(answer)])[0]
    probs = {str(c): float(p) for c, p in zip(_model.classes_, probs)}
    score = round(sum(CLASS_SCORE[c] * p for c, p in probs.items()))
    return {"label": max(probs, key=probs.get), "score": score,
            "probabilities": {c: round(p, 3) for c, p in probs.items()}}
