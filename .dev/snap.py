import base64, glob, os, re, sys

out = sys.argv[1]
src = sys.argv[2] if len(sys.argv) > 2 else max(glob.glob(os.path.expanduser('~/.cursor/browser-logs/cdp-response-Runtime.evaluate-*.json')), key=os.path.getmtime)
text = open(src).read()
shots = re.findall(r'data:image/jpeg;base64,([A-Za-z0-9+/=]+)', text)
first = text.find('data:image')
print('head:', text[:first if first > 0 else 600][-400:])
for i, b in enumerate(shots):
    path = out if len(shots) == 1 else out.replace('.jpg', f'-{i}.jpg')
    open(path, 'wb').write(base64.b64decode(b))
    print(path)
