#!/usr/bin/env python3
"""Machine-translates what tools/i18n-scan.js put in i18n/todo.json and adds it to i18n/auto.json.

Engines:
  gemini  Google Gemini API (the free tier is enough). Needs GEMINI_API_KEY in the environment (in GitHub it is a
          repository secret; it is never written anywhere). GEMINI_MODEL picks a model; by default the newest
          "flash" model the key can use. Only the game's own words are sent: never player data or legal texts.
  argos   Argos Translate, free and open source, runs locally (Chinese→English→Japanese/Korean). Kept only as an
          option: the Owner chose not to use it (C-025) because its quality is too low.
  mark    no translation: "[en] 中文" (for tests).
{0}-style blanks and <tags> must come back unchanged; a line where they do not is left for a person.

  GEMINI_API_KEY=… python3 tools/i18n-auto.py --engine gemini
"""
import json, os, re, sys, time

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
DIR = os.environ.get('I18N_DIR') or os.path.join(ROOT, 'i18n')
TODO = os.path.join(DIR, 'todo.json')
AUTO = os.path.join(DIR, 'auto.json')
KEEP = re.compile(r'(\{\d\}|<[^>]+>|&[a-z]+;)')
PAIRS = [('zt', 'en'), ('en', 'ja'), ('en', 'ko')]


def argos():
    import argostranslate.package as pk
    import argostranslate.translate as tr
    have = {(p.from_code, p.to_code) for p in pk.get_installed_packages()}
    if any(p not in have for p in PAIRS):
        pk.update_package_index()
        for a, b in PAIRS:
            if (a, b) in have:
                continue
            got = [p for p in pk.get_available_packages() if p.from_code == a and p.to_code == b]
            if not got:
                sys.exit('no Argos model for %s→%s' % (a, b))
            pk.install_from_path(got[0].download())
    langs = {l.code: l for l in tr.get_installed_languages()}
    models = {(a, b): langs[a].get_translation(langs[b]) for a, b in PAIRS}
    version = 'argos-' + ','.join('%s%s' % (a, b) for a, b in PAIRS)
    return (lambda text, a, b: models[(a, b)].translate(text)), version


def gemini():
    import urllib.request, urllib.error
    key = os.environ.get('GEMINI_API_KEY', '')
    if not key:
        sys.exit('GEMINI_API_KEY is not set')
    base = 'https://generativelanguage.googleapis.com/v1beta/'
    def call(path, body=None):
        req = urllib.request.Request(base + path, data=json.dumps(body).encode() if body else None,
                                     headers={'x-goog-api-key': key, 'Content-Type': 'application/json'})
        for tries in range(3):
            try:
                with urllib.request.urlopen(req, timeout=120) as r:
                    return json.loads(r.read().decode())
            except urllib.error.HTTPError as e:
                if e.code in (429, 500, 503) and tries < 2:
                    time.sleep(6 * (tries + 1))
                    continue
                raise
    model = os.environ.get('GEMINI_MODEL', '')
    order = [model] if model else []
    if not model:
        names = [m['name'].split('/')[-1] for m in call('models?pageSize=200').get('models', [])
                 if 'generateContent' in m.get('supportedGenerationMethods', [])]
        flash = [n for n in names if 'flash' in n and not re.search(r'image|tts|live|audio|thinking|exp|preview', n)]
        def ver(n):
            m = re.search(r'(\d+(?:\.\d+)?)', n)
            return (float(m.group(1)) if m else 0, 'lite' not in n, n)
        if not flash:
            sys.exit('no Gemini flash model available to this key')
        # newest first; one that keeps answering "busy" or "not here" gives way to the next
        order = sorted(flash, key=ver, reverse=True)
    state = {'i': 0}
    guide = ('You translate the user-interface words of 轉磚, a casual web block-puzzle game (Taiwan, Traditional Chinese), '
             'into natural, short game UI language: English (en), Japanese (ja), Korean (ko). Keep {0} {1} blanks and '
             '<tags> exactly as they are. Keep 轉磚 and SnowRealm untranslated. Answer only JSON: '
             '{"<key>": {"en": "...", "ja": "...", "ko": "..."}} for every key given.')
    def batch(items):
        body = {'systemInstruction': {'parts': [{'text': guide}]},
                'contents': [{'role': 'user', 'parts': [{'text': json.dumps({i['k']: i['zh'] for i in items}, ensure_ascii=False)}]}],
                'generationConfig': {'responseMimeType': 'application/json', 'temperature': 0.2}}
        while True:
            name = order[state['i']]
            try:
                out = call('models/%s:generateContent' % name, body)
                break
            except urllib.error.HTTPError as e:
                if e.code in (404, 429, 500, 503) and state['i'] + 1 < len(order):
                    print('gemini: %s answered %d, trying %s' % (name, e.code, order[state['i'] + 1]))
                    state['i'] += 1
                    continue
                raise
        text = out['candidates'][0]['content']['parts'][0]['text']
        return json.loads(text)
    return batch, lambda: 'gemini:' + order[state['i']]


