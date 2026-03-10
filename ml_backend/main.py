import base64
import io
import json
import os
import uuid
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from PIL import Image


APP_DIR = Path(__file__).resolve().parent
DATA_DIR = APP_DIR / "data"
FACES_DB_PATH = DATA_DIR / "faces.json"

app = FastAPI(title="Smart Gallery ML Backend", version="1.0.0")


class FaceProcessItem(BaseModel):
    data: str
    id: str


class RenameBody(BaseModel):
    name: str


def ensure_storage() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not FACES_DB_PATH.exists():
        FACES_DB_PATH.write_text("{}", encoding="utf-8")


def _parse_json_resilient(raw: str, fallback: Any) -> Any:
    text = raw.strip()
    if not text:
        return fallback
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Recover first valid JSON value, ignoring trailing garbage.
        decoder = json.JSONDecoder()
        try:
            obj, _end = decoder.raw_decode(text)
            return obj
        except json.JSONDecodeError:
            return fallback


def _atomic_write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_name(f"{path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp")
    tmp_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    os.replace(tmp_path, path)


def load_faces_db() -> dict[str, Any]:
    ensure_storage()
    raw = FACES_DB_PATH.read_text(encoding="utf-8")
    data = _parse_json_resilient(raw, {})
    if not isinstance(data, dict):
        backup = FACES_DB_PATH.with_name(f"{FACES_DB_PATH.name}.corrupt.{int(uuid.uuid4().int % 10_000_000)}.bak")
        backup.write_text(raw, encoding="utf-8")
        data = {}
    # Rewrite repaired structure so next read is clean.
    _atomic_write_json(FACES_DB_PATH, data)
    return data


def save_faces_db(db: dict[str, Any]) -> None:
    _atomic_write_json(FACES_DB_PATH, db)


def decode_image(payload: str) -> np.ndarray:
    if "," in payload and payload.strip().startswith("data:"):
        payload = payload.split(",", 1)[1]
    try:
        image_bytes = base64.b64decode(payload, validate=False)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid base64 payload: {exc}") from exc

    npbuf = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(npbuf, cv2.IMREAD_COLOR)
    if image is None:
        # Fallback via Pillow in case OpenCV decode fails.
        try:
            pil = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            image = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Could not decode image bytes: {exc}") from exc
    return image


def get_face_detector() -> cv2.CascadeClassifier:
    cascade_path = Path(cv2.data.haarcascades) / "haarcascade_frontalface_default.xml"
    detector = cv2.CascadeClassifier(str(cascade_path))
    if detector.empty():
        raise RuntimeError(f"Failed to load Haar cascade at {cascade_path}")
    return detector


FACE_DETECTOR = get_face_detector()
FACE_DETECTOR_ALT = cv2.CascadeClassifier(
    str(Path(cv2.data.haarcascades) / "haarcascade_frontalface_alt2.xml")
)


def _iou(box_a: tuple[int, int, int, int], box_b: tuple[int, int, int, int]) -> float:
    ax1, ay1, aw, ah = box_a
    bx1, by1, bw, bh = box_b
    ax2, ay2 = ax1 + aw, ay1 + ah
    bx2, by2 = bx1 + bw, by1 + bh

    inter_x1 = max(ax1, bx1)
    inter_y1 = max(ay1, by1)
    inter_x2 = min(ax2, bx2)
    inter_y2 = min(ay2, by2)
    if inter_x2 <= inter_x1 or inter_y2 <= inter_y1:
        return 0.0
    inter_area = (inter_x2 - inter_x1) * (inter_y2 - inter_y1)
    area_a = aw * ah
    area_b = bw * bh
    union = max(area_a + area_b - inter_area, 1)
    return inter_area / union


def _merge_boxes(boxes: list[tuple[int, int, int, int]], iou_threshold: float = 0.35) -> list[tuple[int, int, int, int]]:
    if not boxes:
        return []
    # Keep larger boxes first.
    ordered = sorted(boxes, key=lambda b: b[2] * b[3], reverse=True)
    kept: list[tuple[int, int, int, int]] = []
    for candidate in ordered:
        if all(_iou(candidate, existing) < iou_threshold for existing in kept):
            kept.append(candidate)
    return kept


def detect_faces(image_bgr: np.ndarray) -> list[tuple[int, int, int, int]]:
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    gray = cv2.equalizeHist(gray)

    # Detect using two cascades and merge to improve recall/precision tradeoff.
    faces_default = FACE_DETECTOR.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=6,
        minSize=(45, 45),
    )
    faces_alt = FACE_DETECTOR_ALT.detectMultiScale(
        gray,
        scaleFactor=1.08,
        minNeighbors=5,
        minSize=(45, 45),
    )

    merged = _merge_boxes(
        [(int(x), int(y), int(w), int(h)) for x, y, w, h in faces_default]
        + [(int(x), int(y), int(w), int(h)) for x, y, w, h in faces_alt]
    )
    return merged


