import sys
from PIL import Image
out, w, files = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
ims = []
for f in files:
    im = Image.open(f).convert('RGB')
    h = round(im.height * w / im.width)
    ims.append(im.resize((w, h), Image.LANCZOS))
H = max(i.height for i in ims)
sheet = Image.new('RGB', (w * len(ims) + 12 * (len(ims) - 1), H), (40, 40, 40))
x = 0
for i in ims:
    sheet.paste(i, (x, 0)); x += w + 12
sheet.save(out)
print(out, sheet.size)
