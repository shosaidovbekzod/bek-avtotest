from __future__ import annotations

from pydantic import BaseModel, Field


class RegisterIn(BaseModel):
    username: str = Field(min_length=3, max_length=80)
    password: str = Field(min_length=5, max_length=120)
    full_name: str | None = Field(default=None, max_length=160)


class LoginIn(BaseModel):
    username: str
    password: str


class FaceLoginIn(BaseModel):
    image: str = Field(min_length=1000, max_length=8_500_000)


class TokenOut(BaseModel):
    token: str
    user: dict


class AnswerOut(BaseModel):
    id: int
    text: str
    sort_order: int
    is_correct: bool = False


class QuestionOut(BaseModel):
    id: int
    text: str
    explanation: str | None
    image: str | None
    topic: str | None
    correct_answer_id: int | None = None
    answers: list[AnswerOut]


class QuestionAdminIn(BaseModel):
    text: str = Field(min_length=5)
    answers: list[str] = Field(min_length=2)
    correct_index: int = 0
    explanation: str | None = None
    image: str | None = None
    topic: str | None = None
    category_id: int | None = None
    ticket_id: int | None = None


class SubmitAnswerIn(BaseModel):
    question_id: int
    selected_answer_id: int | None


class SubmitAttemptIn(BaseModel):
    mode: str
    ticket_id: int | None = None
    answers: list[SubmitAnswerIn]
