# Summarise short WAV clips: duration, loudness, brightness and pitch movement. Reads files as data only.
import sys, wave, struct, os
import numpy as np

def load(path):
    with wave.open(path, 'rb') as w:
        n, ch, sw, sr = w.getnframes(), w.getnchannels(), w.getsampwidth(), w.getframerate()
        raw = w.readframes(n)
    if sw == 2:
        a = np.frombuffer(raw, dtype='<i2').astype(np.float32) / 32768
    elif sw == 3:
        b = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3)
        a = ((b[:, 0].astype(np.int32) | (b[:, 1].astype(np.int32) << 8) | (b[:, 2].astype(np.int32) << 16)) << 8 >> 8).astype(np.float32) / 8388608
    elif sw == 4:
        a = np.frombuffer(raw, dtype='<i4').astype(np.float32) / 2147483648
    else:
        a = (np.frombuffer(raw, dtype=np.uint8).astype(np.float32) - 128) / 128
    if ch > 1:
        a = a.reshape(-1, ch).mean(axis=1)
    return a, sr

def centroid(x, sr):
    if len(x) < 64: return 0
    s = np.abs(np.fft.rfft(x * np.hanning(len(x))))
    f = np.fft.rfftfreq(len(x), 1 / sr)
    return float((s * f).sum() / (s.sum() + 1e-9))

def peakfreq(x, sr):
    if len(x) < 64: return 0
    s = np.abs(np.fft.rfft(x * np.hanning(len(x))))
    f = np.fft.rfftfreq(len(x), 1 / sr)
    return float(f[int(np.argmax(s[2:])) + 2])

rows = []
for p in sys.argv[1:]:
    try:
        a, sr = load(p)
    except Exception as e:
        rows.append((os.path.basename(p), 'ERR ' + str(e))); continue
    thr = 0.02 * (np.abs(a).max() + 1e-9)
    idx = np.where(np.abs(a) > thr)[0]
    if len(idx) == 0:
        rows.append((os.path.basename(p), 'silent')); continue
    b = a[idx[0]:idx[-1] + 1]
    dur = len(b) / sr
    rms = float(np.sqrt((b ** 2).mean()))
    h = len(b) // 2
    c1, c2 = centroid(b[:h], sr), centroid(b[h:], sr)
    p1, p2 = peakfreq(b[:h], sr), peakfreq(b[h:], sr)
    # attack: time to reach 80% of peak
    env = np.abs(b)
    att = int(np.argmax(env > 0.8 * env.max())) / sr
    rows.append((os.path.basename(p), '%5.0fms  peak %.2f rms %.3f  att %3.0fms  bright %5.0f->%5.0f  pitch %5.0f->%5.0f' % (dur * 1000, float(np.abs(a).max()), rms, att * 1000, c1, c2, p1, p2)))
for n, s in rows:
    print('%-26s %s' % (n, s))
