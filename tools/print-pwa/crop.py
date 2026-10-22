import sys
from PIL import Image

src, dst, width = sys.argv[1], sys.argv[2], int(sys.argv[3])
img = Image.open(src).convert("RGB")
img = img.crop((0, 0, width, img.height))

# Corta o fundo vazio embaixo, deixando uma margem
bg = img.getpixel((2, img.height - 2))
px = img.load()
last = 0
for y in range(img.height):
    if any(px[x, y] != bg for x in range(0, width, 2)):
        last = y
img = img.crop((0, 0, width, min(img.height, last + 40)))
img.save(dst, optimize=True)
print(dst, img.size)