def _lbp_hist(gray_face: np.ndarray) -> np.ndarray:
    # 8-neighborhood LBP -> 256-bin normalized histogram.
    center = gray_face[1:-1, 1:-1]
    neighbors = [
        gray_face[:-2, :-2],
        gray_face[:-2, 1:-1],
        gray_face[:-2, 2:],
        gray_face[1:-1, 2:],
        gray_face[2:, 2:],
        gray_face[2:, 1:-1],
        gray_face[2:, :-2],
        gray_face[1:-1, :-2],
    ]
    lbp = np.zeros_like(center, dtype=np.uint8)
    for idx, neighbor in enumerate(neighbors):
        lbp |= ((neighbor >= center).astype(np.uint8) << idx)
    hist = cv2.calcHist([lbp], [0], None, [256], [0, 256]).flatten().astype(np.float32)
    return hist / (np.linalg.norm(hist) + 1e-9)


def make_face_embedding(face_bgr: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(face_bgr, cv2.COLOR_BGR2GRAY)
    # Better photometric normalization for illumination robustness.
    gray = cv2.equalizeHist(gray)
    gray = cv2.GaussianBlur(gray, (3, 3), 0)
    resized = cv2.resize(gray, (64, 64), interpolation=cv2.INTER_AREA)

    # Global appearance vector.
    app = resized.astype(np.float32).flatten()
    app = app / (np.linalg.norm(app) + 1e-9)

    # Local texture vector (LBP histogram).
    lbp = _lbp_hist(resized)

    # Edge-orientation histogram (small HOG-like descriptor).
    gx = cv2.Sobel(resized, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(resized, cv2.CV_32F, 0, 1, ksize=3)
    mag, ang = cv2.cartToPolar(gx, gy, angleInDegrees=True)
    bins = ((ang % 180) / 20).astype(np.int32)  # 9 bins
    hog = np.zeros(9, dtype=np.float32)
    for b in range(9):
        hog[b] = float(mag[bins == b].sum())
    hog = hog / (np.linalg.norm(hog) + 1e-9)

    emb = np.concatenate([app, lbp, hog]).astype(np.float32)
    return emb / (np.linalg.norm(emb) + 1e-9)


def cosine_similarity(vec_a: np.ndarray, vec_b: np.ndarray) -> float:
    denom = (np.linalg.norm(vec_a) * np.linalg.norm(vec_b)) + 1e-9
    return float(np.dot(vec_a, vec_b) / denom)


def dominant_color_tag(image_bgr: np.ndarray) -> str:
    rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
    means = rgb.reshape(-1, 3).mean(axis=0)
    idx = int(np.argmax(means))
    return ["red", "green", "blue"][idx]


def classify_one(image_bgr: np.ndarray) -> dict[str, Any]:
    h, w = image_bgr.shape[:2]
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    brightness = float(gray.mean())
    saturation = float(cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV)[:, :, 1].mean())
    face_count = len(detect_faces(image_bgr))

    tags: list[str] = []
    tags.append("landscape" if w >= h else "portrait")
    tags.append("bright" if brightness > 150 else "dark" if brightness < 90 else "normal-light")
    tags.append("vivid" if saturation > 90 else "muted")
    tags.append(dominant_color_tag(image_bgr))
    tags.append("people" if face_count > 0 else "no-face")
    tags.append("outdoor-like" if brightness > 120 and saturation > 80 else "indoor-like")

    # Keep deterministic, unique tags.
    uniq_tags = list(dict.fromkeys(tags))
    orientation = "landscape" if w >= h else "portrait"
    light_text = "bright" if brightness > 150 else "dim" if brightness < 90 else "balanced-light"
    color_text = "vivid colors" if saturation > 90 else "muted colors"
    people_text = (
        f"{face_count} face{'s' if face_count != 1 else ''} detected"
        if face_count > 0
        else "no visible faces"
    )
    description = (
        f"{orientation} image with {light_text}, {color_text}, and {people_text}. "
        f"Likely {'outdoor' if 'outdoor-like' in uniq_tags else 'indoor'} scene."
    )

    return {"tags": uniq_tags, "has_face": face_count > 0, "description": description}


@app.get("/status")
def status() -> dict[str, bool]:
    return {"status": True}


@app.post("/classify")
def classify(images: list[str]) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for payload in images:
        image = decode_image(payload)
        results.append(classify_one(image))
    return results


@app.get("/faces/{user_id}/")
def get_faces(user_id: str) -> list[dict[str, Any]]:
    db = load_faces_db()
    user_data = db.get(user_id, {"people": {}})
    people = user_data.get("people", {})
    return [
        {"id": person["id"], "name": person["name"], "image_ids": person["image_ids"]}
        for person in people.values()
    ]


@app.patch("/faces/{user_id}/{person_id}/rename")
def rename_face_person(user_id: str, person_id: str, body: RenameBody) -> dict[str, bool]:
    db = load_faces_db()
    user_data = db.get(user_id, {"people": {}})
    people = user_data.get("people", {})
    if person_id not in people:
        raise HTTPException(status_code=404, detail="Person not found")
    people[person_id]["name"] = body.name.strip() or people[person_id]["name"]
    user_data["people"] = people
    db[user_id] = user_data
    save_faces_db(db)
    return {"ok": True}


@app.delete("/faces/{user_id}/{photo_id}/")
def delete_face_photo_relation(user_id: str, photo_id: str) -> list[str]:
    db = load_faces_db()
    user_data = db.get(user_id, {"people": {}})
    people = user_data.get("people", {})
    affected: list[str] = []
    to_delete: list[str] = []

    for person_id, person in people.items():
        image_ids = person.get("image_ids", [])
        if photo_id in image_ids:
            person["image_ids"] = [img_id for img_id in image_ids if img_id != photo_id]
            affected.append(person_id)
            if len(person["image_ids"]) == 0:
                to_delete.append(person_id)

    for person_id in to_delete:
        people.pop(person_id, None)

    user_data["people"] = people
    db[user_id] = user_data
    save_faces_db(db)
    return affected


@app.post("/faces/{user_id}/process")
def process_faces(user_id: str, items: list[FaceProcessItem]) -> int:
    db = load_faces_db()
    user_data = db.setdefault(user_id, {"people": {}})
    people: dict[str, Any] = user_data.setdefault("people", {})

    total_faces = 0
    similarity_threshold = 0.88
    margin_threshold = 0.025
    max_person_embeddings = 24

    def person_embeddings(person: dict[str, Any]) -> list[np.ndarray]:
        vectors: list[np.ndarray] = []
        stored = person.get("embeddings", [])
        if isinstance(stored, list):
            for emb in stored:
                arr = np.array(emb, dtype=np.float32)
                if arr.size > 0:
                    vectors.append(arr)
        # Backward compatibility with older schema.
        if not vectors:
            mean_vec = np.array(person.get("mean_embedding", []), dtype=np.float32)
            if mean_vec.size > 0:
                vectors.append(mean_vec)
        return vectors

    for item in items:
        image = decode_image(item.data)
        face_boxes = detect_faces(image)
        if not face_boxes:
            continue

        for x, y, w, h in face_boxes:
            total_faces += 1
            crop = image[y : y + h, x : x + w]
            if crop.size == 0:
                continue
            embedding = make_face_embedding(crop)

            best_person_id: str | None = None
            best_score = -1.0
            second_best = -1.0
            for person_id, person in people.items():
                p_embeddings = person_embeddings(person)
                if not p_embeddings:
                    continue
                p_embeddings = [vec for vec in p_embeddings if vec.shape == embedding.shape]
                if not p_embeddings:
                    continue
                # Compare against all prototypes for a person and take the strongest hit.
                score = max(cosine_similarity(embedding, vec) for vec in p_embeddings)
                if score > best_score:
                    second_best = best_score
                    best_score = score
                    best_person_id = person_id
                elif score > second_best:
                    second_best = score

            if (
                best_person_id is not None
                and best_score >= similarity_threshold
                and (best_score - second_best) >= margin_threshold
            ):
                person = people[best_person_id]
                if item.id not in person["image_ids"]:
                    person["image_ids"].append(item.id)
                embeddings = person.get("embeddings", [])
                if not isinstance(embeddings, list):
                    embeddings = []
                embeddings.append(embedding.astype(float).tolist())
                if len(embeddings) > max_person_embeddings:
                    embeddings = embeddings[-max_person_embeddings:]
                person["embeddings"] = embeddings

                # Maintain mean embedding for compatibility and fast approximations.
                emb_arrs = [np.array(e, dtype=np.float32) for e in embeddings]
                emb_arrs = [vec for vec in emb_arrs if vec.shape == embedding.shape]
                if not emb_arrs:
                    emb_arrs = [embedding]
                mean_vec = np.mean(np.stack(emb_arrs, axis=0), axis=0)
                person["mean_embedding"] = mean_vec.astype(float).tolist()
                person["face_count"] = int(person.get("face_count", 1)) + 1
            else:
                person_id = str(uuid.uuid4())
                person_index = len(people) + 1
                people[person_id] = {
                    "id": person_id,
                    "name": f"Person {person_index}",
                    "image_ids": [item.id],
                    "embeddings": [embedding.astype(float).tolist()],
                    "mean_embedding": embedding.astype(float).tolist(),
                    "face_count": 1,
                }

    user_data["people"] = people
    db[user_id] = user_data
    save_faces_db(db)
    return total_faces


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("ml_backend.main:app", host="127.0.0.1", port=8000, reload=False)
