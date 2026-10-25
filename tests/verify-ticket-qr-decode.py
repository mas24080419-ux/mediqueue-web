"""Decode actual browser-exported PNGs to verify they are camera-readable QR codes.
Test-only dependency: opencv-python-headless. No data leaves the CI runner.
"""
from pathlib import Path
from urllib.parse import urlparse, parse_qs
import cv2

expected = "22222222-2222-4222-8222-222222222222"
images = sorted(Path("test-results").glob("ticket-qr-*-DOWNLOAD.png"))
assert len(images) >= 2, f"Expected desktop and mobile QR PNGs, found {images}"
scanner = cv2.QRCodeDetector()
for image_path in images:
    image = cv2.imread(str(image_path))
    assert image is not None, f"Could not load {image_path}"
    payload, corners, _ = scanner.detectAndDecode(image)
    assert corners is not None and payload, f"Actual QR could not be decoded: {image_path}"
    parsed = urlparse(payload)
    fragment = parse_qs(parsed.fragment)
    assert parsed.path.endswith("/scan.html"), f"Wrong QR link path: {payload!r}"
    assert parsed.hostname in ("127.0.0.1", "localhost"), f"Unexpected QR destination: {payload!r}"
    assert fragment.get("code") == [expected], f"Encoded token differs from booked ticket: {payload!r}"
    assert not parsed.query, f"Token or data unexpectedly present in URL query: {payload!r}"
    print(f"PASS decoded physical QR pixels from {image_path.name}: {parsed.path}#code=<UUID>")
print(f"PASS: {len(images)} actual QR PNGs decoded and matched their ticket tokens.")
