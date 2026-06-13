from __future__ import annotations

import base64
import binascii
import time
from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from typing import Any


SUPPORTED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


class FaceAuthError(ValueError):
    pass


@dataclass(frozen=True)
class FaceFingerprint:
    source: str
    face: Any
    histogram: Any
    phash: int


_cache_lock = Lock()
_reference_cache: dict[str, object] = {"signature": None, "faces": []}
_cascade = None


def _load_cv2() -> tuple[Any, Any]:
    try:
        import cv2  # type: ignore
        import numpy as np  # type: ignore
    except ImportError as exc:
        raise FaceAuthError("Face ID paketlari o'rnatilmagan. requirements.txt ni qayta o'rnating.") from exc
    return cv2, np


def _get_cascade(cv2: Any) -> Any:
    global _cascade
    if _cascade is None:
        cascade_path = Path(cv2.data.haarcascades) / "haarcascade_frontalface_default.xml"
        _cascade = cv2.CascadeClassifier(str(cascade_path))
        if _cascade.empty():
            raise FaceAuthError("Face ID yuz aniqlash modeli topilmadi.")
    return _cascade


def _decode_data_url(image_data: str, max_mb: int) -> bytes:
    if "," in image_data:
        image_data = image_data.split(",", 1)[1]
    try:
        raw = base64.b64decode(image_data, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise FaceAuthError("Kamera rasmi noto'g'ri formatda yuborildi.") from exc
    if not raw:
        raise FaceAuthError("Kamera rasmi bo'sh.")
    if len(raw) > max_mb * 1024 * 1024:
        raise FaceAuthError(f"Kamera rasmi {max_mb} MB dan katta bo'lmasin.")
    return raw


def _read_image(raw: bytes) -> Any:
    cv2, np = _load_cv2()
    frame = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    if frame is None:
        raise FaceAuthError("Rasmni o'qib bo'lmadi.")
    return frame


def _largest_face(frame: Any, *, strict: bool = True) -> Any:
    cv2, _ = _load_cv2()
    height, width = frame.shape[:2]
    longest_side = max(height, width)
    if longest_side > 960:
        scale = 960 / longest_side
        frame = cv2.resize(frame, (max(1, int(width * scale)), max(1, int(height * scale))), interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    gray = cv2.equalizeHist(gray)
    height, width = gray.shape[:2]
    min_size = max(52, min(width, height) // 8)
    faces = _get_cascade(cv2).detectMultiScale(
        gray,
        scaleFactor=1.07,
        minNeighbors=4,
        minSize=(min_size, min_size),
        flags=cv2.CASCADE_SCALE_IMAGE,
    )
    if len(faces) == 0:
        if strict:
            raise FaceAuthError("Yuz aniqlanmadi. Kameraga to'g'ri qarang va yorug'likni oshiring.")
        return None
    x, y, w, h = max(faces, key=lambda item: item[2] * item[3])
    pad = int(max(w, h) * 0.28)
    left = max(0, x - pad)
    top = max(0, y - pad)
    right = min(width, x + w + pad)
    bottom = min(height, y + h + pad)
    return gray[top:bottom, left:right]


def _phash(face: Any) -> int:
    cv2, np = _load_cv2()
    small = cv2.resize(face, (32, 32), interpolation=cv2.INTER_AREA)
    dct = cv2.dct(np.float32(small))
    block = dct[:8, :8]
    median = np.median(block[1:, 1:])
    bits = block > median
    value = 0
    for bit in bits.flatten():
        value = (value << 1) | int(bool(bit))
    return value


def _lbp_histogram(face: Any) -> Any:
    _, np = _load_cv2()
    center = face[1:-1, 1:-1]
    code = np.zeros_like(center, dtype=np.uint8)
    neighbors = [
        face[:-2, :-2],
        face[:-2, 1:-1],
        face[:-2, 2:],
        face[1:-1, 2:],
        face[2:, 2:],
        face[2:, 1:-1],
        face[2:, :-2],
        face[1:-1, :-2],
    ]
    for bit, neighbor in enumerate(neighbors):
        code |= ((neighbor >= center) << bit).astype(np.uint8)
    hist, _ = np.histogram(code.ravel(), bins=256, range=(0, 256), density=True)
    return hist.astype("float32")


def _fingerprint(frame: Any, source: str, *, strict: bool = True) -> FaceFingerprint | None:
    cv2, _ = _load_cv2()
    face = _largest_face(frame, strict=strict)
    if face is None:
        return None
    face = cv2.resize(face, (128, 128), interpolation=cv2.INTER_AREA)
    face = cv2.equalizeHist(face)
    face = cv2.GaussianBlur(face, (3, 3), 0)
    return FaceFingerprint(source=source, face=face, histogram=_lbp_histogram(face), phash=_phash(face))


def _reference_signature(images_dir: Path) -> tuple[tuple[str, int, int], ...]:
    if not images_dir.exists():
        return ()
    paths = [
        path
        for path in images_dir.iterdir()
        if path.is_file() and path.suffix.lower() in SUPPORTED_IMAGE_EXTENSIONS and not path.name.startswith(".")
    ]
    return tuple(sorted((path.name, path.stat().st_size, path.stat().st_mtime_ns) for path in paths))


def _load_references(images_dir: Path) -> list[FaceFingerprint]:
    cv2, _ = _load_cv2()
    signature = _reference_signature(images_dir)
    with _cache_lock:
        if _reference_cache["signature"] == signature:
            return list(_reference_cache["faces"])  # type: ignore[arg-type]
        faces: list[FaceFingerprint] = []
        for name, _, _ in signature:
            path = images_dir / name
            frame = cv2.imread(str(path))
            if frame is None:
                continue
            fingerprint = _fingerprint(frame, path.name, strict=False)
            if fingerprint:
                faces.append(fingerprint)
        _reference_cache["signature"] = signature
        _reference_cache["faces"] = faces
        return faces


def _hamming_similarity(left: int, right: int) -> float:
    distance = (left ^ right).bit_count()
    return max(0.0, 1.0 - distance / 64)


def _compare_faces(probe: FaceFingerprint, reference: FaceFingerprint) -> float:
    cv2, np = _load_cv2()
    hist_score = float(cv2.compareHist(probe.histogram, reference.histogram, cv2.HISTCMP_CORREL))
    hist_score = max(0.0, min(1.0, (hist_score + 1.0) / 2.0))
    pixel_score = 1.0 - float(np.mean(np.abs(probe.face.astype("float32") - reference.face.astype("float32"))) / 255.0)
    hash_score = _hamming_similarity(probe.phash, reference.phash)
    return (hist_score * 0.44) + (pixel_score * 0.34) + (hash_score * 0.22)


def verify_admin_face(image_data: str, images_dir: Path, *, threshold: float, max_mb: int) -> dict[str, object]:
    raw = _decode_data_url(image_data, max_mb)
    probe = _fingerprint(_read_image(raw), "camera", strict=True)
    if probe is None:
        raise FaceAuthError("Yuz aniqlanmadi.")
    references = _load_references(images_dir)
    if not references:
        raise FaceAuthError("Admin Face ID rasmlari topilmadi yoki ularda yuz aniqlanmadi.")
    scored = sorted(((_compare_faces(probe, reference), reference.source) for reference in references), reverse=True)
    best_score, best_source = scored[0]
    return {
        "verified": best_score >= threshold,
        "score": round(best_score, 4),
        "threshold": threshold,
        "reference_count": len(references),
        "best_reference": best_source,
        "checked_at": int(time.time()),
    }


def warm_face_cache(images_dir: Path) -> int:
    return len(_load_references(images_dir))
