from __future__ import annotations

import argparse
import base64
import json
import sys
from pathlib import Path

from cryptography.hazmat.primitives import padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from sqlalchemy import delete, select

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.database import Base, SessionLocal, engine
from app.models import Answer, Attempt, AttemptAnswer, Category, FlaggedQuestion, Question, Ticket


ANDROID_AES_KEY = b"9989371215301998"
ANDROID_AES_IV = b"saymovalibek1530"


def get_or_create_category(db, slug: str, title: str) -> Category:
    category = db.scalar(select(Category).where(Category.slug == slug))
    if category:
        return category
    category = Category(slug=slug, title=title, description="Import qilingan savollar")
    db.add(category)
    db.flush()
    return category


def get_or_create_ticket(db, category: Category, number: int) -> Ticket:
    ticket = db.scalar(select(Ticket).where(Ticket.category_id == category.id, Ticket.number == number))
    if ticket:
        return ticket
    ticket = Ticket(category_id=category.id, number=number, title=f"Bilet {number}", is_new=False)
    db.add(ticket)
    db.flush()
    return ticket


def find_drawable_url(name: str | None) -> str | None:
    if not name:
        return None
    drawable_dir = Path("res") / "drawable"
    for candidate in drawable_dir.glob(f"{name}.*"):
        return f"/drawables/{candidate.name}"
    return f"/drawables/{name}.jpg"


def decrypt_android_payload(text: str) -> str:
    raw = base64.b64decode(text.strip())
    decryptor = Cipher(algorithms.AES(ANDROID_AES_KEY), modes.CBC(ANDROID_AES_IV)).decryptor()
    padded = decryptor.update(raw) + decryptor.finalize()
    unpadder = padding.PKCS7(128).unpadder()
    return (unpadder.update(padded) + unpadder.finalize()).decode("utf-8")


def load_payload(path: Path) -> list[dict]:
    text = path.read_text(encoding="utf-8")
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        payload = json.loads(decrypt_android_payload(text))
    if not isinstance(payload, list):
        raise ValueError("Savollar fayli list bo'lishi kerak")
    return payload


def normalize_item(item: dict) -> dict | None:
    if "question" in item and "correct_answer" in item:
        answers = item.get("answers") or []
        return {
            "text": item.get("question"),
            "answers": answers,
            "correct_index": int(item.get("correct_answer", 1)) - 1,
            "explanation": item.get("correct_ans_alls"),
            "image": find_drawable_url(item.get("image_q")),
            "topic": f"Mavzu {item.get('topic')}" if item.get("topic") is not None else None,
            "ticket": int(item.get("question_category") or 0) or None,
            "source_id": item.get("id"),
        }
    return {
        "text": item.get("text"),
        "answers": item.get("answers") or [],
        "correct_index": int(item.get("correct_index", 0)),
        "explanation": item.get("explanation"),
        "image": item.get("image"),
        "topic": item.get("topic"),
        "ticket": int(item["ticket"]) if item.get("ticket") else None,
        "source_id": item.get("id"),
    }


def clear_quiz_data(db) -> None:
    for model in (AttemptAnswer, Attempt, FlaggedQuestion, Answer, Question):
        db.execute(delete(model))


def import_json(path: Path, category_slug: str, category_title: str, replace: bool = False) -> int:
    payload = load_payload(path)

    Base.metadata.create_all(bind=engine)
    imported = 0
    with SessionLocal() as db:
        if replace:
            clear_quiz_data(db)
        category = get_or_create_category(db, category_slug, category_title)
        for item in payload:
            normalized = normalize_item(item)
            if not normalized:
                continue
            answers = normalized["answers"]
            correct_index = normalized["correct_index"]
            if not normalized["text"] or len(answers) < 2 or correct_index < 0 or correct_index >= len(answers):
                continue
            ticket = None
            if normalized["ticket"]:
                ticket = get_or_create_ticket(db, category, normalized["ticket"])
            question = Question(
                category_id=category.id,
                ticket_id=ticket.id if ticket else None,
                text=normalized["text"],
                explanation=normalized["explanation"],
                image=normalized["image"],
                topic=normalized["topic"],
                source_ref=f"{path.name}:{normalized['source_id']}" if normalized.get("source_id") else str(path.name),
            )
            db.add(question)
            db.flush()
            for index, answer_text in enumerate(answers):
                db.add(
                    Answer(
                        question_id=question.id,
                        text=str(answer_text),
                        is_correct=index == correct_index,
                        sort_order=index,
                    )
                )
            imported += 1
        db.commit()
    return imported


def main() -> None:
    parser = argparse.ArgumentParser(description="Savollarni JSON yoki Android encrypted quiz fayldan import qilish.")
    parser.add_argument("path", type=Path)
    parser.add_argument("--category-slug", default="bilet-50")
    parser.add_argument("--category-title", default="Imtihon Biletlari 50")
    parser.add_argument("--replace", action="store_true", help="Eski savol, javob, bilet va urinishlarni tozalab import qiladi.")
    args = parser.parse_args()
    count = import_json(args.path, args.category_slug, args.category_title, args.replace)
    print(f"{count} ta savol import qilindi")


if __name__ == "__main__":
    main()
