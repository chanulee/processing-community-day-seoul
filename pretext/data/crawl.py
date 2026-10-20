"""Collects public growth data for 25 years of Processing into data.json.

Sources (all unauthenticated public APIs):
  - GitHub search: repositories created per year in the Processing language, and p5.js projects per year
  - GitHub contributors of processing/processing, processing/processing4 and processing/p5.js
  - discourse.processing.org /about.json totals

Usage: python3 pretext/data/crawl.py   (takes ~10 min because of GitHub's search rate limit)
Set GITHUB_TOKEN to go faster.
"""
import json
import os
import sys
import subprocess
import time
import urllib.parse
from pathlib import Path

OUT = Path(__file__).with_name('data.json')
TOKEN = os.environ.get('GITHUB_TOKEN')
YEARS = range(2005, 2027)


def get(url):
    # curl instead of urllib: python.org builds on macOS often ship without CA certificates.
    cmd = ['curl', '-sS', '-w', '\n%{http_code}', '-H', 'User-Agent: pcd-seoul-poster', '-H', 'Accept: application/vnd.github+json']
    if TOKEN and 'api.github.com' in url:
        cmd += ['-H', f'Authorization: Bearer {TOKEN}']
    for attempt in range(6):
        body, _, code = subprocess.run(cmd + [url], capture_output=True, text=True, check=True).stdout.rpartition('\n')
        if code in ('403', '429'):
            print('  rate limited, waiting 65s', file=sys.stderr)
            time.sleep(65)
            continue
        if code != '200':
            raise RuntimeError(f'{code} {url}')
        return json.loads(body)
    raise RuntimeError(url)


def search_count(q):
    url = 'https://api.github.com/search/repositories?' + urllib.parse.urlencode({'q': q, 'per_page': 1})
    n = get(url)['total_count']
    time.sleep(2 if TOKEN else 6.5)  # search API: 10 req/min unauthenticated
    return n


def per_year(q):
    out = {}
    for y in YEARS:
        out[y] = search_count(f'{q} created:{y}-01-01..{y}-12-31')
        print(f'  {y}: {out[y]}', file=sys.stderr)
    return out


def contributors(repo):
    people = []
    for page in range(1, 30):
        batch = get(f'https://api.github.com/repos/{repo}/contributors?per_page=100&page={page}')
        if not batch:
            break
        people += [{'login': c['login'], 'n': c['contributions']} for c in batch if c.get('type') == 'User']
    print(f'  {repo}: {len(people)} contributors', file=sys.stderr)
    return people


def main():
    data = json.loads(OUT.read_text()) if OUT.exists() else {}
    data['crawled'] = time.strftime('%Y-%m-%d')

    if 'forum' not in data:
        s = get('https://discourse.processing.org/about.json')['about']['stats']
        data['forum'] = {k: s[k] for k in ('users_count', 'topics_count', 'posts_count', 'likes_count')}

    if 'contributors' not in data:
        data['contributors'] = {r: contributors(r) for r in ('processing/processing', 'processing/processing4', 'processing/p5.js')}

    for key, q in (('processing_repos', 'language:Processing'), ('p5_repos', 'p5.js in:name,description,readme')):
        if key not in data:
            print(key, file=sys.stderr)
            data[key] = per_year(q)
            OUT.write_text(json.dumps(data, indent=1))

    OUT.write_text(json.dumps(data, indent=1))
    print('wrote', OUT, file=sys.stderr)


if __name__ == '__main__':
    main()
