# Draws the app icon (a glazed gold tile with a "turn" arrow, on the wall colour) and writes every size the page,
# the PWA manifest and iOS ask for. Needs rsvg-convert and Pillow.
#   python3 -I tools/make_icons.py
import math, os, subprocess
from PIL import Image
here = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(here, '..', 'icons')
os.makedirs(out, exist_ok=True)
GOLD, GOLD_LO, GOLD_HI, INK, WALL = '#F5B82E', '#C48A10', '#FFDF85', '#1B2530', '#222B36'

def arrow(cx, cy, r, sw, color):
    """A clockwise turn arrow: most of a circle, with a head on the leading end."""
    a0, a1 = math.radians(-28), math.radians(248)
    p = lambda a, rr=r: (cx + rr * math.cos(a), cy + rr * math.sin(a))
    s, e = p(a0), p(a1)
    t = (-math.sin(a1), math.cos(a1)); n = (math.cos(a1), math.sin(a1))
    head, wide, back = sw * 1.28, sw * 1.22, sw * 0.12
    tip = (e[0] + t[0] * head, e[1] + t[1] * head)
    b1 = (e[0] + n[0] * wide - t[0] * back, e[1] + n[1] * wide - t[1] * back)
    b2 = (e[0] - n[0] * wide - t[0] * back, e[1] - n[1] * wide - t[1] * back)
    f = lambda q: '%.1f %.1f' % q
    return ('<path d="M%s A%.1f %.1f 0 1 1 %s" fill="none" stroke="%s" stroke-width="%.1f" stroke-linecap="round"/>' % (f(s), r, r, f(e), color, sw) +
            '<path d="M%s L%s L%s Z" fill="%s" stroke="%s" stroke-width="%.1f" stroke-linejoin="round"/>' % (f(tip), f(b1), f(b2), color, color, sw * 0.22))

def tile(cx, cy, size, tilt, bold=1.0):
    """The tile: gold glaze, a lighter top edge, a darker bottom edge, like the letter tiles of the logo."""
    h, r = size / 2, size * 0.17
    lip = size * 0.075
    g = '<g transform="rotate(%.1f %.1f %.1f)">' % (tilt, cx, cy)
    g += '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="%s"/>' % (cx - h, cy - h, size, size, r, GOLD_LO)
    g += '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="%s"/>' % (cx - h, cy - h, size, size - lip, r, GOLD_HI)
    g += '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="%s"/>' % (cx - h, cy - h + lip * 0.55, size, size - lip * 1.55, r * 0.94, GOLD)
    g += arrow(cx, cy - lip * 0.25, size * 0.245, size * 0.118 * bold, INK)
    return g + '</g>'

def svg(body, bg=None, radius=0):
    s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">'
    if bg:
        s += '<rect width="512" height="512" rx="%d" fill="%s"/>' % (radius, bg)
    return s + body + '</svg>\n'

files = {
    # the browser tab: just the tile, as large as it goes, upright and a little bolder so it stays crisp at 16 px
    'favicon.svg': svg(tile(256, 256, 480, 0, 1.12)),
    # an app icon with its own rounded plate (desktop, Android "any")
    'icon.svg': svg(tile(256, 262, 318, -9), WALL, 112),
    # full bleed, drawing kept inside the middle so any mask shape is fine (Android adaptive, iOS)
    'maskable.svg': svg(tile(256, 260, 268, -9), WALL, 0),
}
for name, text in files.items():
    open(os.path.join(out, name), 'w').write(text)

def png(src, dst, size):
    subprocess.run(['rsvg-convert', '-w', str(size), '-h', str(size), os.path.join(out, src), '-o', os.path.join(out, dst)], check=True)

png('icon.svg', 'icon-192.png', 192)
png('icon.svg', 'icon-512.png', 512)
png('maskable.svg', 'maskable-192.png', 192)
png('maskable.svg', 'maskable-512.png', 512)
png('maskable.svg', 'apple-touch-icon.png', 180)
tmp = []
for n in (16, 32, 48, 64):
    p = os.path.join(out, '_f%d.png' % n); png('favicon.svg', '_f%d.png' % n, n); tmp.append(p)
ims = [Image.open(p).convert('RGBA') for p in tmp]
ims[-1].save(os.path.join(here, '..', 'favicon.ico'), format='ICO', sizes=[(16, 16), (32, 32), (48, 48), (64, 64)], append_images=ims[:-1])
for p in tmp: os.remove(p)
os.remove(os.path.join(out, 'maskable.svg'))   # only its renderings are used
# iOS shows a black plate behind transparency; the touch icon must be opaque
im = Image.open(os.path.join(out, 'apple-touch-icon.png')).convert('RGB'); im.save(os.path.join(out, 'apple-touch-icon.png'), optimize=True)
print('icons:', ', '.join(sorted(os.listdir(out))), '+ favicon.ico')
