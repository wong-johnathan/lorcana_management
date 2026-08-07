from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image

from app.main import app


def jpeg_bytes():
    image = Image.new("RGB", (120, 180), "white")
    output = BytesIO()
    image.save(output, format="JPEG")
    return output.getvalue()


def test_health_endpoint():
    response = TestClient(app).get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_rejects_non_image_upload():
    response = TestClient(app).post(
        "/v1/recognize/lorcana",
        files={"image": ("card.txt", b"not an image", "text/plain")},
    )
    assert response.status_code == 415


def test_rejects_invalid_image_bytes():
    response = TestClient(app).post(
        "/v1/recognize/lorcana",
        files={"image": ("card.jpg", b"not really jpg", "image/jpeg")},
    )
    assert response.status_code == 400
