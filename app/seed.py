from __future__ import annotations

from pathlib import Path
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .models import Answer, Category, Question, Ticket, User
from .quiz_importer import import_questions_from_file
from .security import hash_password


MENU = [
    ("new-20", "Imtihon Yangi 20", "Yangi formatdagi 20 ta savoldan iborat tezkor imtihon.", "/static/assets/icon-new-20.svg"),
    ("new-50", "Imtihon Yangi 50", "Kengaytirilgan 50 savolli imtihon rejimi.", "/static/assets/icon-new-50.svg"),
    ("real-20", "Imtihon Real 20", "Real imtihonga yaqin 20 savolli sinov.", "/static/assets/icon-real-20.svg"),
    ("bilet-20", "Imtihon Biletlari 20", "20 savollik biletlar to'plami.", "/static/assets/icon-ticket-20.svg"),
    ("bilet-50", "Imtihon Biletlari 50", "50 savollik biletlar katalogi.", "/static/assets/icon-ticket-50.svg"),
    ("topics", "Mavzulashtirilgan testlar", "Yo'l belgilari, chorraha, tezlik va boshqa mavzular.", "/static/assets/icon-topics.svg"),
    ("flagged", "Xato belgilagan savollarim", "Noto'g'ri javob berilgan va saqlangan savollar.", "/static/assets/icon-mistakes.svg"),
    ("marathon", "Marafon", "Ketma-ket savollar bilan uzoq mashq qilish.", "/static/assets/icon-marathon.svg"),
]


SAMPLE_BANK = [
    (
        "Haydovchi svetoforning sariq chirog'ida chorrahaga kirishi mumkinmi?",
        ["Ha, har doim mumkin", "Faqat to'xtash xavfli bo'lsa", "Yo'q, faqat piyodalar uchun", "Faqat tunda"],
        1,
        "Sariq chiroq odatda harakatni taqiqlaydi, lekin keskin tormozlash xavf tug'dirsa davom etish mumkin.",
        "Svetofor",
        "/drawables/i100_3.jpg",
    ),
    (
        "Aholi punktida yengil avtomobil uchun umumiy tezlik cheklovi qancha?",
        ["50 km/soat", "60 km/soat", "70 km/soat", "90 km/soat"],
        1,
        "Aholi punktlarida odatiy limit 60 km/soat.",
        "Tezlik",
        None,
    ),
    (
        "Piyodalar o'tish joyiga yaqinlashganda haydovchi nima qilishi kerak?",
        ["Signal berib tezlashadi", "Piyodaga yo'l beradi", "Faqat chapga qaraydi", "To'xtamasdan o'tadi"],
        1,
        "Piyodalar o'tish joyida piyodalarga yo'l berish majburiy.",
        "Piyodalar",
        "/drawables/i104_2.jpg",
    ),
    (
        "Ushbu belgi qanday ogohlantiradi?",
        ["Temir yo'l kesishmasi", "Aylanma harakat", "Turar joy hududi", "Yo'l ishlari"],
        0,
        "Temir yo'l kesishmasiga yaqinlashganda tezlikni kamaytirish va ehtiyot bo'lish kerak.",
        "Belgilar",
        "/drawables/z1_1.png",
    ),
    (
        "Quvib o'tish taqiqlangan joy qaysi?",
        ["Ko'prik va tonnellarda", "To'g'ri keng yo'lda", "Bo'sh avtoturargohda", "Faqat servis yo'lida"],
        0,
        "Ko'prik, tonnel, piyodalar o'tish joyi va ko'rinish cheklangan joylarda quvib o'tish xavfli.",
        "Quvib o'tish",
        None,
    ),
    (
        "Majburiy to'xtash belgisi oldida haydovchi nima qiladi?",
        ["Sekinlab o'tadi", "To'liq to'xtaydi", "Faqat signal beradi", "Chapga buriladi"],
        1,
        "STOP belgisi oldida transport vositasi to'liq to'xtatiladi.",
        "Belgilar",
        "/drawables/z2_1.png",
    ),
    (
        "Tormoz yo'li nimaga bog'liq?",
        ["Faqat avtomobil rangiga", "Tezlik, yo'l holati va shinalarga", "Faqat haydovchi yoshiga", "Faqat yoqilg'i turiga"],
        1,
        "Tezlik oshishi va sirpanchiq yo'l tormoz yo'lini uzaytiradi.",
        "Xavfsizlik",
        None,
    ),
    (
        "Yo'l-transport hodisasi bo'lsa birinchi navbatda nima qilinadi?",
        ["Mashina joyini darhol o'zgartirish", "Xavfsizlikni ta'minlash va zaruratda tez yordam chaqirish", "Ijtimoiy tarmoqqa joylash", "Hujjatlarni yashirish"],
        1,
        "Avval odamlar xavfsizligi ta'minlanadi, keyin belgilangan tartibda xabar qilinadi.",
        "YTH",
        None,
    ),
    (
        "Qaysi holatda uzoqni yorituvchi chiroqni yaqinga almashtirish kerak?",
        ["Qarama-qarshi transport yaqinlashganda", "Yo'l bo'sh bo'lsa", "Faqat kunduzi", "Faqat to'xtaganda"],
        0,
        "Qarama-qarshi haydovchini ko'r qilmaslik uchun uzoq chiroq yaqinga almashtiriladi.",
        "Chiroqlar",
        None,
    ),
    (
        "Marshrut transport vositasi bekatdan chiqayotganda aholi punktida haydovchi nima qiladi?",
        ["Imkon bo'lsa yo'l beradi", "Har doim quvib o'tadi", "Signal beradi", "Tezlikni oshiradi"],
        0,
        "Aholi punktlarida bekatdan harakatni boshlayotgan avtobus va trolleybuslarga imkon qadar yo'l beriladi.",
        "Jamoat transporti",
        None,
    ),
]


