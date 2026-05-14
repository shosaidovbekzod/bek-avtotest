from math import ceil
from random import sample
import re
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..config import ROOT_DIR
from ..database import get_db
from ..deps import current_user
from ..models import Answer, Attempt, AttemptAnswer, Category, FlaggedQuestion, Question, Ticket, User
from ..schemas import QuestionOut, SubmitAttemptIn
from ..sign_catalog import group_purpose, load_sign_details

router = APIRouter(prefix="/api", tags=["quiz"])

VIRTUAL_TICKET_SIZES = {"new-20": 20, "new-50": 50}

SIGN_GROUPS = {
    1: "Ogohlantiruvchi belgilar",
    2: "Imtiyoz belgilari",
    3: "Taqiqlovchi belgilar",
    4: "Buyuruvchi belgilar",
    5: "Axborot-ishora belgilar",
    6: "Servis belgilar",
    7: "Qo'shimcha axborot belgilari",
    8: "Taniqlik belgilar",
    9: "Yo'nalish ko'rsatkichlari",
    10: "Yo'l chiziqlari",
    11: "Maxsus belgilar",
}


def natural_key(text: str) -> list[int | str]:
    return [int(part) if part.isdigit() else part for part in re.split(r"(\d+)", text)]


def serialize_question(question: Question, reveal: bool = False) -> dict:
    answers = sorted(question.answers, key=lambda item: item.sort_order)
    data = {
        "id": question.id,
        "text": question.text,
        "explanation": question.explanation,
        "image": question.image,
        "topic": question.topic,
        "answers": [
            {"id": answer.id, "text": answer.text, "sort_order": answer.sort_order, "is_correct": answer.is_correct}
            for answer in answers
        ],
    }
    if reveal:
        data["correct_answer_id"] = next((answer.id for answer in answers if answer.is_correct), None)
    return data


@router.get("/home")
def home(db: Session = Depends(get_db)) -> dict:
    categories = db.scalars(select(Category).order_by(Category.sort_order, Category.id)).all()
    total_questions = db.scalar(select(func.count(Question.id))) or 0
    return {
        "categories": [
            {
                "id": category.id,
                "slug": category.slug,
                "title": category.title,
                "description": category.description,
                "icon": category.icon,
            }
            for category in categories
        ],
        "stats": {"questions": total_questions, "tickets": db.scalar(select(func.count(Ticket.id))) or 0},
    }


@router.get("/topics")
def topics(db: Session = Depends(get_db)) -> dict:
    rows = db.execute(
        select(Question.topic, func.count(Question.id))
        .where(Question.is_active.is_(True), Question.topic.is_not(None), Question.topic != "")
        .group_by(Question.topic)
        .order_by(Question.topic)
    ).all()
    items = [{"topic": topic, "count": count} for topic, count in rows]
    items.sort(key=lambda item: natural_key(item["topic"]))
    return {"topics": items}


@router.get("/signs")
def signs() -> dict:
    drawable_dir = ROOT_DIR / "res" / "drawable"
    details = load_sign_details(str(ROOT_DIR / "assets" / "qoida" / "qoida_uz.pdf"))
    rows = []
    for path in drawable_dir.iterdir():
        if not path.is_file() or not re.match(r"^z\d", path.name):
            continue
        match = re.match(r"^z(\d+)", path.stem)
        group_number = int(match.group(1)) if match else 0
        code = path.stem[1:].replace("_", ".")
        detail = details.get(code, {})
        group = SIGN_GROUPS.get(group_number, f"Belgilar guruhi {group_number}")
        purpose = detail.get("description") or group_purpose(group_number)
        rows.append(
            {
                "code": code,
                "title": detail.get("title") or f"Belgi {code}",
                "group": group,
                "purpose": purpose,
                "image": f"/drawables/{path.name}",
            }
        )
    rows.sort(key=lambda item: natural_key(item["code"]))
    groups = [{"title": title, "count": sum(1 for item in rows if item["group"] == title)} for title in sorted({item["group"] for item in rows})]
    return {"signs": rows, "groups": groups}


@router.get("/tickets")
def tickets(category: str = "bilet-50", db: Session = Depends(get_db)) -> dict:
    category_obj = db.scalar(select(Category).where(Category.slug == category))
    if not category_obj:
        raise HTTPException(404, detail="Kategoriya topilmadi")
    if category in VIRTUAL_TICKET_SIZES:
        size = VIRTUAL_TICKET_SIZES[category]
        total_questions = db.scalar(select(func.count(Question.id)).where(Question.is_active.is_(True))) or 0
        total_tickets = ceil(total_questions / size) if total_questions else 0
        return {
            "category": {"id": category_obj.id, "slug": category_obj.slug, "title": category_obj.title, "ticket_size": size},
            "tickets": [
                {
                    "id": None,
                    "number": number,
                    "title": f"Bilet {number}",
                    "is_new": False,
                    "virtual": True,
                    "question_limit": size,
                }
                for number in range(1, total_tickets + 1)
            ],
        }
    rows = db.scalars(select(Ticket).where(Ticket.category_id == category_obj.id).order_by(Ticket.number)).all()
    return {
        "category": {"id": category_obj.id, "slug": category_obj.slug, "title": category_obj.title},
        "tickets": [{"id": row.id, "number": row.number, "title": row.title, "is_new": row.is_new} for row in rows],
    }


