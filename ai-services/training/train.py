"""Train IntivraBot's own answer-scoring model (TF-IDF + Logistic Regression).

Steps: Data -> Clean -> TF-IDF -> Split -> Train -> Test -> Save

Run from ai-services/:
    .venv/Scripts/python.exe training/train.py
"""
import csv
import json
import re
import sys
from pathlib import Path

import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.pipeline import FeatureUnion, Pipeline
from sklearn.preprocessing import FunctionTransformer, StandardScaler

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parent))
from app.core.answer_model import clean, length_features  # noqa: E402
LABELS = ["poor", "average", "good"]


# ── 1. DATA ────────────────────────────────────────────
def score_to_label(score: float) -> str:
    """Old interviews carry a 0-100 score; bucket it into the three classes."""
    if score >= 70:
        return "good"
    if score >= 40:
        return "average"
    return "poor"


def load_data():
    rows = []
    with open(HERE / "own_answers.csv", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            rows.append((r["question"], r["answer"], r["label"], "own"))

    export = HERE / "interview_export.json"
    if export.exists():
        for r in json.loads(export.read_text(encoding="utf-8")):
            rows.append((r["question"], r["answer"], score_to_label(r["score"]), "interview"))
    return rows


# ── 2. CLEAN: see app.core.answer_model.clean (lowercase, drop symbols)


def main():
    rows = [r for r in load_data() if r[1].strip()]  # drop empty answers
    X = [clean(a) for _, a, _, _ in rows]
    y = [label for _, _, label, _ in rows]

    print(f"Total rows: {len(rows)}  "
          f"(own: {sum(r[3] == 'own' for r in rows)}, "
          f"old interviews: {sum(r[3] == 'interview' for r in rows)})")
    print("Per class:", {l: y.count(l) for l in LABELS})

    # ── 3. TF-IDF (words) + answer length, then 5. Logistic Regression ──
    model = Pipeline([
        ("features", FeatureUnion([
            ("tfidf", TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True)),
            ("length", Pipeline([("f", FunctionTransformer(length_features)),
                                 ("scale", StandardScaler())])),
        ])),
        ("clf", LogisticRegression(max_iter=2000, class_weight="balanced")),
    ])

    # ── 4. SPLIT (80% train / 20% test, same class ratio in both) ──
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=42)
    print(f"Train: {len(X_train)}  Test: {len(X_test)}")

    # ── 5. TRAIN ──
    model.fit(X_train, y_train)

    # ── 6. TEST ──
    pred = model.predict(X_test)
    print(f"\nTest accuracy: {accuracy_score(y_test, pred):.2%}\n")
    print(classification_report(y_test, pred, labels=LABELS, zero_division=0))
    print("Confusion matrix (rows = actual, cols = predicted):")
    cm = confusion_matrix(y_test, pred, labels=LABELS)
    print("          " + "  ".join(f"{l:>7}" for l in LABELS))
    for label, row in zip(LABELS, cm):
        print(f"{label:>8}  " + "  ".join(f"{n:>7}" for n in row))

    # Small dataset -> one split is noisy; 5-fold CV gives a fairer number.
    cv = cross_val_score(model, X, y, cv=StratifiedKFold(5, shuffle=True, random_state=42))
    print(f"\n5-fold cross-validation accuracy: {cv.mean():.2%} (+/- {cv.std():.2%})")

    # ── 7. SAVE (retrain on all data for the shipped model) ──
    model.fit(X, y)
    out = HERE.parent / "models" / "answer_scorer.pkl"
    joblib.dump(model, out)
    print(f"\nSaved model -> {out}")

    for a in ["React uses components, props, state and a virtual DOM to update the UI efficiently.",
              "It is something for websites I think.",
              "I don't know, can you repeat?"]:
        p = model.predict_proba([clean(a)])[0]
        print(f"  {a[:55]:<55} -> " + ", ".join(f"{c} {v:.0%}" for c, v in zip(model.classes_, p)))


if __name__ == "__main__":
    main()
