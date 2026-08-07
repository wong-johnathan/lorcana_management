from app.lorcana_layout import extract_collector_identifier, recognize_lorcana_card


class FakeEngine:
    name = "fake-ocr"

    def __init__(self, lines_by_rotation):
        self.lines_by_rotation = lines_by_rotation
        self.calls = []

    def recognize(self, _image, rotation):
        self.calls.append(rotation)
        return self.lines_by_rotation.get(rotation, [])


def test_extracts_standard_collector_identifier_from_noisy_line():
    assert extract_collector_identifier("© Disney 32 / 204 · en · 3 Artist") == "32/204 • EN • 3"


def test_extracts_promo_identifier():
    assert extract_collector_identifier("26/P2 - EN - 7") == "26/P2 • EN • 7"


def test_selects_sideways_location_rotation_with_valid_collector_line():
    engine = FakeEngine(
        {
            0: [{"text": "unreadable", "confidence": 0.95, "box": []}],
            90: [
                {"text": "Never Land", "confidence": 0.91, "box": []},
                {"text": "32/204 • EN • 3", "confidence": 0.88, "box": []},
                {"text": "Location", "confidence": 0.90, "box": []},
            ],
        }
    )

    result = recognize_lorcana_card(object(), engine)

    assert result.rotation == 90
    assert result.collector_identifier == "32/204 • EN • 3"
    assert result.engine == "fake-ocr"
    assert "Never Land" in result.raw_text
    assert engine.calls == [0, 90]


def test_stops_after_upright_full_identifier():
    engine = FakeEngine(
        {
            0: [
                {"text": "Ariel", "confidence": 0.95, "box": []},
                {"text": "1/204 • EN • 1", "confidence": 0.92, "box": []},
            ],
            90: [{"text": "should not run", "confidence": 1.0, "box": []}],
        }
    )

    result = recognize_lorcana_card(object(), engine)

    assert result.collector_identifier == "1/204 • EN • 1"
    assert engine.calls == [0]


def test_returns_no_identifier_instead_of_guessing():
    engine = FakeEngine({0: [{"text": "Ariel", "confidence": 0.99, "box": []}]})

    result = recognize_lorcana_card(object(), engine)

    assert result.collector_identifier is None
    assert result.rotation == 0
