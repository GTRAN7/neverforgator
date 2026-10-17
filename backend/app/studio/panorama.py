"""Helpers for placing stops on room photos automatically."""
import math
import struct

# A flat photo is shown as a curved window this wide (radians) in front of the camera.
# Keep in sync with PHOTO_FOV in frontend/src/components/Viewer.jsx.
PHOTO_FOV = 1.75


def image_size(data: bytes):
    """Width and height of a JPEG, PNG or WebP, read from its header (no image library needed)."""
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return struct.unpack(">II", data[16:24])
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        chunk = data[12:16]
        if chunk == b"VP8X":
            return 1 + int.from_bytes(data[24:27], "little"), 1 + int.from_bytes(data[27:30], "little")
        if chunk == b"VP8 ":
            w, h = struct.unpack("<HH", data[26:30])
            return w & 0x3FFF, h & 0x3FFF
        if chunk == b"VP8L":
            bits = int.from_bytes(data[21:25], "little")
            return (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
    if data[:2] == b"\xff\xd8":
        i = 2
        while i + 9 < len(data):
            marker = data[i + 1]
            if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
                h, w = struct.unpack(">HH", data[i + 5:i + 9])
                return w, h
            i += 2 + struct.unpack(">H", data[i + 2:i + 4])[0]
    return None


def room_angles(width: int, height: int, room_type: str):
    """(phi_start, phi_length, theta_start, theta_length) of the sphere piece the viewer
    wraps the photo on. Same math as PanoramaRoom in Viewer.jsx."""
    if room_type == "photo":
        phi_length = PHOTO_FOV
        theta_length = min(math.pi * 0.9, PHOTO_FOV * height / width)
        return 1.5 * math.pi - phi_length / 2, phi_length, (math.pi - theta_length) / 2, theta_length
    # A 360° photo sphere is 2:1; a wider phone panorama covers a band around the horizon.
    theta_length = min(math.pi, 2 * math.pi * height / width)
    return 0.0, 2 * math.pi, (math.pi - theta_length) / 2, theta_length


def photo_point_to_direction(x: float, y: float, width: int, height: int, room_type: str = "panorama"):
    """A point in the photo (x, y from 0 to 1) -> the direction you look to see it."""
    phi_start, phi_length, theta_start, theta_length = room_angles(width, height, room_type)
    theta = theta_start + y * theta_length  # 0 = straight up
    phi = phi_start + x * phi_length
    return [math.cos(phi) * math.sin(theta), math.cos(theta), math.sin(phi) * math.sin(theta)]


def angle_between(a, b) -> float:
    dot = sum(p * q for p, q in zip(a, b))
    return math.acos(max(-1.0, min(1.0, dot)))
