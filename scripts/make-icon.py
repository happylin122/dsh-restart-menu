"""Render the 180x180 catalog icon for dsh-restart-menu.

The catalog only accepts raster icons hosted on GitHub, so the PNG is generated
from code here and committed next to the SVG.
"""
from PIL import Image, ImageDraw
import math

S = 720                      # supersampled canvas
BG = (37, 99, 235)           # blue
BG_DARK = (29, 78, 216)
WHITE = (255, 255, 255)

img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# rounded square background
d.rounded_rectangle((0, 0, S - 1, S - 1), radius=156, fill=BG)

# subtle inner ring for depth
d.rounded_rectangle((36, 36, S - 36, S - 36), radius=124, outline=BG_DARK, width=10)

cx = cy = S // 2
r = 196
w = 62

# circular arrow: arc with a gap on the right, plus an arrow head that closes it
start, end = 70, 320       # degrees, PIL draws clockwise from 3 o'clock
d.arc((cx - r, cy - r, cx + r, cy + r), start=start, end=end, fill=WHITE, width=w)

# arrow head at the arc end, pointing the way the arc is turning
a = math.radians(end)
px, py = cx + r * math.cos(a), cy + r * math.sin(a)
tangent = (-math.sin(a), math.cos(a))
normal = (math.cos(a), math.sin(a))
half = w * 0.95
tip = (px + tangent[0] * w * 1.25, py + tangent[1] * w * 1.25)
p1 = (px + normal[0] * half, py + normal[1] * half)
p2 = (px - normal[0] * half, py - normal[1] * half)
d.polygon([p1, p2, tip], fill=WHITE)

img = img.resize((180, 180), Image.LANCZOS)
img.save(r"D:\deepseek-WorkSpace\dsh-restart\assets\icon-180.png")
print("wrote assets/icon-180.png", img.size)
