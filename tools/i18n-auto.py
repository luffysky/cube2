#!/usr/bin/env python3
"""Machine-translates what tools/i18n-scan.js put in i18n/todo.json and adds it to i18n/auto.json.

Free and open source, nothing leaves the machine: Argos Translate (OpenNMT models, MIT/CC0).
Chinese goes to English first, and English to Japanese and Korean (Argos has no direct Chinese-Japanese model).
{0}-style blanks and <tags> are kept as they are; a line whose blanks do not survive is translated in pieces.

  python3 tools/i18n-auto.py                 translate with Argos (downloads the models the first time)
  python3 tools/i18n-auto.py --engine mark   no translation: "[en] 中文" etc. (for tests)
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


def main():
    engine = 'argos'
    if '--engine' in sys.argv:
        engine = sys.argv[sys.argv.index('--engine') + 1]
    run, version = marker() if engine == 'mark' else argos()
    todo = json.load(open(TODO, encoding='utf-8')) if os.path.exists(TODO) else []
    auto = json.load(open(AUTO, encoding='utf-8')) if os.path.exists(AUTO) else {}
    done = 0
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
    print('i18n: %d machine-translated (%s)' % (done, version))


if __name__ == '__main__':
    main()
