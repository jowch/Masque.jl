#!/usr/bin/env python3
"""Light CI flake monitor: comment on issue #99, do not fail the gate.

Two jobs, no hosted service:

- event: after a CI / Documentation run completes, post at most one comment if
  an advisory kind-sweep job failed/timed out, or a required job failed then
  passed on the same SHA (including a re-run attempt).
- digest: once a week, edit-or-create a single rolling 7-day count comment so
  greens are recorded without a comment per run.

Kind sweep is `continue-on-error` in CI.yml; its job conclusion is still
`failure` in the Actions API even when the workflow is green. That is the #99
signal. Required-job flakes are labeled separately so they do not get mixed
into the WebGL scatter hover-leave tracker.

Env: GH_TOKEN (required), FLAKE_REPO (default jowch/Masque.jl), FLAKE_ISSUE
(default 99), DRY_RUN=1 to print and not post. Mode comes from EVENT_NAME /
DISPATCH_MODE / argv.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

REPO = os.environ.get("FLAKE_REPO") or os.environ.get("GITHUB_REPOSITORY") or "jowch/Masque.jl"
ISSUE = os.environ.get("FLAKE_ISSUE", "99")
DRY_RUN = os.environ.get("DRY_RUN", "0") == "1"
TOKEN = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN") or ""
if not TOKEN:
    try:
        TOKEN = subprocess.check_output(["gh", "auth", "token"], text=True, timeout=10).strip()
    except (subprocess.SubprocessError, FileNotFoundError):
        TOKEN = ""

API = "https://api.github.com"
MARKER_RUN = "<!-- masque-flake-monitor run={run_id} -->"
MARKER_DIGEST = "<!-- masque-flake-monitor digest -->"
SNIPPET_KEYS = (
    "KIND SWEEP FAIL",
    "cleared instantly",
    "hostRemount",
    "wgl churn",
    "hover started fading",
    "overlay remounted",
    "fade too short",
)
ADVISORY_PREFIX = "Kind sweep"


def is_advisory(name: str) -> bool:
    return name.startswith(ADVISORY_PREFIX)


def gh_api(method: str, path: str, body: dict | None = None, params: dict | None = None):
    url = API + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    if TOKEN:
        req.add_header("Authorization", f"Bearer {TOKEN}")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")
        raise SystemExit(f"GitHub API {method} {path} failed: {e.code} {detail}") from e


def gh_api_paged(path: str, params: dict | None = None) -> list:
    params = dict(params or {})
    params.setdefault("per_page", 100)
    page = 1
    out: list = []
    while True:
        params["page"] = page
        chunk = gh_api("GET", path, params=params)
        if not chunk:
            break
        if isinstance(chunk, dict):
            # e.g. {workflow_runs: [...]} / {jobs: [...]}
            items = None
            for key in ("workflow_runs", "jobs", "check_runs"):
                if key in chunk:
                    items = chunk[key]
                    break
            if items is None:
                raise SystemExit(f"unexpected paged payload keys: {list(chunk)}")
        else:
            items = chunk
        out.extend(items)
        if len(items) < params["per_page"]:
            break
        page += 1
        if page > 20:
            break
    return out


def gh_cli(*args: str, timeout: int = 90) -> str:
    env = os.environ.copy()
    if TOKEN:
        env["GH_TOKEN"] = TOKEN
    proc = subprocess.run(
        ["gh", *args],
        check=False,
        capture_output=True,
        text=True,
        timeout=timeout,
        env=env,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip() or f"gh {' '.join(args)} failed")
    return proc.stdout


def short_sha(sha: str) -> str:
    return sha[:7] if sha else "?"


def run_jobs(run_id: int, attempt: int | None = None) -> list:
    path = f"/repos/{REPO}/actions/runs/{run_id}/jobs"
    if attempt and attempt > 1:
        path = f"/repos/{REPO}/actions/runs/{run_id}/attempts/{attempt}/jobs"
    return gh_api_paged(path)


def get_run(run_id: int) -> dict:
    return gh_api("GET", f"/repos/{REPO}/actions/runs/{run_id}")


def issue_comments() -> list:
    return gh_api_paged(f"/repos/{REPO}/issues/{ISSUE}/comments")


def already_commented(marker: str, comments: list | None = None) -> bool:
    comments = comments if comments is not None else issue_comments()
    return any(marker in (c.get("body") or "") for c in comments)


def post_issue_comment(body: str) -> None:
    if DRY_RUN:
        print("--- DRY_RUN comment (not posted) ---")
        print(body)
        print("--- end ---")
        return
    gh_api("POST", f"/repos/{REPO}/issues/{ISSUE}/comments", body={"body": body})
    print(f"posted comment on #{ISSUE}")


def upsert_digest(body: str, comments: list) -> None:
    existing = [c for c in comments if MARKER_DIGEST in (c.get("body") or "")]
    if DRY_RUN:
        action = "update" if existing else "create"
        print(f"--- DRY_RUN digest ({action}, not posted) ---")
        print(body)
        print("--- end ---")
        return
    if existing:
        cid = existing[-1]["id"]
        gh_api("PATCH", f"/repos/{REPO}/issues/comments/{cid}", body={"body": body})
        print(f"updated digest comment {cid} on #{ISSUE}")
    else:
        post_issue_comment(body)


def extract_snippet(job_id: int) -> str:
    try:
        log = gh_cli("run", "view", "--job", str(job_id), "--log-failed", timeout=90)
    except (RuntimeError, subprocess.TimeoutExpired):
        return "(failed-job logs unavailable)"
    lines = log.splitlines()
    idx = next((i for i, line in enumerate(lines) if any(k in line for k in SNIPPET_KEYS)), None)
    if idx is None:
        chunk = lines[-20:]
    else:
        chunk = []
        for line in lines[max(0, idx - 1) :]:
            rest = line.split("Z ", 1)[-1]
            if chunk and (rest.startswith("##[") or rest.startswith("POLISH VERIFY") or rest.startswith("KEYBOARD A11Y")):
                break
            chunk.append(line)
            if len(chunk) >= 8:
                break
    cleaned = []
    for line in chunk:
        # gh --log-failed prefix: "job<TAB>step<TAB>timestampZ rest"
        parts = line.split("Z ", 1)
        cleaned.append(parts[-1] if len(parts) == 2 else line)
    text = "\n".join(cleaned).strip()
    if len(text) > 3500:
        text = text[:3500] + "\n…"
    return text or "(no matching failure line in logs)"


def classify_kind(job_name: str, snippet: str, conclusion: str) -> str:
    if "webgl" in job_name.lower():
        if "cleared instantly (no remount fade)" in snippet:
            return "advisory-webgl-#99"
        return "advisory-webgl"
    if "cairo" in job_name.lower():
        return "advisory-cairo"
    if conclusion == "cancelled":
        return "advisory-timeout"
    return "advisory"


def fmt_run(run: dict) -> str:
    sha = run.get("head_sha") or ""
    raw_title = run.get("display_title") or (run.get("head_commit") or {}).get("message") or ""
    title = raw_title.splitlines()[0] if raw_title else ""
    event = run.get("event") or "?"
    branch = run.get("head_branch") or "?"
    url = run.get("html_url") or ""
    attempt = run.get("run_attempt") or 1
    return (
        f"- **run:** [{run.get('id')}]({url}) (attempt {attempt}, `{event}` on `{branch}`)\n"
        f"- **sha:** [`{short_sha(sha)}`](https://github.com/{REPO}/commit/{sha})\n"
        f"- **title:** {title}"
    )


def advisory_findings(run: dict, jobs: list) -> list[dict]:
    out = []
    for job in jobs:
        name = job.get("name") or ""
        if not is_advisory(name):
            continue
        conclusion = job.get("conclusion")
        if conclusion not in ("failure", "cancelled", "timed_out"):
            continue
        snippet = extract_snippet(job["id"]) if conclusion == "failure" else f"(job conclusion: {conclusion})"
        out.append(
            {
                "class": "advisory",
                "kind": classify_kind(name, snippet, conclusion),
                "job": name,
                "job_id": job["id"],
                "job_url": job.get("html_url") or job.get("url") or "",
                "conclusion": conclusion,
                "snippet": snippet,
            }
        )
    return out


def jobs_by_name(jobs: list) -> dict[str, dict]:
    return {j["name"]: j for j in jobs if j.get("name")}


def required_retry_findings(run: dict, jobs: list) -> list[dict]:
    """Required job failed on an earlier attempt / same-SHA run, passed here."""
    passed = {
        name: job
        for name, job in jobs_by_name(jobs).items()
        if not is_advisory(name) and job.get("conclusion") == "success"
    }
    if not passed:
        return []

    earlier: list[tuple[str, dict]] = []
    attempt = int(run.get("run_attempt") or 1)
    if attempt > 1:
        try:
            prev = run_jobs(run["id"], attempt - 1)
        except SystemExit:
            prev = []
        earlier.append((f"attempt {attempt - 1} of the same run", jobs_by_name(prev)))

    sha = run.get("head_sha")
    created = run.get("created_at") or ""
    if sha:
        siblings = gh_api_paged(
            f"/repos/{REPO}/actions/runs",
            params={"head_sha": sha},
        )
        for sib in siblings:
            if sib.get("id") == run.get("id"):
                continue
            if sib.get("name") != run.get("name"):
                continue
            if sib.get("conclusion") == "cancelled" or sib.get("status") != "completed":
                continue
            if (sib.get("created_at") or "") >= created:
                continue
            try:
                sib_jobs = run_jobs(sib["id"], sib.get("run_attempt"))
            except SystemExit:
                continue
            earlier.append((f"run [{sib['id']}]({sib.get('html_url')})", jobs_by_name(sib_jobs)))

    findings = []
    seen = set()
    for name, job in passed.items():
        for label, prev_map in earlier:
            prev_job = prev_map.get(name)
            if not prev_job:
                continue
            if prev_job.get("conclusion") not in ("failure", "timed_out"):
                continue
            key = (name, prev_job.get("id"))
            if key in seen:
                continue
            seen.add(key)
            findings.append(
                {
                    "class": "required",
                    "kind": "required-fail-then-pass",
                    "job": name,
                    "job_id": job.get("id"),
                    "job_url": job.get("html_url") or job.get("url") or "",
                    "conclusion": "success",
                    "earlier": label,
                    "earlier_conclusion": prev_job.get("conclusion"),
                    "snippet": "",
                }
            )
    return findings


def advisory_retry_green(run: dict, jobs: list) -> list[dict]:
    """Kind-sweep failed earlier on this SHA and passed here — the #99 re-run-goes-green pattern."""
    passed = {
        name: job
        for name, job in jobs_by_name(jobs).items()
        if is_advisory(name) and job.get("conclusion") == "success"
    }
    if not passed:
        return []
    attempt = int(run.get("run_attempt") or 1)
    earlier: list[tuple[str, dict]] = []
    if attempt > 1:
        try:
            prev = run_jobs(run["id"], attempt - 1)
        except SystemExit:
            prev = []
        earlier.append((f"attempt {attempt - 1} of the same run", jobs_by_name(prev)))
    sha = run.get("head_sha")
    created = run.get("created_at") or ""
    if sha:
        siblings = gh_api_paged(f"/repos/{REPO}/actions/runs", params={"head_sha": sha})
        for sib in siblings:
            if sib.get("id") == run.get("id") or sib.get("name") != run.get("name"):
                continue
            if sib.get("conclusion") == "cancelled" or sib.get("status") != "completed":
                continue
            if (sib.get("created_at") or "") >= created:
                continue
            try:
                sib_jobs = run_jobs(sib["id"], sib.get("run_attempt"))
            except SystemExit:
                continue
            earlier.append((f"run [{sib['id']}]({sib.get('html_url')})", jobs_by_name(sib_jobs)))
    findings = []
    for name, job in passed.items():
        for label, prev_map in earlier:
            prev_job = prev_map.get(name)
            if not prev_job or prev_job.get("conclusion") not in ("failure", "timed_out", "cancelled"):
                continue
            findings.append(
                {
                    "class": "advisory-retry",
                    "kind": "advisory-fail-then-pass",
                    "job": name,
                    "job_id": job.get("id"),
                    "job_url": job.get("html_url") or job.get("url") or "",
                    "conclusion": "success",
                    "earlier": label,
                    "earlier_conclusion": prev_job.get("conclusion"),
                    "snippet": "",
                }
            )
            break
    return findings


