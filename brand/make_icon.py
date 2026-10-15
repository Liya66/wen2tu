"""Cuts the bunny out of the full logo (removing the mind-map boxes and lines)."""
import sys
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGBA')
px = im.load()
W, H = im.size

def opaque(x, y):
    return px[x, y][3] > 128

# Fit a circle to the left edge of the head above and below the dark connector.
pts = []
for y in list(range(490, 540)) + list(range(648, 700)):
    for x in range(470, 640):
        if opaque(x, y):
            pts.append((x, y))
            break
# Algebraic least-squares circle fit: x^2 + y^2 + Dx + Ey + F = 0
import itertools
n = len(pts)
sx = sum(p[0] for p in pts); sy = sum(p[1] for p in pts)
sxx = sum(p[0]**2 for p in pts); syy = sum(p[1]**2 for p in pts); sxy = sum(p[0]*p[1] for p in pts)
sz = [p[0]**2 + p[1]**2 for p in pts]
szx = sum(z*p[0] for z, p in zip(sz, pts)); szy = sum(z*p[1] for z, p in zip(sz, pts)); szz = sum(sz)
# Solve [[sxx,sxy,sx],[sxy,syy,sy],[sx,sy,n]] [D,E,F] = -[szx,szy,szz]
A = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]]
b = [-szx, -szy, -szz]
def det3(m):
    return (m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1]) - m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0]) + m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0]))
d = det3(A)
sol = []
for i in range(3):
    m = [row[:] for row in A]
    for r in range(3): m[r][i] = b[r]
    sol.append(det3(m) / d)
D, E, F = sol
cx, cy = -D/2, -E/2
R = (cx*cx + cy*cy - F) ** 0.5
print('head circle', round(cx), round(cy), round(R))

for y in range(H):
    for x in range(W):
        r, g, bl, a = px[x, y]
        if a == 0:
            continue
        # gray box and its connector
        if abs(r-g) < 14 and abs(g-bl) < 14 and 110 < r < 225:
            px[x, y] = (0, 0, 0, 0); continue
        # pink connector right of the head
        if x > 968 and y < 545 and r > 190 and r-g > 20 and r-bl > 20:
            px[x, y] = (0, 0, 0, 0); continue
        # dark connector left of the head: outside the fitted head outline
        if 530 < y < 660 and x < 600 and ((x-cx)**2 + (y-cy)**2) ** 0.5 > R + 1.5:
            px[x, y] = (0, 0, 0, 0); continue

crop = im.crop((405, 130, 1140, 840))
crop = crop.crop(crop.getchannel('A').point(lambda a: 255 if a > 24 else 0).getbbox())
w, h = crop.size
side = int(max(w, h) * 1.06)
square = Image.new('RGBA', (side, side), (0, 0, 0, 0))
square.paste(crop, ((side-w)//2, (side-h)//2))
square.save(out)
