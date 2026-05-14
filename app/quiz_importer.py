from __future__ import annotations

import base64
import json
from pathlib import Path

from cryptography.hazmat.primitives import padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Answer, Category, Question, Ticket


ANDROID_AES_KEY = b"9989371215301998"
ANDROID_AES_IV = b"saymovalibek1530"


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


def find_drawable_url(name: str | None) -> str | None:
    if not name:
        return None
    drawable_dir = Path("res") / "drawable"
    for candidate in drawable_dir.glob(f"{name}.*"):
        return f"/drawables/{candidate.name}"
    return f"/drawables/{name}.jpg"


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
    return None


def get_or_create_ticket(db: Session, category: Category, number: int) -> Ticket:
    ticket = db.scalar(select(Ticket).where(Ticket.category_id == category.id, Ticket.number == number))
    if ticket:
        return ticket
    ticket = Ticket(category_id=category.id, number=number, title=f"Bilet {number}", is_new=False)
    db.add(ticket)
    db.flush()
    return ticket


def import_questions_from_file(db: Session, path: Path, category: Category) -> int:
    imported = 0
    for item in load_payload(path):
        normalized = normalize_item(item)
        if not normalized:
            continue
        answers = normalized["answers"]
        correct_index = normalized["correct_index"]
        if not normalized["text"] or len(answers) < 2 or correct_index < 0 or correct_index >= len(answers):
            continue
        ticket = get_or_create_ticket(db, category, normalized["ticket"]) if normalized["ticket"] else None
        question = Question(
            category_id=category.id,
            ticket_id=ticket.id if ticket else None,
            text=normalized["text"],
            explanation=normalized["explanation"],
            image=normalized["image"],
            topic=normalized["topic"],
            source_ref=f"{path.name}:{normalized['source_id']}" if normalized.get("source_id") else path.name,
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
    return imported