def render_event_comment(run: dict, findings: list[dict]) -> str:
    marker = MARKER_RUN.format(run_id=run["id"])
    advisory = [f for f in findings if f["class"] in ("advisory", "advisory-retry")]
    required = [f for f in findings if f["class"] == "required"]
    parts = [marker, ""]
    if advisory:
        parts.append("## Advisory kind-sweep")
        parts.append("")
        parts.append("These jobs are `continue-on-error` and do **not** fail the required CI gate. WebGL `cleared instantly (no remount fade)` is the #99 flake; anything else (including cairo) is recorded here so it is not mistaken for that flake.")
        parts.append("")
        parts.append(fmt_run(run))
        parts.append("")
        for f in advisory:
            parts.append(f"### `{f['job']}` — `{f['kind']}` ({f['conclusion']})")
            parts.append("")
            parts.append(f"- **logs:** [{f['job_id']}]({f['job_url']})")
            if f.get("earlier"):
                parts.append(f"- **earlier failure:** {f['earlier']} ({f.get('earlier_conclusion')}) then passed on this SHA — the no-change re-run-goes-green pattern.")
            if f.get("snippet"):
                parts.append("")
                parts.append("```")
                parts.append(f["snippet"])
                parts.append("```")
            parts.append("")
        parts.append("What to capture on a WebGL red (post-#129): the mutation sequence, `wglChurnCount` / `lastWglChurnAt`, and whether a `hostRemount` entry fired. Artifact: `kind-sweep-webgl` on the run above.")
        parts.append("")
    if required:
        parts.append("## Required-job flake (not kind-sweep)")
        parts.append("")
        parts.append("A **required** check failed and then passed on the same SHA. This is not the advisory kind-sweep flake in this issue; it is recorded here so required flakes have a place to land without a second tracker.")
        parts.append("")
        parts.append(fmt_run(run))
        parts.append("")
        for f in required:
            parts.append(f"- `{f['job']}` failed ({f.get('earlier_conclusion')}) on {f.get('earlier')} then passed ([logs]({f['job_url']})).")
        parts.append("")
    parts.append(f"_Posted by [CI flake monitor](https://github.com/{REPO}/blob/main/.github/workflows/ci-flake-monitor.yml). One comment per run; duplicates are skipped._")
    return "\n".join(parts).rstrip() + "\n"


