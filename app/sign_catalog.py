from __future__ import annotations

from functools import lru_cache
from pathlib import Path
import re


GROUP_PURPOSES = {
    1: "Xavfli yo'l qismiga yaqinlashayotganlik haqida ogohlantiradi va haydovchidan ehtiyotkorlikni talab qiladi.",
    2: "Chorrahalar, kesishmalar va tor yo'l qismlarida harakatlanish navbatini belgilaydi.",
    3: "Muayyan harakatni taqiqlaydi yoki cheklaydi; belgi amal qilgan joyda talabni bajarish shart.",
    4: "Haydovchiga faqat ko'rsatilgan yo'nalish yoki tartibda harakatlanishni buyuradi.",
    5: "Yo'l, yo'nalish, manzil, harakat tartibi yoki qatnov sharoiti haqida axborot beradi.",
    6: "Yo'l bo'yidagi xizmat ko'rsatish joylari va kerakli obyektlar haqida ma'lumot beradi.",
    7: "Asosiy belgining amal qilish masofasi, vaqti, yo'nalishi yoki istisnolarini aniqlashtiradi.",
    8: "Transport vositasi turi, holati yoki maxsus belgisini boshqa ishtirokchilarga tanitadi.",
    9: "Haydovchiga yo'nalish, burilish yoki manzilga borish tartibini ko'rsatadi.",
    10: "Qatnov qismidagi chiziqlar orqali harakatlanish qatori, cheklov va tartibni belgilaydi.",
    11: "Maxsus holat yoki qo'shimcha tartibni bildiradi va haydovchiga aniq yo'l-yo'riq beradi.",
}


def group_purpose(group_number: int) -> str:
    return GROUP_PURPOSES.get(group_number, "Belgining vazifasi yo'l harakati tartibini aniqlash va haydovchini xabardor qilishdir.")


def clean_text(value: str) -> str:
    value = re.sub(r"\s+", " ", value or "").strip()
    value = re.sub(r"\s+([,.])", r"\1", value)
    value = value.replace(" -", "-").replace("- ", "-")
    fixes = {
        "kesi shmasi": "kesishmasi",
        "k esishmasi": "kesishmasi",
        "k esishmasidan": "kesishmasidan",
        "o gohlantiradi": "ogohlantiradi",
        "to‘x tab": "to‘xtab",
        "to‘x tash": "to‘xtash",
        "q ayrilib": "qayrilib",
        "o‘rn atiladi": "o‘rnatiladi",
        "a xborot": "axborot",
        "b ilan": "bilan",
        "belg isi": "belgisi",
        "transpor t": "transport",
    }
    for old, new in fixes.items():
        value = value.replace(old, new)
    return value


def code_key(code: str) -> list[int | str]:
    return [int(part) if part.isdigit() else part for part in re.split(r"(\d+)", code)]


def expand_code_part(part: str) -> list[str]:
    part = part.strip()
    if re.search(r"[\u2013\u2014-]", part):
        start, end = re.split(r"\s*[\u2013\u2014-]\s*", part, maxsplit=1)
        start_bits = start.split(".")
        end_bits = end.split(".")
        if (
            len(start_bits) == len(end_bits)
            and start_bits[:-1] == end_bits[:-1]
            and start_bits[-1].isdigit()
            and end_bits[-1].isdigit()
        ):
            first = int(start_bits[-1])
            last = int(end_bits[-1])
            if first <= last:
                return [".".join(start_bits[:-1] + [str(number)]) for number in range(first, last + 1)]
    return [part]


def expand_codes(value: str) -> list[str]:
    codes: list[str] = []
    for part in value.split(","):
        codes.extend(expand_code_part(part))
    return [code.strip() for code in codes if code.strip()]


@lru_cache(maxsize=1)
def load_sign_details(pdf_path: str) -> dict[str, dict[str, str]]:
    path = Path(pdf_path)
    if not path.exists():
        return {}
    try:
        from pypdf import PdfReader
    except Exception:
        return {}

    reader = PdfReader(str(path))
    raw_text = "\n".join((page.extract_text() or "") for page in reader.pages)
    start = raw_text.find("1. Ogohlantiruvchi belgilar")
    end = raw_text.find("1. Yotiq chiziqlar", start)
    if start < 0:
        return {}
    section = clean_text(raw_text[start : end if end > start else len(raw_text)])
    pattern = re.compile(
        r'(?<![\d.])(?P<codes>\d(?:\.\d+){1,3}(?:\s*[\u2013\u2014-]\s*\d(?:\.\d+){1,3})?'
        r'(?:\s*,\s*\d(?:\.\d+){1,3}(?:\s*[\u2013\u2014-]\s*\d(?:\.\d+){1,3})?)*)'
        r'\.\s*[\u201c"](?P<title>[^\u201d"]+)[\u201d"]'
    )
    matches = list(pattern.finditer(section))
    details: dict[str, dict[str, str]] = {}
    for index, match in enumerate(matches):
        next_start = matches[index + 1].start() if index + 1 < len(matches) else len(section)
        description = clean_text(section[match.end() : next_start]).strip(". ")
        description = re.split(r" Oldingi tahrirga qarang| \([^)]*Vazirlar Mahkamasining", description, maxsplit=1)[0].strip(". ")
        if len(description) > 260:
            description = description[:260].rsplit(" ", 1)[0].strip(". ") + "."
        title = clean_text(match.group("title"))
        for code in expand_codes(match.group("codes")):
            details[code] = {"title": title, "description": description}
    return details
