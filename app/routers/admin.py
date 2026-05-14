from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..deps import current_admin
from ..models import Answer, Attempt, Category, Question, Ticket, User
from ..schemas import QuestionAdminIn
from .quiz import serialize_question

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(current_admin)])


@router.get("/stats")
def stats(db: Session = Depends(get_db)) -> dict:
    return {
        "users": db.scalar(select(func.count(User.id))) or 0,
        "questions": db.scalar(select(func.count(Question.id))) or 0,
        "tickets": db.scalar(select(func.count(Ticket.id))) or 0,
        "attempts": db.scalar(select(func.count(Attempt.id))) or 0,
    }


@router.get("/questions")
def list_questions(db: Session = Depends(get_db)) -> list[dict]:
    rows = db.scalars(select(Question).options(selectinload(Question.answers)).order_by(Question.id.desc()).limit(200)).all()
    return [serialize_question(row, reveal=True) for row in rows]


@router.post("/questions")
def create_question(payload: QuestionAdminIn, db: Session = Depends(get_db)) -> dict:
    if payload.correct_index < 0 or payload.correct_index >= len(payload.answers):
        raise HTTPException(400, detail="To'g'ri javob indeksi noto'g'ri")
    question = Question(
        text=payload.text,
        explanation=payload.explanation,
        image=payload.image,
        topic=payload.topic,
        category_id=payload.category_id,
        ticket_id=payload.ticket_id,
    )
    db.add(question)
    db.flush()
    for index, answer_text in enumerate(payload.answers):
        db.add(Answer(question_id=question.id, text=answer_text, is_correct=index == payload.correct_index, sort_order=index))
    db.commit()
    db.refresh(question)
    return {"id": question.id}


@router.delete("/questions/{question_id}")
def delete_question(question_id: int, db: Session = Depends(get_db)) -> dict:
    question = db.get(Question, question_id)
    if not question:
        raise HTTPException(404, detail="Savol topilmadi")
    db.delete(question)
    db.commit()
    return {"ok": True}


@router.get("/categories")
def categories(db: Session = Depends(get_db)) -> dict:
    categories_list = db.scalars(select(Category).order_by(Category.sort_order)).all()
    tickets = db.scalars(select(Ticket).order_by(Ticket.category_id, Ticket.number)).all()
    return {
        "categories": [{"id": item.id, "slug": item.slug, "title": item.title} for item in categories_list],
        "tickets": [{"id": item.id, "category_id": item.category_id, "number": item.number, "title": item.title} for item in tickets],
    }