def process_event(run_id: int) -> int:
    run = get_run(run_id)
    status = run.get("status")
    conclusion = run.get("conclusion")
    name = run.get("name")
    print(f"inspecting run {run_id} ({name}) status={status} conclusion={conclusion} attempt={run.get('run_attempt')}")
    if status != "completed":
        print("skip: run not completed")
        return 0
    if conclusion == "cancelled":
        print("skip: superseded/cancelled workflow run")
        return 0
    if name not in ("CI", "Documentation"):
        print(f"skip: unwatched workflow {name!r}")
        return 0
    marker = MARKER_RUN.format(run_id=run_id)
    comments = issue_comments()
    if already_commented(marker, comments):
        print(f"skip: already commented for run {run_id}")
        return 0
    jobs = run_jobs(run_id, run.get("run_attempt"))
    findings = advisory_findings(run, jobs) + advisory_retry_green(run, jobs) + required_retry_findings(run, jobs)
    if not findings:
        print("no flake findings")
        return 0
    post_issue_comment(render_event_comment(run, findings))
    return 0


def iso_parse(s: str) -> dt.datetime:
    return dt.datetime.fromisoformat(s.replace("Z", "+00:00"))


def process_digest() -> int:
    since = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=7)
    since_s = since.strftime("%Y-%m-%d")
    # gh --created is the cheap index; then jobs per run for kind-sweep conclusions.
    try:
        listed = json.loads(
            gh_cli(
                "run",
                "list",
                "--workflow",
                "CI.yml",
                "--limit",
                "200",
                "--created",
                f">={since_s}",
                "--json",
                "databaseId,conclusion,status,createdAt,headSha,event,displayTitle,attempt,url",
            )
        )
    except RuntimeError as e:
        print(f"digest: gh run list failed: {e}", file=sys.stderr)
        listed = []

    webgl = {"success": 0, "failure": 0, "cancelled": 0, "other": 0}
    cairo = {"success": 0, "failure": 0, "cancelled": 0, "other": 0}
    required_flakes = 0
    sightings = []

    for item in listed:
        if item.get("status") != "completed":
            continue
        if item.get("conclusion") == "cancelled":
            continue
        run_id = item["databaseId"]
        try:
            jobs = run_jobs(run_id, item.get("attempt"))
        except SystemExit as e:
            print(f"digest: skip run {run_id}: {e}", file=sys.stderr)
            continue
        by = jobs_by_name(jobs)
        for label, bucket in (("Kind sweep (webgl)", webgl), ("Kind sweep (cairo)", cairo)):
            job = by.get(label)
            if not job:
                continue
            c = job.get("conclusion") or "other"
            if c not in bucket:
                bucket["other"] += 1
            else:
                bucket[c] += 1
            if c in ("failure", "timed_out"):
                sightings.append((label, run_id, item.get("url"), item.get("headSha", ""), c))
        # Count required fail-then-pass cheaply: attempt > 1 with a required job success
        # whose previous attempt failed. Full sibling-SHA scan is the event path.
        attempt = int(item.get("attempt") or 1)
        if attempt > 1:
            try:
                run = get_run(run_id)
                required_flakes += len(required_retry_findings(run, jobs))
            except SystemExit:
                pass

    comments = issue_comments()
    now = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines = [
        MARKER_DIGEST,
        "",
        "## Flake-monitor digest (rolling 7 days)",
        "",
        f"Updated {now}. Counts are job conclusions on the `CI` workflow, excluding superseded (`cancelled`) runs. Kind-sweep is advisory (`continue-on-error`); required-job flakes are fail-then-pass on the same SHA / retry.",
        "",
        "| class | success | failure | cancelled | other |",
        "|---|---:|---:|---:|---:|",
        f"| advisory `Kind sweep (webgl)` — the #99 flake | {webgl['success']} | {webgl['failure']} | {webgl['cancelled']} | {webgl['other']} |",
        f"| advisory `Kind sweep (cairo)` | {cairo['success']} | {cairo['failure']} | {cairo['cancelled']} | {cairo['other']} |",
        f"| required-job flakes (this window, retries only) |  | {required_flakes} |  |  |",
        "",
    ]
    if sightings:
        lines.append("Advisory failures in this window:")
        lines.append("")
        for label, run_id, url, sha, conclusion in sightings:
            lines.append(f"- `{label}` {conclusion} on [`{short_sha(sha)}`](https://github.com/{REPO}/commit/{sha}) — [run {run_id}]({url})")
        lines.append("")
    else:
        lines.append("No advisory kind-sweep failures in this window.")
        lines.append("")
    lines.append("Event-driven sightings (one comment per run, not one per green) are the comments above/below this digest that start with `## Advisory kind-sweep` or `## Required-job flake`. A clean week still updates this comment so the denominator is visible.")
    lines.append("")
    lines.append(f"_Updated by [CI flake monitor](https://github.com/{REPO}/blob/main/.github/workflows/ci-flake-monitor.yml)._")
    upsert_digest("\n".join(lines).rstrip() + "\n", comments)
    return 0