def marker():
    return (lambda text, a, b: '[%s] %s' % (b, text)), 'mark'


def keeps(s):
    return sorted(KEEP.findall(s))


def safe(run, text, a, b):
    """Translates text, keeping its blanks and tags; pieces between them are translated on their own if needed."""
    if not text.strip():
        return text
    parts = KEEP.split(text)
    if len(parts) == 1:
        return run(text, a, b).strip()
    # whole sentence first, with the blanks swapped for plain markers the models leave alone
    marks = {}
    def swap(m):
        tok = 'ZQ%dX' % len(marks)
        marks[tok] = m.group(0)
        return tok
    out = run(KEEP.sub(swap, text), a, b)
    for tok, v in marks.items():
        out = out.replace(tok, v, 1)
    if keeps(out) == keeps(text):
        return out.strip()
    return ''.join(p if KEEP.fullmatch(p) or not p.strip() else run(p, a, b).strip() for p in parts).strip()


def check():
    """--check: one made-up phrase through Gemini, to see that the key works. Changes nothing."""
    batch, version = gemini()
    got = batch([{'k': 'check.hello', 'zh': '歡迎來玩轉磚！'}]).get('check.hello') or {}
    ok = all(isinstance(got.get(l), str) and got[l].strip() for l in ('en', 'ja', 'ko'))
    print('check', version(), 'ok' if ok else 'FAILED', json.dumps(got, ensure_ascii=False))
    sys.exit(0 if ok else 1)


def main():
    if '--check' in sys.argv:
        return check()
    engine = 'gemini'
    if '--engine' in sys.argv:
        engine = sys.argv[sys.argv.index('--engine') + 1]
    todo = json.load(open(TODO, encoding='utf-8')) if os.path.exists(TODO) else []
    auto = json.load(open(AUTO, encoding='utf-8')) if os.path.exists(AUTO) else {}
    done = 0
    if engine == 'gemini':
        batch, version = gemini()
        for i in range(0, len(todo), 40):
            part = todo[i:i + 40]
            got = batch(part)
            for item in part:
                k, zh = item['k'], item['zh']
                t = got.get(k) or {}
                row = dict(auto[k]) if auto.get(k, {}).get('zh') == zh else {'zh': zh}
                bad = [c for c in item['langs'] if not isinstance(t.get(c), str) or not t[c].strip() or keeps(t[c]) != keeps(zh)]
                if bad:
                    print('skip %s: %s came back wrong' % (k, ','.join(bad)), file=sys.stderr)
                    continue
                for c in item['langs']:
                    row[c] = t[c].strip()
                row['by'] = version() if callable(version) else version
                row['at'] = time.strftime('%Y-%m-%d')
                auto[k] = row
                done += 1
        todo = []
    else:
        run, version = marker() if engine == 'mark' else argos()
    for item in todo:
        k, zh, langs = item['k'], item['zh'], item['langs']
        row = auto.get(k) if auto.get(k, {}).get('zh') == zh else None
        row = dict(row) if row else {'zh': zh}
        en = row.get('en') or safe(run, zh, 'zt', 'en')
        for c in langs:
            row[c] = en if c == 'en' else safe(run, en, 'en', c)
        if keeps(row.get('en', zh)) != keeps(zh):
            print('skip %s: blanks lost' % k, file=sys.stderr)
            continue
        row['by'] = version
        row['at'] = time.strftime('%Y-%m-%d')
        auto[k] = row
        done += 1
    with open(AUTO, 'w', encoding='utf-8') as f:
        json.dump(dict(sorted(auto.items())), f, ensure_ascii=False, indent=1)
        f.write('\n')
    print('i18n: %d machine-translated (%s)' % (done, version() if callable(version) else version))


if __name__ == '__main__':
    main()