def encrypted_quiz_files_exist() -> bool:
    quiz_dir = get_settings().original_assets_dir / "assets" / "quiz"
    return all((quiz_dir / name).exists() for name in ("question_uzl.txt", "question_uzk.txt", "question_ru.txt"))


def seed_database(db: Session) -> None:
    settings = get_settings()
    admin = db.scalar(select(User).where(User.username == settings.admin_username.lower()))
    if not admin:
        db.add(
            User(
                username=settings.admin_username.lower(),
                full_name="Administrator",
                password_hash=hash_password(settings.admin_password),
                is_admin=True,
            )
        )

    categories: dict[str, Category] = {}
    for index, (slug, title, description, icon) in enumerate(MENU):
        category = db.scalar(select(Category).where(Category.slug == slug))
        if not category:
            category = Category(slug=slug, title=title, description=description, icon=icon, sort_order=index)
            db.add(category)
            db.flush()
        else:
            category.title = title
            category.description = description
            category.icon = icon
            category.sort_order = index
        categories[slug] = category

    if not db.scalar(select(Ticket).limit(1)):
        for slug, count in (("bilet-20", 20), ("bilet-50", 50)):
            category = categories[slug]
            for number in range(1, count + 1):
                db.add(Ticket(category_id=category.id, number=number, title=f"Bilet {number}", is_new=number >= 15))
        db.flush()

    if db.scalar(select(Question).limit(1)):
        db.commit()
        return

    encrypted_path = settings.original_assets_dir / "assets" / "quiz" / "question_uzl.txt"
    if encrypted_path.exists():
        import_questions_from_file(db, encrypted_path, categories["bilet-50"])
        db.commit()
        return

    tickets = db.scalars(select(Ticket).order_by(Ticket.category_id, Ticket.number)).all()
    for index, ticket in enumerate(tickets):
        category = categories["bilet-50" if ticket.category.slug == "bilet-50" else "bilet-20"]
        for offset in range(2):
            source = SAMPLE_BANK[(index + offset) % len(SAMPLE_BANK)]
            text, answers, correct_index, explanation, topic, image = source
            question = Question(
                category_id=category.id,
                ticket_id=ticket.id,
                text=f"{ticket.title}: {text}",
                explanation=explanation,
                topic=topic,
                image=image,
                source_ref="seed",
            )
            db.add(question)
            db.flush()
            for answer_index, answer in enumerate(answers):
                db.add(
                    Answer(
                        question_id=question.id,
                        text=answer,
                        is_correct=answer_index == correct_index,
                        sort_order=answer_index,
                    )
                )

    db.commit()
