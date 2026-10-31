"""Profile bot: runs the README games and draws every image on the profile.

  python .github/scripts/bot.py event    handle the issue in $GITHUB_EVENT_PATH (quiz/word/ttt/vote)
  python .github/scripts/bot.py cron     daily fact + activity refresh
  python .github/scripts/bot.py render   redraw everything, static assets included
"""
import json
import os
import random
import re
import sys
import textwrap
import urllib.request
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from urllib.parse import quote_plus

ROOT = Path(__file__).resolve().parents[2]
DATA, STATE_FILE = ROOT / "data", ROOT / "state" / "state.json"
STATIC, LIVE = ROOT / "assets" / "static", ROOT / "assets" / "live"
REPO = os.environ.get("GITHUB_REPOSITORY", "sid2428/sid2428")
OWNER = REPO.split("/")[0]

C = dict(bg="#F3ECDC", paper="#FCF7EB", paper2="#EFE3CC", ink="#3B2A20", muted="#7A6553", faint="#CDBB9C",
         orange="#E07A1F", yellow="#E8A317", red="#C2452D", green="#4F8A3A", shadow="#D8C8AA", dots="#E6DBC4",
         screen="#2E211A", glow="#F2D3A6")
MONO = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace"

# ---------------------------------------------------------------- 5x7 pixel font
FONT = {
    "A": [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    "B": ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
    "C": [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
    "D": ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
    "E": ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
    "F": ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
    "G": [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".####"],
    "H": ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    "I": [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
    "J": ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
    "K": ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
    "L": ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
    "M": ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
    "N": ["#...#", "#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#"],
    "O": [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    "P": ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
    "Q": [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
    "R": ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
    "S": [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
    "T": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
    "U": ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    "V": ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
    "W": ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "#.#.#", ".#.#."],
    "X": ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
    "Y": ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
    "Z": ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
    "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
    "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
    "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
    "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
    "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
    "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
    "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
    "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
    "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
    "9": [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
    ".": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
    ",": [".....", ".....", ".....", ".....", ".##..", "..#..", ".#..."],
    ":": [".....", ".##..", ".##..", ".....", ".##..", ".##..", "....."],
    ";": [".....", ".##..", ".##..", ".....", ".##..", "..#..", ".#..."],
    "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
    "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."],
    "-": [".....", ".....", ".....", ".###.", ".....", ".....", "....."],
    "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
    "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
    "(": ["...#.", "..#..", ".#...", ".#...", ".#...", "..#..", "...#."],
    ")": [".#...", "..#..", "...#.", "...#.", "...#.", "..#..", ".#..."],
    "'": ["..#..", "..#..", ".#...", ".....", ".....", ".....", "....."],
    '"': [".#.#.", ".#.#.", ".....", ".....", ".....", ".....", "....."],
    ">": [".#...", "..#..", "...#.", "....#", "...#.", "..#..", ".#..."],
    "<": ["...#.", "..#..", ".#...", "#....", ".#...", "..#..", "...#."],
    "=": [".....", ".....", "#####", ".....", "#####", ".....", "....."],
    "_": [".....", ".....", ".....", ".....", ".....", ".....", "#####"],
    "@": [".###.", "#...#", "#.###", "#.#.#", "#.###", "#....", ".###."],
    "&": [".##..", "#..#.", "#.#..", ".#...", "#.#.#", "#..#.", ".##.#"],
    "#": [".#.#.", ".#.#.", "#####", ".#.#.", "#####", ".#.#.", ".#.#."],
    "%": ["##..#", "##..#", "...#.", "..#..", ".#...", "#..##", "#..##"],
    "^": ["..#..", ".#.#.", "#...#", ".....", ".....", ".....", "....."],
    "*": [".....", "#.#.#", ".###.", "#####", ".###.", "#.#.#", "....."],
    "[": [".###.", ".#...", ".#...", ".#...", ".#...", ".#...", ".###."],
    "]": [".###.", "...#.", "...#.", "...#.", "...#.", "...#.", ".###."],
    "{": ["...##", "..#..", "..#..", ".#...", "..#..", "..#..", "...##"],
    "}": ["##...", "..#..", "..#..", "...#.", "..#..", "..#..", "##..."],
    "·": [".....", ".....", ".....", "..#..", ".....", ".....", "....."],
    "↓": ["..#..", "..#..", "..#..", "#.#.#", ".###.", "..#..", "....."],
    "♥": [".....", ".#.#.", "#####", "#####", ".###.", "..#..", "....."],
}


def runs_path(rows, on="#"):
    d = []
    for y, row in enumerate(rows):
        x = 0
        while x < len(row):
            if row[x] == on:
                s = x
                while x < len(row) and row[x] == on:
                    x += 1
                d.append(f"M{s} {y}h{x - s}v1h-{x - s}z")
            else:
                x += 1
    return "".join(d)


def f(x):
    return f"{x:.3f}".rstrip("0").rstrip(".")


def tw(s, sc):
    return (len(s) * 6 - 1) * sc


def clean(s):
    s = s.upper()
    return "".join(ch if ch in FONT or ch == " " else "?" for ch in s)


def wrap(s, n):
    return textwrap.wrap(clean(s), n) or [""]


class Svg:
    def __init__(self, w, h, label):
        self.w, self.h, self.label = w, h, label
        self.parts, self.glyphs = [], set()

    def add(self, *s):
        self.parts.extend(s)
        return self

    def text(self, s, x, y, sc, color, anchor="start", fit=None, anim=None):
        s = clean(s)
        if fit and tw(s, sc) > fit:
            sc = fit / tw(s, 1)
        w = tw(s, sc)
        x = x - w / 2 if anchor == "middle" else x - w if anchor == "end" else x
        uses = []
        for i, ch in enumerate(s):
            if ch == " ":
                continue
            self.glyphs.add(ch)
            a = anim(i) if anim else ""
            gid = f"g{ord(ch)}"
            uses.append(f'<use href="#{gid}" x="{i * 6}">{a}</use>' if a else f'<use href="#{gid}" x="{i * 6}"/>')
        self.parts.append(f'<g transform="translate({f(x)} {f(y)}) scale({f(sc)})" fill="{color}">{"".join(uses)}</g>')
        return w

    def render(self):
        defs = "".join(f'<path id="g{ord(ch)}" d="{runs_path(FONT[ch])}"/>' for ch in sorted(self.glyphs))
        return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.w}" height="{self.h}" '
                f'viewBox="0 0 {self.w} {self.h}" role="img" aria-label="{escape(self.label)}">'
                f'<defs>{defs}</defs>{"".join(self.parts)}</svg>')

    def save(self, path):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(self.render(), encoding="utf-8")


def notch(x, y, w, h, n=4):
    return (f"M{f(x + n)} {f(y)}H{f(x + w - n)}V{f(y + n)}H{f(x + w)}V{f(y + h - n)}H{f(x + w - n)}V{f(y + h)}"
            f"H{f(x + n)}V{f(y + h - n)}H{f(x)}V{f(y + n)}H{f(x + n)}Z")


def box(x, y, w, h, fill, border=C["ink"], shadow=True, b=4):
    out = f'<path d="{notch(x + 6, y + 6, w, h)}" fill="{C["shadow"]}"/>' if shadow else ""
    return (out + f'<path d="{notch(x, y, w, h)}" fill="{border}"/>'
            f'<path d="{notch(x + b, y + b, w - 2 * b, h - 2 * b)}" fill="{fill}"/>')


def sprite(rows, colors, x, y, sc):
    keys = sorted({c for r in rows for c in r} - {"."})
    paths = "".join(f'<path d="{runs_path(rows, k)}" fill="{colors[k]}"/>' for k in keys)
    return f'<g transform="translate({f(x)} {f(y)}) scale({f(sc)})">{paths}</g>'


def card(w, h, title, right="", label=""):
    """Standard card: cream panel, ink border, hard shadow, orange title bar."""
    s = Svg(w, h, label or title)
    s.add(box(0, 0, w - 6, h - 6, C["paper"]))
    s.text(title, 22, 20, 3, C["orange"])
    if right:
        s.text(right, w - 28, 20, 3, C["muted"], "end")
    s.add(f'<rect x="4" y="50" width="{w - 14}" height="4" fill="{C["ink"]}"/>')
    return s


def appear(sec):
    sec = max(sec, .01)
    return (f'<animate attributeName="opacity" values="0;1" keyTimes="0;.999" calcMode="discrete" '
            f'dur="{f(sec)}s" fill="freeze"/>')


def windows(spans, T):
    spans = [(round(a, 3), round(b, 3)) for a, b in spans]
    times = sorted({0.0} | {t for a, b in spans for t in (a, b) if t < T})
    keys, vals = [], []
    for k in times:
        on = int(any(a <= k < b for a, b in spans))
        if not vals or vals[-1] != on:
            keys.append(k)
            vals.append(on)
    return (f'<animate attributeName="opacity" values="{";".join(map(str, vals))}" '
            f'keyTimes="{";".join(f(k / T) for k in keys)}" calcMode="discrete" dur="{f(T)}s" repeatCount="indefinite"/>')


# ---------------------------------------------------------------- sprites
HERO = ["....HHHHH...", "...HHHHHHH..", "...HHSSSSS..", "...HSSSESE..", "...HSSSSSS..", "....SSSMMS..",
        ".....ssss...", "...BBBBBBB..", "..BBBWBBBBS.", ".SBBBBBBB...", "...BBBWBB...", "...BBBBBB...", "...PPPPPP..."]
LEGS = {"a": ["..PP...PP...", ".PP.....PP..", ".KK.....KK.."], "b": ["....PPPP....", "....PP.PP...", "...KK..KK..."]}
HERO_C = {"H": "#2A1C14", "S": "#E6A16B", "s": "#C88C61", "E": "#2A1C14", "M": "#FCF7EB", "B": "#1F3E6E",
          "W": "#FCF7EB", "P": "#6E5A4A", "K": "#FCF7EB"}
BUG = ["...k...k...", "....k.k....", "...RRRRR...", "..RRWRWRR..", ".kRRRRRRRk.", "..RrRRRrR..", ".k.k...k.k."]
BUG_C = {"R": C["red"], "r": "#8E2F1F", "W": "#FFFFFF", "k": C["ink"]}
TROPHY = ["Y.YYYYY.Y", "Y.YYYYY.Y", ".YYYYYYY.", "..YYYYY..", "...YYY...", "....Y....", "...YYY...", "..OOOOO.."]


# ================================================================= STATIC ART
def hero():
    W, H = 1200, 600
    s = Svg(W, H, "Kartik Gaikwad (sid2428): ASCII portrait on an arcade screen; 3rd-year E&TC student at PICT Pune; "
                  "backend, full-stack, frontend and AI/ML; projects AEGIS and Studio Oak; IEEE TechRush winner.")
    s.add(f'<defs><pattern id="dots" width="16" height="16" patternUnits="userSpaceOnUse">'
          f'<rect width="4" height="4" fill="{C["dots"]}"/></pattern></defs>',
          f'<rect width="{W}" height="{H}" fill="{C["bg"]}"/><rect width="{W}" height="{H}" fill="url(#dots)"/>')
    # HUD
    s.text("1UP", 32, 22, 3, C["orange"])
    s.text("SID2428", 32 + 4 * 18, 22, 3, C["ink"])
    s.add("<g>")
    s.text("INSERT COIN TO HIRE", 600, 22, 3, C["orange"], "middle")
    s.add('<animate attributeName="opacity" values="1;0" keyTimes="0;.62" calcMode="discrete" dur="1.3s" '
          'repeatCount="indefinite"/></g>')
    s.text("PUNE, INDIA", W - 32, 22, 3, C["muted"], "end")
    s.add(f'<path d="{"".join(f"M{x} 54h8v4h-8z" for x in range(32, W - 32, 16))}" fill="{C["ink"]}" opacity=".5"/>')

    # arcade screen with the ASCII portrait printing in
    rows = json.loads((DATA / "portrait.json").read_text(encoding="utf-8"))
    s.add(box(32, 76, 528, 500, C["screen"]))
    cw, rh, x0, y0 = 5.2, 9.3, 46, 92
    for i, row in enumerate(rows):
        if row.strip():
            s.add(f'<text x="{x0}" y="{f(y0 + i * rh + 7)}" font-family="{MONO}" font-size="8.8" fill="{C["glow"]}" '
                  f'textLength="{f(len(row) * cw)}" lengthAdjust="spacing" xml:space="preserve">'
                  f'{escape(row, quote=False)}{appear(.3 + i * .035)}</text>')
    s.add(f'<rect x="36" y="80" width="520" height="2" fill="{C["glow"]}" opacity=".18">'
          f'<animateTransform attributeName="transform" type="translate" values="0 0;0 488" dur="6s" '
          f'repeatCount="indefinite"/></rect>')

    # identity
    X = 600
    s.text("KARTIK GAIKWAD", X, 84, 6, C["ink"], fit=W - 32 - X)
    roles = ["BACKEND", "FULL-STACK", "FRONTEND", "AI / ML"]
    per = 2.4
    for i, r in enumerate(roles):
        s.add(f'<g opacity="{1 if i == 0 else 0}">{windows([(i * per, (i + 1) * per)], per * len(roles))}')
        s.text("CLASS", X, 150, 4, C["orange"])
        s.text(r, X + 6 * 24, 150, 4, C["ink"])
        s.add("</g>")
    lines = [("LVL 3", "E&TC @ PICT PUNE"), ("QUESTS", "AEGIS, STUDIO OAK"), ("STACK", "JAVA PYTHON REACT"),
             ("TROPHY", "IEEE TECHRUSH WINNER")]
    clock = 1.0
    for i, (k, v) in enumerate(lines):
        y = 206 + i * 38
        line = f"> {k:<7}{v}"
        s.text(line, X, y, 3, C["ink"], anim=lambda j, c=clock: appear(c + j * .03))
        s.text(f"> {k}", X, y, 3, C["orange"], anim=lambda j, c=clock: appear(c + j * .03))
        clock += len(line) * .03 + .2

    # little runner jumping a bug on a ground line
    gy, T = 460, 7.0
    s.add(f'<rect x="{X}" y="{gy}" width="{W - 32 - X}" height="4" fill="{C["ink"]}"/>')
    s.add(sprite(BUG, BUG_C, 870, gy - 28, 4))
    x_from, x_to = X, W - 84
    jx = [(0, x_from), (T * .85, x_to), (T, x_to)]
    t_jump = (870 + 22 - x_from - 24) / (x_to - x_from) * T * .85
    s.add(f'<g transform="translate({x_from} 0)"><animateTransform attributeName="transform" type="translate" '
          f'values="{";".join(f"{x} 0" for _, x in jx)}" keyTimes="{";".join(f(t / T) for t, _ in jx)}" '
          f'dur="{T}s" repeatCount="indefinite"/><g>'
          f'<animateTransform attributeName="transform" type="translate" values="0 0;0 0;0 -70;0 0;0 0" '
          f'keyTimes="0;{f((t_jump - .35) / T)};{f(t_jump / T)};{f((t_jump + .35) / T)};1" dur="{T}s" '
          f'repeatCount="indefinite"/>')
    for k, span in (("a", (0, .15)), ("b", (.15, .3))):
        s.add(f'<g opacity="{1 if k == "a" else 0}">{windows([span], .3)}'
              f'{sprite(HERO + LEGS[k], HERO_C, 0, gy - 64, 4)}</g>')
    s.add("</g></g>")
    s.add("<g>")
    s.text("SCROLL DOWN TO PLAY ↓", X, 504, 4, C["orange"])
    s.add('<animateTransform attributeName="transform" type="translate" values="0 0;0 4" keyTimes="0;.5" '
          'calcMode="discrete" dur=".9s" repeatCount="indefinite"/></g>')
    s.text("QUIZ · WORDS · TIC-TAC-TOE · BUG HUNT", X, 548, 3, C["muted"], fit=W - 32 - X)
    s.save(STATIC / "hero.svg")


def button(path, label, w, h, fill=C["paper"], color=C["ink"], sc=3, sub=None):
    s = Svg(w, h, label)
    s.add(box(0, 0, w - 6, h - 6, fill))
    s.text(label, (w - 6) / 2, (h - 6) / 2 - 7 * sc / 2, sc, color, "middle", fit=w - 30)
    s.save(path)


def static_buttons():
    for k in "ABC":
        button(STATIC / f"ans-{k.lower()}.svg", f"ANSWER {k}", 258, 64)
    for ch in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
        button(STATIC / "keys" / f"{ch}.svg", ch, 58, 58, sc=4)
        button(STATIC / "keys" / f"{ch}-hit.svg", ch, 58, 58, C["orange"], C["paper"], 4)
        button(STATIC / "keys" / f"{ch}-miss.svg", ch, 58, 58, C["paper2"], C["faint"], 4)
    for i in range(9):
        cell(STATIC / "cells" / f"{i + 1}.svg", "", str(i + 1))
    cell(STATIC / "cells" / "x.svg", "X")
    cell(STATIC / "cells" / "o.svg", "O")
    button(STATIC / "vote-java.svg", "VOTE JAVA", 390, 64)
    button(STATIC / "vote-python.svg", "VOTE PYTHON", 390, 64)
    for key, label in (("linkedin", "LINKEDIN"), ("email", "EMAIL"), ("aegis", "AEGIS"), ("studio-oak", "STUDIO OAK")):
        button(STATIC / f"link-{key}.svg", label, 196, 64)


def cell(path, mark, hint=""):
    s = Svg(126, 126, f"square {hint}" if hint else mark)
    s.add(box(0, 0, 120, 120, C["paper"] if not mark else C["paper2"]))
    if mark == "X":
        s.text("X", 60, 39, 7, C["orange"], "middle")
    elif mark == "O":
        s.text("O", 60, 39, 7, C["ink"], "middle")
    else:
        s.text(hint, 60, 50, 3, C["faint"], "middle")
    s.save(path)


FILES = [
    ("billing/price.py", None, ['from decimal import Decimal', 'total = Decimal("0.10") + Decimal("0.20")',
                                'assert total == Decimal("0.30")   # passes'],
     "CLEAN: DECIMAL, NOT FLOAT. MONEY MATH DONE RIGHT."),
    ("ui/sort.js", 2, ['const scores = [10, 9, 1];', 'scores.sort();', 'console.log(scores);   // [1, 10, 9]'],
     "BUG: SORT() COMPARES AS STRINGS. USE SORT((A, B) => A - B)."),
    ("auth/guard.ts", None, ['if (user?.role === "admin") {', '  grantAccess(user);', '}'],
     "CLEAN: STRICT EQUALITY, OPTIONAL CHAINING."),
    ("db/user.sql", None, ['SELECT name, email', 'FROM users', 'WHERE id = $1;   -- parameterised'],
     "CLEAN: PARAMETERISED. NO SQL INJECTION TODAY."),
    ("shop/cart.py", 1, ['def add_item(item, cart=[]):', '    cart.append(item)', '    return cart',
                         'add_item("tea"); add_item("milk")   # ["tea", "milk"] ?!'],
     "BUG: THE DEFAULT LIST IS SHARED BY EVERY CALL. USE CART=NONE."),
    ("net/retry.js", None, ['for (let i = 0; i < 5; i++) {', '  try { return await fetchData(); }',
                            '  catch { await sleep(2 ** i * 100); }', '}'],
     "CLEAN: BOUNDED RETRIES WITH BACKOFF."),
    ("lib/sum.c", 2, ['int sum = 0;', 'for (int i = 0; i <= n; i++)', '    sum += a[i];'],
     "BUG: OFF-BY-ONE. I <= N READS A[N], PAST THE END."),
    (".github/ci.yml", None, ['on: [push]', 'jobs:', '  test:', '    runs-on: ubuntu-latest'],
     "CLEAN: BORING CI CONFIG. BORING IS GOOD."),
]


def bughunt():
    s = card(800, 150, "BUG HUNT", "3 BUGS · 8 FILES")
    s.text("CLICK A FILE TO OPEN IT AND REVIEW", 22, 76, 3, C["ink"])
    s.text("THE CODE. FIND ALL 3 BUGS.", 22, 106, 3, C["ink"])
    s.save(STATIC / "bughunt.svg")
    for n, (path, bug, code, verdict) in enumerate(FILES, 1):
        r = Svg(766, 62, f"open {path}")
        r.add(box(0, 0, 760, 56, C["paper"]))
        r.text("> " + path, 20, 18, 3, C["ink"])
        r.text(f"{len(code)} LINES · OPEN", 736, 20, 2.4, C["muted"], "end")
        r.save(STATIC / "files" / f"{n}.svg")
        lh = 30
        h = 30 + lh * len(code) + 70
        o = Svg(766, h, f"{path}: {verdict}")
        o.add(box(0, 0, 760, h - 6, C["paper"]))
        for i, ln in enumerate(code, 1):
            y = 14 + i * lh
            if i == bug:
                o.add(f'<rect x="8" y="{y - 21}" width="744" height="{lh}" fill="{C["orange"]}"/>')
            o.add(f'<text x="24" y="{y}" font-family="{MONO}" font-size="17" '
                  f'fill="{C["paper"] if i == bug else C["muted"]}">{i}</text>'
                  f'<text x="56" y="{y}" font-family="{MONO}" font-size="17" fill="{C["paper"] if i == bug else C["ink"]}" '
                  f'xml:space="preserve">{escape(ln, quote=False)}</text>')
        y = 30 + lh * len(code)
        o.add(f'<rect x="8" y="{y}" width="744" height="4" fill="{C["ink"]}" opacity=".15"/>')
        o.text(verdict, 22, y + 22, 2.6, C["red"] if bug else C["green"], fit=716)
        o.save(STATIC / "files" / f"{n}-open.svg")


# ================================================================= STATE
def load(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


QUIZ, WORDS, FACTS = load("quiz.json"), load("words.json"), load("facts.json")


def default_state():
    return {"rev": 0,
            "quiz": {"i": 0, "num": 1, "last": None},
            "word": {"round": 1, "i": 0, "guessed": [], "lives": 6, "last": None, "prev": None},
            "ttt": {"game": 1, "board": [""] * 9, "w": 0, "l": 0, "d": 0, "last": None},
            "poll": {"java": [], "python": []},
            "scores": {}, "feed": [],
            "fact": {"i": 0, "day": ""},
            "activity": [], "activity_at": ""}


def read_state():
    if STATE_FILE.exists():
        st = json.loads(STATE_FILE.read_text(encoding="utf-8"))
        base = default_state()
        base.update(st)
        return base
    return default_state()


def write_state(st):
    STATE_FILE.parent.mkdir(exist_ok=True)
    STATE_FILE.write_text(json.dumps(st, indent=1) + "\n", encoding="utf-8")


def award(st, user, pts):
    st["scores"][user] = st["scores"].get(user, 0) + pts


def feed(st, line):
    st["feed"] = ([line] + st["feed"])[:5]


# ================================================================= GAMES
def play_quiz(st, user, num, pick):
    q = st["quiz"]
    if num != q["num"]:
        return f"Question #{num} has already been answered. The quiz card is now on #{q['num']}, give that one a go!"
    item = QUIZ[q["i"] % len(QUIZ)]
    ok = "abc".index(pick) == item["a"]
    right = "ABC"[item["a"]]
    if ok:
        award(st, user, 1)
    q["last"] = {"user": user, "pick": pick.upper(), "ok": ok, "right": right, "why": item["why"], "num": num}
    q["i"] += 1
    q["num"] += 1
    feed(st, f"@{user} answered quiz #{num}: {'correct' if ok else 'wrong'}")
    head = "Correct! +1 point." if ok else f"Not quite. The answer was **{right}**: {item['o'][item['a']]}."
    return f"{head} {item['why']}\n\nThe card now shows question #{q['num']}."


def new_word(w, st):
    w["round"] += 1
    w["i"] += 1
    w["guessed"], w["lives"], w["last"] = [], 6, None


def play_word(st, user, rnd, letter):
    w = st["word"]
    if rnd != w["round"]:
        return f"Round {rnd} is over. Round {w['round']} is live now, try a letter there!"
    word = WORDS[w["i"] % len(WORDS)]["w"]
    if letter in w["guessed"]:
        return f"**{letter}** was already guessed this round. Pick another letter!"
    w["guessed"].append(letter)
    hit = letter in word
    w["last"] = {"user": user, "letter": letter, "hit": hit}
    if hit:
        award(st, user, 1)
        if all(ch in w["guessed"] for ch in word):
            award(st, user, 3)
            w["prev"] = {"word": word, "result": "solved", "user": user}
            feed(st, f"@{user} solved {word}")
            new_word(w, st)
            return f"**{letter}** is in, and that solves it: **{word}**! +4 points. A new word is up."
        feed(st, f"@{user} guessed {letter}: hit")
        return f"**{letter}** is in the word! +1 point."
    w["lives"] -= 1
    feed(st, f"@{user} guessed {letter}: miss")
    if w["lives"] <= 0:
        w["prev"] = {"word": word, "result": "lost", "user": user}
        new_word(w, st)
        return f"No **{letter}**, and that was the last life. The word was **{word}**. A new word is up."
    return f"No **{letter}** in this word. {w['lives']} lives left."


LINES = [(0, 1, 2), (3, 4, 5), (6, 7, 8), (0, 3, 6), (1, 4, 7), (2, 5, 8), (0, 4, 8), (2, 4, 6)]


def winner(b):
    for a, c, d in LINES:
        if b[a] and b[a] == b[c] == b[d]:
            return b[a]
    return "draw" if all(b) else None


def bot_move(b):
    free = [i for i in range(9) if not b[i]]
    for mark in ("O", "X"):  # win if possible, otherwise block
        for i in free:
            t = b[:]
            t[i] = mark
            if winner(t) == mark:
                return i
    if random.random() < .3:  # leave visitors a real chance
        return random.choice(free)
    for i in (4, 0, 2, 6, 8, 1, 3, 5, 7):
        if i in free:
            return i


def play_ttt(st, user, game, sq):
    t = st["ttt"]
    if game != t["game"]:
        return f"Game {game} is finished. Game {t['game']} is on the board now, make your move there!"
    b = t["board"]
    if b[sq]:
        return f"Square {sq + 1} is taken. Pick an empty one!"
    b[sq] = "X"
    w = winner(b)
    reply = None
    if w is None:
        o = bot_move(b)
        b[o] = "O"
        w = winner(b)
        t["last"] = {"user": user, "you": sq + 1, "bot": o + 1}
        reply = f"You took {sq + 1}, the bot answered with {o + 1}. Your move!"
    if w:
        result = {"X": "won", "O": "lost", "draw": "drew"}[w]
        t[{"X": "w", "O": "l", "draw": "d"}[w]] += 1
        award(st, user, {"X": 3, "O": 0, "draw": 1}[w])
        t["last"] = {"user": user, "result": result, "game": game}
        feed(st, f"@{user} {result} tic-tac-toe game {game}")
        t["game"] += 1
        t["board"] = [""] * 9
        reply = {"won": "You beat the bot! +3 points.", "lost": "The bot wins this one.",
                 "drew": "It's a draw. +1 point."}[result] + " A fresh board is up."
    else:
        feed(st, f"@{user} played square {sq + 1}")
    return reply


def play_vote(st, user, opt):
    p = st["poll"]
    for k in p:
        if user in p[k]:
            p[k].remove(user)
    p[opt].append(user)
    feed(st, f"@{user} voted {opt}")
    return f"Your vote for **{opt.title()}** is in. Voting again changes it."


# ================================================================= LIVE CARDS
def live_quiz(st):
    q = st["quiz"]
    item = QUIZ[q["i"] % len(QUIZ)]
    qlines = wrap(item["q"], 40)
    last = q["last"]
    llines = []
    if last:
        verdict = "CORRECT!" if last["ok"] else f"WRONG, IT WAS {last['right']}."
        llines = wrap(f"#{last['num']}: @{last['user']} PICKED {last['pick']}. {verdict}", 44) + wrap(last["why"], 44)
    h = 70 + 32 * len(qlines) + 3 * 54 + 20 + (24 * len(llines) + 30 if llines else 0) + 10
    s = card(800, h, f"QUIZ #{q['num']}", "+1 PT IF RIGHT",
             label=f"Quiz question {q['num']}: {item['q']} A: {item['o'][0]}. B: {item['o'][1]}. C: {item['o'][2]}.")
    y = 72
    for ln in qlines:
        s.text(ln, 22, y, 3, C["ink"])
        y += 32
    y += 6
    for k, opt in enumerate(item["o"]):
        s.add(f'<rect x="18" y="{y}" width="758" height="44" fill="{C["paper2"]}"/>')
        s.text("ABC"[k], 34, y + 12, 3, C["orange"])
        s.text(opt, 74, y + 12, 3, C["ink"], fit=690)
        y += 54
    if llines:
        y += 8
        s.add(f'<rect x="18" y="{y}" width="758" height="4" fill="{C["ink"]}" opacity=".15"/>')
        y += 18
        for i, ln in enumerate(llines):
            s.text(ln, 22, y, 2.4, (C["green"] if last["ok"] else C["red"]) if i == 0 else C["muted"], fit=750)
            y += 24
    s.save(LIVE / "quiz.svg")


def live_word(st):
    w = st["word"]
    entry = WORDS[w["i"] % len(WORDS)]
    word = entry["w"]
    h = 214 + (32 if w["last"] else 0) + (32 if w["prev"] else 0)
    s = card(800, h, f"WORD GAME · ROUND {w['round']}", "", label=f"Word game round {w['round']}: "
             + " ".join(ch if ch in w["guessed"] else "_" for ch in word) + f". Hint: {entry['h']}")
    hearts = "♥" * w["lives"] + "·" * (6 - w["lives"])
    s.text(hearts, 772, 20, 3, C["red"], "end")
    slot = 50 if len(word) <= 12 else 44
    x0 = (794 - slot * len(word)) / 2
    for i, ch in enumerate(word):
        x = x0 + i * slot
        s.add(f'<rect x="{f(x + 4)}" y="114" width="{slot - 12}" height="5" fill="{C["ink"]}"/>')
        if ch in w["guessed"]:
            s.text(ch, x + 4 + (slot - 12) / 2, 72, 5, C["ink"], "middle")
    s.text("HINT: " + entry["h"], 400, 138, 3, C["muted"], "middle", fit=740)
    misses = [g for g in w["guessed"] if g not in word]
    s.text("MISSES: " + (" ".join(misses) if misses else "NONE YET"), 400, 172, 3, C["ink"], "middle", fit=740)
    y = 212
    if w["last"]:
        l = w["last"]
        s.text(f"@{l['user']} GUESSED {l['letter']}: {'HIT!' if l['hit'] else 'MISS'}", 400, y, 2.6,
               C["green"] if l["hit"] else C["red"], "middle", fit=740)
    if w["prev"]:
        p = w["prev"]
        msg = (f"LAST WORD {p['word']} SOLVED BY @{p['user']}" if p["result"] == "solved"
               else f"LAST WORD WAS {p['word']}. NOBODY GOT IT")
        s.text(msg, 400, y + (32 if w["last"] else 0), 2.4, C["muted"], "middle", fit=740)
    s.save(LIVE / "word.svg")


def live_ttt(st):
    t = st["ttt"]
    s = card(800, 170, f"TIC-TAC-TOE · GAME {t['game']}", f"W{t['w']} L{t['l']} D{t['d']}",
             label=f"Tic-tac-toe game {t['game']}. Visitors have won {t['w']}, lost {t['l']}, drawn {t['d']}.")
    s.text("YOU ARE X. THE BOT IS O.", 22, 74, 3, C["ink"])
    l = t["last"]
    if l and "result" in l:
        msg = {"won": "BEAT THE BOT!", "lost": "LOST TO THE BOT.", "drew": "DREW WITH THE BOT."}[l["result"]]
        line = f"GAME {l['game']}: @{l['user']} {msg}"
    elif l:
        line = f"@{l['user']} TOOK {l['you']}, BOT TOOK {l['bot']}. YOUR MOVE!"
    else:
        line = "CLICK AN EMPTY SQUARE TO MOVE."
    s.text(line, 22, 116, 2.6, C["orange"], fit=750)
    s.save(LIVE / "ttt.svg")


def live_board(st):
    top = sorted(st["scores"].items(), key=lambda kv: (-kv[1], kv[0]))[:5]
    rows = max(1, len(top))
    fd = st["feed"][:5]
    h = 72 + 34 * rows + 40 + 28 * max(1, len(fd)) + 20
    s = card(800, h, "HIGH SCORES", "LIVE", label="High scores: " + ", ".join(f"{u} {p}" for u, p in top))
    y = 72
    if not top:
        s.text("NO PLAYERS YET. BE THE FIRST!", 22, y, 3, C["muted"])
        y += 34
    for i, (u, p) in enumerate(top, 1):
        s.text(f"{i}. @{u}", 22, y, 3, C["orange"] if i == 1 else C["ink"], fit=560)
        s.text(f"{p} PTS", 772, y, 3, C["ink"], "end")
        y += 34
    s.add(f'<rect x="18" y="{y}" width="758" height="4" fill="{C["ink"]}" opacity=".15"/>')
    y += 18
    s.text("LATEST MOVES", 22, y, 2.4, C["muted"])
    y += 28
    for ln in fd or ["WAITING FOR THE FIRST MOVE..."]:
        s.text(ln, 22, y, 2.4, C["ink"], fit=750)
        y += 28
    s.save(LIVE / "board.svg")


def live_fact(st):
    i = st["fact"]["i"] % len(FACTS)
    lines = wrap(FACTS[i], 40)
    s = card(800, 74 + 32 * len(lines) + 12, "DEV FACT OF THE DAY", f"#{i + 1}", label="Dev fact: " + FACTS[i])
    for k, ln in enumerate(lines):
        s.text(ln, 22, 72 + 32 * k, 3, C["ink"])
    s.save(LIVE / "fact.svg")


def live_poll(st):
    p = st["poll"]
    total = len(p["java"]) + len(p["python"])
    s = card(800, 190, "POLL: JAVA OR PYTHON FOR A NEW BACKEND?", "",
             label=f"Poll: Java {len(p['java'])}, Python {len(p['python'])}")
    for i, k in enumerate(("java", "python")):
        y = 74 + i * 46
        n = len(p[k])
        s.text(k, 22, y, 3, C["ink"])
        s.add(f'<rect x="170" y="{y - 4}" width="460" height="30" fill="{C["paper2"]}"/>')
        if total and n:
            s.add(f'<rect x="170" y="{y - 4}" width="{f(460 * n / total)}" height="30" fill="{C["orange"]}"/>')
        s.text(f"{n}", 772, y, 3, C["ink"], "end")
    s.text(f"{total} VOTES. VOTING AGAIN CHANGES YOUR VOTE.", 22, 160, 2.2, C["muted"])
    s.save(LIVE / "poll.svg")


def live_activity(st):
    items = st["activity"][:5]
    h = 72 + 30 * max(1, len(items)) + 16
    s = card(800, h, f"LATEST FROM @{OWNER}", st["activity_at"],
             label="Recent GitHub activity: " + "; ".join(a["text"] for a in items))
    y = 72
    for a in items or [{"text": "NOTHING PUBLIC IN THE LAST FEW DAYS", "ago": ""}]:
        s.text(a["text"], 22, y, 2.6, C["ink"], fit=640)
        s.text(a["ago"], 772, y, 2.6, C["muted"], "end")
        y += 30
    s.save(LIVE / "activity.svg")


def ago(ts):
    d = datetime.now(timezone.utc) - datetime.fromisoformat(ts.replace("Z", "+00:00"))
    return f"{d.days}D AGO" if d.days else f"{max(1, d.seconds // 3600)}H AGO"


def fetch_activity(st):
    req = urllib.request.Request(f"https://api.github.com/users/{OWNER}/events/public?per_page=40",
                                 headers={"Accept": "application/vnd.github+json", "User-Agent": "profile-bot"})
    tok = os.environ.get("GH_TOKEN")
    if tok:
        req.add_header("Authorization", f"Bearer {tok}")
    try:
        events = json.load(urllib.request.urlopen(req, timeout=20))
    except Exception as exc:  # keep the last good feed if GitHub is unreachable
        print("activity fetch failed:", exc)
        return
    out = []
    for e in events:
        repo = e["repo"]["name"].split("/", 1)[-1]
        if e["repo"]["name"] == REPO:
            continue
        typ, pl = e["type"], e.get("payload", {})
        if typ == "PushEvent":
            n = pl.get("size") or len(pl.get("commits", [])) or 1
            text = f"PUSHED {n} COMMIT{'S' if n != 1 else ''} TO {repo}"
        elif typ == "PullRequestEvent":
            text = f"{pl.get('action', 'opened')} A PULL REQUEST IN {repo}"
        elif typ == "CreateEvent" and pl.get("ref_type") == "repository":
            text = f"CREATED A NEW REPO: {repo}"
        elif typ == "WatchEvent":
            text = f"STARRED {repo}"
        elif typ == "IssuesEvent":
            text = f"{pl.get('action', 'opened')} AN ISSUE IN {repo}"
        else:
            continue
        if out and out[-1]["text"] == text.upper():
            continue
        out.append({"text": text.upper(), "ago": ago(e["created_at"])})
        if len(out) == 5:
            break
    st["activity"] = out
    st["activity_at"] = datetime.now(timezone.utc).strftime("%d %b").upper()


# ================================================================= README
def issue(title):
    body = "Just hit Submit. The bot plays your move, replies here and closes this issue in under a minute."
    return f"https://github.com/{REPO}/issues/new?title={quote_plus(title)}&body={quote_plus(body)}"


def readme(st):
    v = st["rev"]

    def pic(src, alt, w=800, live=False, mid=False):
        q = f"?v={v}" if live else ""
        a = ' align="absmiddle"' if mid else ""
        return f'<picture><img src="{src}{q}" width="{w}"{a} alt="{escape(alt)}"></picture>'

    def link(url, src, alt, w):
        return f'<a href="{url}"><img src="{src}" width="{w}" alt="{escape(alt)}"></a>'

    q, w, t = st["quiz"], st["word"], st["ttt"]
    word = WORDS[w["i"] % len(WORDS)]["w"]
    keys = []
    for ch in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
        if ch in w["guessed"]:
            state = "hit" if ch in word else "miss"
            keys.append(f'<img src="assets/static/keys/{ch}-{state}.svg" width="58" alt="{ch} used">')
        else:
            keys.append(link(issue(f"word: {w['round']} {ch}"), f"assets/static/keys/{ch}.svg", f"guess {ch}", 58))
    cells = []
    for i, m in enumerate(t["board"]):
        if m:
            cells.append(f'<img src="assets/static/cells/{m.lower()}.svg" width="126" alt="{m}">')
        else:
            cells.append(link(issue(f"ttt: {t['game']} {i + 1}"), f"assets/static/cells/{i + 1}.svg", f"play square {i + 1}", 126))

    out = ['<div align="center">', "",
           pic("assets/static/hero.svg", "Kartik Gaikwad: ASCII portrait on an arcade screen", 1200).replace('width="1200"', 'width="100%"'),
           "", pic("assets/live/fact.svg", "Dev fact of the day", live=True), "",
           pic("assets/live/quiz.svg", "Current quiz question", live=True), "",
           " ".join(link(issue(f"quiz: {q['num']} {k}"), f"assets/static/ans-{k}.svg", f"answer {k.upper()}", 258) for k in "abc"),
           "", pic("assets/live/word.svg", "Word game", live=True), "",
           " ".join(keys[:13]) + "<br>" + " ".join(keys[13:]), "",
           pic("assets/live/ttt.svg", "Tic-tac-toe", live=True), "",
           " ".join(cells[0:3]) + "<br>" + " ".join(cells[3:6]) + "<br>" + " ".join(cells[6:9]), "",
           pic("assets/live/board.svg", "High scores and latest moves", live=True), "",
           pic("assets/static/bughunt.svg", "Bug hunt: open the files to find 3 bugs"), ""]
    for n, (path, _, _, verdict) in enumerate(FILES, 1):
        out.append(f"<details><summary>{pic(f'assets/static/files/{n}.svg', f'open {path}', 766, mid=True)}</summary>"
                   f"{pic(f'assets/static/files/{n}-open.svg', f'{path}: {verdict}', 766)}</details>")
    out += ["", pic("assets/live/poll.svg", "Poll results", live=True), "",
            link(issue("vote: java"), "assets/static/vote-java.svg", "vote Java", 390) + " "
            + link(issue("vote: python"), "assets/static/vote-python.svg", "vote Python", 390), "",
            pic("assets/live/activity.svg", "Latest GitHub activity", live=True), "",
            f'<picture><img src="https://raw.githubusercontent.com/{REPO}/output/snake.svg" width="800" '
            f'alt="A snake eating the contribution graph"></picture>', "",
            " ".join([link("https://www.linkedin.com/in/kartikgaikwad", "assets/static/link-linkedin.svg", "LinkedIn", 196),
                      link("mailto:kartikgaikwad2828@gmail.com", "assets/static/link-email.svg", "Email", 196),
                      link("https://github.com/sid2428/finance2", "assets/static/link-aegis.svg", "AEGIS repo", 196),
                      link("https://github.com/sid2428/Studio__Oak", "assets/static/link-studio-oak.svg", "Studio Oak repo", 196)]),
            "", "</div>", ""]
    (ROOT / "README.md").write_text("\n".join(out), encoding="utf-8")


def render_live(st):
    st["rev"] += 1
    live_quiz(st)
    live_word(st)
    live_ttt(st)
    live_board(st)
    live_fact(st)
    live_poll(st)
    live_activity(st)
    readme(st)


# ================================================================= ENTRY POINTS
def set_output(msg):
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as fh:
            fh.write(f"message<<__MSG__\n{msg}\n__MSG__\n")
    print(msg)


PATTERNS = [
    (re.compile(r"^quiz:\s*(\d+)\s+([abc])$"), lambda st, u, m: play_quiz(st, u, int(m[1]), m[2])),
    (re.compile(r"^word:\s*(\d+)\s+([a-z])$"), lambda st, u, m: play_word(st, u, int(m[1]), m[2].upper())),
    (re.compile(r"^ttt:\s*(\d+)\s+([1-9])$"), lambda st, u, m: play_ttt(st, u, int(m[1]), int(m[2]) - 1)),
    (re.compile(r"^vote:\s*(java|python)$"), lambda st, u, m: play_vote(st, u, m[1])),
]


def handle_event(st):
    ev = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text(encoding="utf-8"))
    title = ev["issue"]["title"].strip().lower()
    user = ev["issue"]["user"]["login"]
    for rx, fn in PATTERNS:
        m = rx.match(title)
        if m:
            return fn(st, user, m)
    return "I couldn't read that move. Use the buttons on the profile and just hit Submit."


def daily(st):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if st["fact"]["day"] != today:
        if st["fact"]["day"]:
            st["fact"]["i"] += 1
        st["fact"]["day"] = today
    fetch_activity(st)


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "render"
    st = read_state()
    if mode == "event":
        set_output(handle_event(st))
    elif mode == "cron":
        daily(st)
    else:
        hero()
        static_buttons()
        bughunt()
        daily(st)
    render_live(st)
    write_state(st)


if __name__ == "__main__":
    main()
