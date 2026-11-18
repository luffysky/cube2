# Build game audio from the downloaded CC0 packs. Sources are read as data; nothing in them is executed.
# usage: python3 -I build_audio.py <interface_sounds_dir> <ui_audio_dir> <music_dir> <out_audio_dir> <out_js>
import sys, os, subprocess, base64, json
kis, kui, mus, out_audio, out_js = sys.argv[1:6]
tmp = os.path.join(os.path.dirname(out_js), '..', 'build_tmp')
os.makedirs(tmp, exist_ok=True)
os.makedirs(out_audio, exist_ok=True)

def run(args):
    r = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if r.returncode != 0:
        raise SystemExit('ffmpeg failed: ' + ' '.join(args[-3:]) + '\n' + r.stderr.decode()[-400:])

# name: (pack, file, format, sample rate)
SFX = {
    'move':     (kis, 'tick_002.wav', 'wav', 32000),
    'rot':      (kui, 'click4.wav', 'wav', 32000),
    'arm':      (kis, 'glass_006.wav', 'wav', 32000),
    'lock':     (kis, 'drop_003.wav', 'wav', 24000),
    'thud':     (kis, 'bong_001.wav', 'wav', 16000),
    'clink':    (kis, 'glass_005.wav', 'wav', 32000),
    'hold':     (kis, 'toggle_001.wav', 'wav', 32000),
    'glass':    (kis, 'glass_001.wav', 'mp3', 44100),
    'glass2':   (kis, 'glass_003.wav', 'wav', 32000),
    'ring':     (kis, 'glass_004.wav', 'mp3', 44100),
    'sparkle':  (kis, 'confirmation_003.wav', 'mp3', 44100),
    'clunk':    (kis, 'switch_003.wav', 'mp3', 44100),
    'warn':     (kis, 'tick_004.wav', 'wav', 32000),
    'fall':     (kis, 'minimize_006.wav', 'mp3', 44100),
    'count':    (kis, 'select_002.wav', 'wav', 24000),
    'go':       (kis, 'confirmation_004.wav', 'mp3', 44100),
    'win':      (kis, 'confirmation_002.wav', 'mp3', 44100),
    'lose':     (kis, 'question_002.wav', 'mp3', 44100),
    'itemGet':  (kis, 'maximize_007.wav', 'mp3', 44100),
    'itemUse':  (kis, 'maximize_002.wav', 'mp3', 44100),
    'itemHit':  (kis, 'minimize_002.wav', 'mp3', 44100),
    'ui':       (kis, 'select_007.wav', 'wav', 32000),
    'undo':     (kis, 'back_002.wav', 'wav', 24000),
    'fail':     (kis, 'question_004.wav', 'mp3', 44100),
    'pluck':    (kis, 'pluck_001.wav', 'wav', 32000),
}
data, total = {}, 0
for name, (d, f, fmt, sr) in SFX.items():
    src = os.path.join(d, f)
    if not os.path.isfile(src):
        raise SystemExit('missing ' + src)
    dst = os.path.join(tmp, name + '.' + fmt)
    common = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-ac', '1', '-ar', str(sr),
              '-af', 'silenceremove=start_periods=1:start_threshold=-55dB,afade=t=in:d=0.001', '-map_metadata', '-1']
    if fmt == 'wav':
        run(common + ['-c:a', 'pcm_s16le', dst])
    else:
        run(common + ['-c:a', 'libmp3lame', '-b:a', '64k', dst])
    b = open(dst, 'rb').read()
    total += len(b)
    data[name] = {'t': fmt, 'd': base64.b64encode(b).decode()}
with open(out_js, 'w') as fh:
    fh.write('/* 轉磚 sound clips. Source: Kenney "Interface Sounds" and "UI Audio" (kenney.nl), CC0 1.0. Trimmed and re-encoded. */\n')
    fh.write('(function () {\n  window.ZZ.SFX = ' + json.dumps(data, separators=(',', ':')) + ';\n})();\n')
print('sfx clips', len(data), 'bytes', total, 'js', os.path.getsize(out_js))

MUSIC = {'menu': ('Title Screen', -7.5), 'battle1': ('Level 1', -9.0), 'battle2': ('Level 2', -9.0), 'battle3': ('Level 3', -9.0), 'calm': ('Ending', -3.5)}
for name, (title, gain) in MUSIC.items():
    src = os.path.join(mus, 'Juhani Junkala [Retro Game Music Pack] ' + title + '.ogg')
    if not os.path.isfile(src):
        raise SystemExit('missing ' + src)
    base = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-af', 'volume=%sdB' % gain, '-map_metadata', '-1', '-vn']
    run(base + ['-c:a', 'libvorbis', '-q:a', '3', os.path.join(out_audio, name + '.ogg')])
    run(base + ['-c:a', 'libmp3lame', '-b:a', '112k', os.path.join(out_audio, name + '.mp3')])
    print(name, title, os.path.getsize(os.path.join(out_audio, name + '.ogg')), os.path.getsize(os.path.join(out_audio, name + '.mp3')))
