"""Render the code-native Axentra mark. Run: uv run --with pillow scripts/generate-icons.py"""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent / 'frontend/public'
scale = 8
size = 64 * scale
icon = Image.new('RGBA', (size, size))
draw = ImageDraw.Draw(icon)
draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=16 * scale, fill='#101c2d')
gradient = Image.new('RGBA', (size, size))
pixels = gradient.load()
for y in range(size):
    for x in range(size):
        t = max(0, min(1, ((x / scale - 9) * 46 + (y / scale - 6) * 53) / (46**2 + 53**2)))
        pixels[x, y] = tuple(round(a + (b - a) * t) for a, b in zip((71, 121, 245), (36, 74, 155))) + (255,)
mask = Image.new('L', (size, size))
ImageDraw.Draw(mask).rounded_rectangle((5 * scale, 5 * scale, 59 * scale, 59 * scale), radius=12 * scale, fill=255)
icon.paste(gradient, (0, 0), mask)
draw = ImageDraw.Draw(icon)
def stroke(points):
    values = [(x * scale, y * scale) for x, y in points]
    draw.line(values, fill='#edf3ff', width=round(4.5 * scale), joint='curve')
    for x, y in values:
        r = 2.25 * scale
        draw.ellipse((x-r, y-r, x+r, y+r), fill='#edf3ff')
stroke([(16, 47), (32, 16), (48, 47)])
stroke([(22, 36), (42, 36)])
for x, y, radius in [(32, 16, 4.5), (22, 36, 4), (42, 36, 4)]:
    draw.ellipse(((x-radius)*scale, (y-radius)*scale, (x+radius)*scale, (y+radius)*scale), fill='#a4c6ff')
icon.resize((32, 32), Image.Resampling.LANCZOS).save(root / 'favicon-32.png')
icon.resize((180, 180), Image.Resampling.LANCZOS).save(root / 'apple-touch-icon.png')
icon.resize((256, 256), Image.Resampling.LANCZOS).save(root / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
print('Axentra PNG, ICO and Apple icon generated.')
