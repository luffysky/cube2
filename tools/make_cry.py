# Synthesise the cartoon "boo-hoo" crying clip used when a match is lost.
#   python3 -I tools/make_cry.py out.wav
# Made from scratch (a buzzing voice through two "oo" vowel resonances), so it carries no third-party licence.
import sys
import numpy as np
from scipy.signal import lfilter

SR = 44100
rng = np.random.default_rng(7)


def resonator(x, f, bw):
    r = np.exp(-np.pi * bw / SR)
    a = [1, -2 * r * np.cos(2 * np.pi * f / SR), r * r]
    return lfilter([1 - r], a, x)


def sob(dur, f0, f1, wob=6.0, depth=0.035):
    n = int(dur * SR)
    tt = np.arange(n) / SR
    # pitch slides down, with a shaky vibrato that gets stronger towards the end
    glide = f0 * (f1 / f0) ** (tt / dur)
    vib = 1 + depth * np.sin(2 * np.pi * wob * tt) * (0.4 + 0.6 * tt / dur)
    f = glide * vib
    ph = 2 * np.pi * np.cumsum(f) / SR
    # glottal-ish buzz: a few harmonics with falling strength
    src = sum(np.sin(k * ph) / k ** 1.2 for k in range(1, 18))
    src += 0.04 * rng.standard_normal(n)
    # "oo" vowel: low first and second formants
    v = resonator(src, 320, 80) * 1.0 + resonator(src, 800, 120) * 0.45 + resonator(src, 2500, 200) * 0.08
    env = np.minimum(1, tt / 0.06) * np.minimum(1, (dur - tt) / 0.18)
    env *= 0.85 + 0.15 * np.sin(2 * np.pi * 3.2 * tt)  # little sobbing pulses
    return v * np.clip(env, 0, 1)


def gap(s):
    return np.zeros(int(s * SR))


def hic(f):
    # short sniffly intake between sobs
    n = int(0.09 * SR)
    noise = rng.standard_normal(n)
    noise = resonator(noise, 3200, 900)
    return noise * np.hanning(n) * 0.25


parts = [
    sob(0.55, 560, 470),
    gap(0.07), hic(0), gap(0.05),
    sob(0.42, 540, 430),
    gap(0.06),
    sob(0.95, 600, 330, wob=7.5, depth=0.05),
]
y = np.concatenate(parts)
y /= np.max(np.abs(y)) * 1.12
pcm = (y * 32767).astype('<i2')

import wave
with wave.open(sys.argv[1], 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('wrote %s, %.2f s' % (sys.argv[1], len(y) / SR))
