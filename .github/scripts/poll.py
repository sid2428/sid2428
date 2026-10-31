"""Count a vote from an issue titled "vote: <option>" and redraw the tally in README.md.

Run by .github/workflows/poll.yml. With --render it only redraws the README (no event needed).
"""
import json
import os
import sys
from pathlib import Path
from urllib.parse import quote_plus

ROOT = Path(__file__).resolve().parents[2]
POLL = ROOT / "poll" / "poll.json"
README = ROOT / "README.md"
START, END = "<!-- POLL:START -->", "<!-- POLL:END -->"
REPO = os.environ.get("GITHUB_REPOSITORY", "sid2428/sid2428")


def vote_link(key):
    body = "Just hit Submit. A bot counts your vote, replies and closes this issue."
    return f"https://github.com/{REPO}/issues/new?title={quote_plus('vote: ' + key)}&body={quote_plus(body)}"


def render(poll):
    counts = {k: 0 for k in poll["options"]}
    for choice in poll["votes"].values():
        if choice in counts:
            counts[choice] += 1
    total = sum(counts.values())
    lines = [START, f"**{poll['question']}**", "", "| Vote | Count | |", "| --- | --: | --- |"]
    for key, label in poll["options"].items():
        n = counts[key]
        filled = round(10 * n / total) if total else 0
        lines.append(f"| [**{label}**]({vote_link(key)}) | {n} | `{'█' * filled}{'░' * (10 - filled)}` |")
    lines += ["", f"<sub>{total} vote{'s' if total != 1 else ''} so far. Click an option, submit the issue, "
                  "and a bot adds your vote. Voting again changes your vote.</sub>", END]
    text = README.read_text(encoding="utf-8")
    head, rest = text.split(START, 1)
    _, tail = rest.split(END, 1)
    README.write_text(head + "\n".join(lines) + tail, encoding="utf-8")


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
        set_output(f"That option isn't on the ballot. Use the {names} links in the README to vote.")
        return
    previous = poll["votes"].get(voter)
    poll["votes"][voter] = choice
    POLL.write_text(json.dumps(poll, indent=2) + "\n", encoding="utf-8")
    render(poll)
    label = poll["options"][choice]
    if previous and previous != choice:
        set_output(f"Thanks @{voter}! You switched your vote to **{label}**. The tally is updated on the profile.")
    elif previous == choice:
        set_output(f"Thanks @{voter}! You'd already voted **{label}**, so the tally stays the same.")
    else:
        set_output(f"Thanks @{voter}! Your vote for **{label}** is in. The tally is updated on the profile.")


if __name__ == "__main__":
    main()