def resolve_mode() -> tuple[str, int | None]:
    if len(sys.argv) >= 2:
        mode = sys.argv[1]
        run_id = int(sys.argv[2]) if len(sys.argv) >= 3 and sys.argv[2] else None
        return mode, run_id
    event_name = os.environ.get("EVENT_NAME") or os.environ.get("GITHUB_EVENT_NAME") or ""
    dispatch_mode = os.environ.get("DISPATCH_MODE") or ""
    if event_name == "workflow_run":
        run_id = os.environ.get("WORKFLOW_RUN_ID") or ""
        return "event", int(run_id) if run_id else None
    if event_name == "schedule":
        return "digest", None
    if event_name == "workflow_dispatch":
        mode = dispatch_mode or "digest"
        raw = os.environ.get("DISPATCH_RUN_ID") or ""
        return mode, int(raw) if raw.strip() else None
    return "digest", None


def main() -> int:
    if not TOKEN and not DRY_RUN:
        print("GH_TOKEN / GITHUB_TOKEN required unless DRY_RUN=1", file=sys.stderr)
        return 2
    mode, run_id = resolve_mode()
    print(f"mode={mode} run_id={run_id} repo={REPO} issue=#{ISSUE} dry_run={int(DRY_RUN)}")
    if mode == "event":
        if not run_id:
            print("event mode needs a run id", file=sys.stderr)
            return 2
        return process_event(run_id)
    if mode == "digest":
        return process_digest()
    print(f"unknown mode {mode!r}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except subprocess.TimeoutExpired as e:
        print(f"timeout: {e}", file=sys.stderr)
        raise SystemExit(1)
