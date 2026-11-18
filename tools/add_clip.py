# Add (or replace) one recorded sound in src/sfxdata.js.
#   python3 -I tools/add_clip.py <name> <audio file> [seconds to keep] [fade-out seconds]
# The clip is cut, faded, mixed down to mono, brought to a steady peak level and stored as a small mp3.
# The source file is read as data; nothing in it is executed.
import sys, os, re, json, base64, subprocess, tempfile
name, src = sys.argv[1], sys.argv[2]
keep = float(sys.argv[3]) if len(sys.argv) > 3 else 0
fade = float(sys.argv[4]) if len(sys.argv) > 4 else 0.4
here = os.path.dirname(os.path.abspath(__file__))
js = os.path.join(here, '..', 'src', 'sfxdata.js')

def run(args, capture=False):
    r = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if r.returncode != 0:
        raise SystemExit('ffmpeg failed\n' + r.stderr.decode()[-600:])
    return r.stderr.decode() if capture else ''

with tempfile.TemporaryDirectory() as tmp:
    wav = os.path.join(tmp, 'a.wav'); out = os.path.join(tmp, 'a.mp3')
    af = ['afade=t=in:d=0.015']
    if keep:
        af.append('afade=t=out:st=%.3f:d=%.3f' % (max(0, keep - fade), fade))
    cut = ['-t', '%.3f' % keep] if keep else []
    run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', src] + cut + ['-ac', '1', '-ar', '44100', '-af', ','.join(af), '-map_metadata', '-1', wav])
    log = run(['ffmpeg', '-hide_banner', '-i', wav, '-af', 'volumedetect', '-f', 'null', '-'], True)
    peak = float(re.search(r'max_volume: (-?[0-9.]+) dB', log).group(1))
    gain = -2.0 - peak
    run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-af', 'volume=%.2fdB' % gain, '-c:a', 'libmp3lame', '-b:a', '96k', '-map_metadata', '-1', out])
    data = open(out, 'rb').read()

text = open(js, encoding='utf-8').read()
m = re.search(r'window\.ZZ\.SFX = (\{.*\});', text, re.S)
clips = json.loads(m.group(1))
clips[name] = {'t': 'mp3', 'd': base64.b64encode(data).decode()}
text = text[:m.start(1)] + json.dumps(clips, separators=(',', ':')) + text[m.end(1):]
open(js, 'w', encoding='utf-8').write(text)
print('clip %s: %d bytes of mp3, peak was %.1f dB, gain %.1f dB; %d clips, sfxdata.js is %d bytes' % (name, len(data), peak, gain, len(clips), len(text)))
