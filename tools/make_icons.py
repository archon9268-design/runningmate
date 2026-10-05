"""앱 아이콘 PNG 생성 (외부 라이브러리 없이). 실행: python tools/make_icons.py"""
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "icons"

CHEVRONS = [
    [(0.25, 0.25), (0.37, 0.25), (0.57, 0.5), (0.37, 0.75), (0.25, 0.75), (0.45, 0.5)],
    [(0.43, 0.25), (0.55, 0.25), (0.75, 0.5), (0.55, 0.75), (0.43, 0.75), (0.63, 0.5)],
]


def inside(x, y, poly):
    hit = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            hit = not hit
        j = i
    return hit


def pixel(px, py, size):
    top = (215, 255, 40)
    bottom = (175, 235, 0)
    fg = (17, 19, 22)
    t = py / size
    bg = tuple(round(top[k] * (1 - t) + bottom[k] * t) for k in range(3))
    samples = 0
    for sx in (0.25, 0.75):
        for sy in (0.25, 0.75):
            x = (px + sx) / size
            y = (py + sy) / size
            if any(inside(x, y, p) for p in CHEVRONS):
                samples += 1
    a = samples / 4
    return tuple(round(bg[k] * (1 - a) + fg[k] * a) for k in range(3))


def png_bytes(size):
    rows = bytearray()
    for y in range(size):
        rows.append(0)
        for x in range(size):
            rows.extend(pixel(x, y, size))

    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(rows), 9))
    png += chunk(b"IEND", b"")
    return png


def write_png(path, size):
    path.write_bytes(png_bytes(size))
    print(f"wrote {path.name} ({size}x{size})")


def write_ico(path, sizes=(256, 48, 32, 16)):
    """PNG를 담은 Windows 아이콘 (바탕화면 바로가기용)"""
    images = [png_bytes(s) for s in sizes]
    header = struct.pack("<HHH", 0, 1, len(images))
    offset = 6 + 16 * len(images)
    entries = b""
    for s, data in zip(sizes, images):
        dim = 0 if s >= 256 else s
        entries += struct.pack("<BBBBHHII", dim, dim, 0, 0, 1, 32, len(data), offset)
        offset += len(data)
    path.write_bytes(header + entries + b"".join(images))
    print(f"wrote {path.name}")


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    write_png(OUT / "icon-192.png", 192)
    write_png(OUT / "apple-touch-icon.png", 180)
    write_png(OUT / "icon-512.png", 512)
    write_ico(OUT / "runningmate.ico")