@router.get("/questions", response_model=list[QuestionOut])
def questions(
    ticket_id: int | None = None,
    category: str | None = None,
    ticket_number: int | None = None,
    topic: str | None = None,
    mode: str = "random",
    limit: int = 20,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> list[dict]:
    query = select(Question).where(Question.is_active.is_(True)).options(selectinload(Question.answers))
    if mode == "ticket" and category in VIRTUAL_TICKET_SIZES and ticket_number:
        size = VIRTUAL_TICKET_SIZES[category]
        offset = (max(1, ticket_number) - 1) * size
        rows = db.scalars(query.order_by(Question.id).offset(offset).limit(size)).all()
        return [serialize_question(question, reveal=True) for question in rows]
    if ticket_id:
        query = query.where(Question.ticket_id == ticket_id)
    if mode == "flagged":
        flagged_ids = select(FlaggedQuestion.question_id).where(FlaggedQuestion.user_id == user.id)
        query = query.where(Question.id.in_(flagged_ids))
    if mode == "topic" and topic:
        query = query.where(Question.topic == topic)
    rows = db.scalars(query).all()
    if not rows:
        return []
    if mode in {"random", "new-20", "new-50", "real-20", "marathon"}:
        rows = sample(rows, min(max(1, limit), len(rows)))
    return [serialize_question(question, reveal=True) for question in rows]


@router.get("/search")
def search_questions(q: str = "", limit: int = 50, db: Session = Depends(get_db)) -> dict:
    needle = q.strip()
    if len(needle) < 2:
        return {"results": []}
    pattern = f"%{needle}%"
    query = (
        select(Question)
        .where(
            Question.is_active.is_(True),
            or_(
                Question.text.ilike(pattern),
                Question.explanation.ilike(pattern),
                Question.topic.ilike(pattern),
                Question.answers.any(Answer.text.ilike(pattern)),
            ),
        )
        .options(selectinload(Question.answers))
        .order_by(Question.id)
        .limit(min(max(limit, 1), 100))
    )
    rows = db.scalars(query).all()
    return {"results": [serialize_question(question, reveal=True) for question in rows]}


@router.post("/attempts")
def submit_attempt(payload: SubmitAttemptIn, db: Session = Depends(get_db), user: User = Depends(current_user)) -> dict:
    answer_ids = [item.selected_answer_id for item in payload.answers if item.selected_answer_id]
    answers = db.scalars(select(Answer).where(Answer.id.in_(answer_ids))).all() if answer_ids else []
    answer_map = {answer.id: answer for answer in answers}
    correct = 0
    attempt = Attempt(user_id=user.id, mode=payload.mode, ticket_id=payload.ticket_id, total=len(payload.answers), correct=0)
    db.add(attempt)
    db.flush()
    details = []
    wrong = 0
    unanswered = 0
    for item in payload.answers:
        selected = answer_map.get(item.selected_answer_id or 0)
        is_unanswered = item.selected_answer_id is None
        is_correct = bool(selected and selected.is_correct)
        correct += int(is_correct)
        if is_unanswered:
            unanswered += 1
        elif not is_correct:
            wrong += 1
            exists = db.scalar(
                select(FlaggedQuestion).where(
                    FlaggedQuestion.user_id == user.id,
                    FlaggedQuestion.question_id == item.question_id,
                )
            )
            if not exists:
                db.add(FlaggedQuestion(user_id=user.id, question_id=item.question_id))
        db.add(
            AttemptAnswer(
                attempt_id=attempt.id,
                question_id=item.question_id,
                selected_answer_id=item.selected_answer_id,
                is_correct=is_correct,
            )
        )
        details.append(
            {
                "question_id": item.question_id,
                "selected_answer_id": item.selected_answer_id,
                "is_correct": is_correct,
                "is_unanswered": is_unanswered,
            }
        )
    attempt.correct = correct
    db.commit()
    return {
        "attempt_id": attempt.id,
        "total": attempt.total,
        "correct": correct,
        "wrong": wrong,
        "unanswered": unanswered,
        "details": details,
    }


@router.post("/flagged/{question_id}")
def toggle_flag(question_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)) -> dict:
    existing = db.scalar(select(FlaggedQuestion).where(FlaggedQuestion.user_id == user.id, FlaggedQuestion.question_id == question_id))
    if existing:
        db.delete(existing)
        flagged = False
    else:
        db.add(FlaggedQuestion(user_id=user.id, question_id=question_id))
        flagged = True
    db.commit()
    return {"flagged": flagged}
