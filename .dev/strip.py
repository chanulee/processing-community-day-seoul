import sys
from PIL import Image

out, *paths = sys.argv[1:]
ims = [Image.open(p) for p in paths]
h = max(i.height for i in ims)
o = Image.new('RGB', (sum(i.width for i in ims) + 10 * (len(ims) - 1), h), '#222')
x = 0
for i in ims:
    o.paste(i, (x, 0))
    x += i.width + 10
o.save(out)
print(out)
