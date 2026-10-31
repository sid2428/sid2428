"""Count a vote from an issue titled "vote: <option>" and redraw assets/poll.svg.

Run by .github/workflows/poll.yml. With --render it only redraws the image (no event needed).
"""
import json
import os
import sys
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
POLL = ROOT / "poll" / "poll.json"
OUT = ROOT / "assets" / "poll.svg"

BG, FG, SUB, DIM, FAINT, LINE = "#0A0A0A", "#EDEDED", "#BDBDBD", "#8A8A8A", "#2A2A2A", "#3A3A3A"
FONT = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'DejaVu Sans Mono', monospace"


def render(poll):
    counts = {k: 0 for k in poll["options"]}
    for choice in poll["votes"].values():
        if choice in counts:
            counts[choice] += 1
    total = sum(counts.values())
    w, row = 800, 40
    h = 30 + row * len(counts) + 44
    o = [f'<rect x=".5" y=".5" width="{w - 1}" height="{h - 1}" rx="8" fill="{BG}" stroke="{LINE}"/>']
    for i, (key, label) in enumerate(poll["options"].items()):
        n = counts[key]
        y = 44 + i * row
        filled = round(30 * n / total) if total else 0
        bar = "█" * filled + "░" * (30 - filled)
        pct = f"{round(100 * n / total)}%" if total else "0%"
        o.append(f'<text x="22" y="{y}" font-size="18" fill="{FG}">{escape(label.lower())}</text>')
        o.append(f'<text x="150" y="{y}" font-size="18" fill="{SUB}" xml:space="preserve">{bar}</text>')
        o.append(f'<text x="{w - 22}" y="{y}" font-size="18" fill="{FG}" text-anchor="end">{n}  ({pct})</text>')
    o.append(f'<path d="M12 {h - 40}H{w - 12}" stroke="{FAINT}"/>')
    o.append(f'<text x="22" y="{h - 15}" font-size="15" fill="{DIM}">{total} vote{"s" if total != 1 else ""} so far. '
             f'voting again changes your vote.</text>')
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" '
           f'aria-label="Poll results: ' + ", ".join(f"{poll['options'][k]} {v}" for k, v in counts.items()) + '">'
           f'<style>text{{font-family:{FONT};white-space:pre;}}</style>' + "".join(o) + "</svg>")
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(svg, encoding="utf-8")


def set_output(message):
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as fh:
            fh.write(f"message<<__MSG__\n{message}\n__MSG__\n")
    print(message)


def main():
    poll = json.loads(POLL.read_text(encoding="utf-8"))
    if "--render" in sys.argv:
        render(poll)
        return
    event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text(encoding="utf-8"))
    issue = event["issue"]
    voter = issue["user"]["login"]
    choice = issue["title"].split(":", 1)[1].strip().lower() if ":" in issue["title"] else ""
    if choice not in poll["options"]:
        names = " or ".join(poll["options"].values())
        set_output(f"That option isn't on the ballot. Use the {names} buttons on the profile to vote.")
        return
    previous = poll["votes"].get(voter)
    poll["votes"][voter] = choice
    POLL.write_text(json.dumps(poll, indent=2) + "\n", encoding="utf-8")
    render(poll)
    label = poll["options"][choice]
    if previous and previous != choice:
        set_output(f"Thanks @{voter}! You switched your vote to **{label}**. The tally on the profile is updated.")
    elif previous == choice:
        set_output(f"Thanks @{voter}! You'd already voted **{label}**, so the tally stays the same.")
    else:
        set_output(f"Thanks @{voter}! Your vote for **{label}** is in. The tally on the profile is updated.")


if __name__ == "__main__":
    main()
