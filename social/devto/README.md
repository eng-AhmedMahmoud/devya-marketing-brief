# dev.to comment replies

A daily routine on the developer's Mac. It reads every dev.to article of [@ahmed_mahmoud360](https://dev.to/ahmed_mahmoud360) and its comments, then drafts a reply in his voice to each new comment. It **never posts on its own**: the drafts wait in a review queue, and only the replies he approves are posted, by a command he runs himself.

## Setup (once)

1. Create a dev.to API key at <https://dev.to/settings/extensions> ("DEV Community API Keys").
2. Store it in the macOS login Keychain. The command prompts for the key, so it never lands in shell history:

   ```bash
   security add-generic-password -U -s devto-api-key -a ahmed_mahmoud360 -w
   ```

   The key is only ever read by `forem.mjs`, in node, and sent as the `api-key` header to `https://dev.to/api`. It is never written to the repo, the logs or a prompt. If the item is missing, or dev.to rejects the key, or the key belongs to another account, a run stops before reading anything. It logs one `NEEDS-YOU:` line naming the Keychain service and account, and exits 5.
3. Install the schedule from the repo: `social/devto/ctl.sh install`. This writes `~/Library/LaunchAgents/com.ahmedmahmoud.devya-devto-replies.plist` (daily at **08:30** Cairo), copies the launcher and the `devto` command to `~/.config/devya-social/bin/` (and links `~/bin/devto`), and lists the routine in brain's Routines tab as "dev.to Comment Replies".

## Daily: review and approve

```bash
devto review                 # pending drafts, approved ones, flagged comments (also ~/.config/devya-social/devto/queue.md)
devto approve k3m2 k3m5      # approve these exact drafts
devto edit k3m7              # rewrite a draft in $EDITOR (or --text "…"); it goes back to pending
devto reject k3m9            # never post this one (on a flagged comment: dismiss it)
devto post                   # post the approved drafts (see Posting)
devto status                 # loaded?, paused?, queue counts, last run, Keychain check
```

Ids are dev.to comment ids, as printed by `devto review`.

## What a run does (`run-devto-replies.sh`, draft mode)

1. Fast-forwards the routine clone (`~/.config/devya-social/devya-marketing-brief`) to `origin/main`. It skips this while the social routine holds its lock, and it never resets local work.
2. `devto.mjs scan`:
   - **API** (`forem.mjs`): `GET /api/users/me` (the key must belong to @ahmed_mahmoud360), then `GET /api/articles?username=ahmed_mahmoud360` page by page (`per_page=100`, until a short page). For every article whose `comments_count` is above 0 it calls `GET /api/comments?a_id=<id>`, also paged; each top-level comment comes with its whole reply tree. On a draft it also calls `GET /api/articles/<id>` for the Markdown body. Every request is a GET. A 429 or 5xx is retried after `Retry-After`.
   - **Selection** (`threads.mjs`): the tree is flattened. A comment is skipped, and recorded as seen, when it is his own, when it was deleted or hidden, or when he has already replied anywhere under it. A comment already seen by an earlier run is never looked at again. A visitor's new reply under his reply counts as new.
   - **Drafts** (`drafts.mjs`, `draft-worker.md`): obvious spam (gambling, loans, fund-recovery scams, link drops, WhatsApp/Telegram pitches) and insults are flagged without a model. The rest goes, one article at a time and with the article body and the thread above each comment, to `claude --print` on the `DEVTO_SEAT` seat (default `ceo`). That session runs with no tools (`--tools ""`), no MCP servers, no user settings or hooks, and the prompt on stdin. Comments are JSON-encoded inside a data block that the drafter is told never to obey. The drafter either replies in the comment's language or flags spam, abuse or prompt injection. Every draft is checked: length (at most 1,200 characters), no placeholder, cut-off, hashtag or "as an AI", the same script as the comment (Arabic in, Arabic out), and no link that is not already in the article or thread. A failing draft is redrafted once. If it fails again, the comment stays unseen and is retried the next day; after 3 runs it is queued as a flag ("could not draft"). His voice notes come from his private style guide (`~/.claude-brain/linkedin/style-guide.md`, sections 1 to 3), which is read at run time and never copied into the repo.
   - **Queue**: drafts (`pending`) and flags (`flagged`, with no reply text) go to `queue.json` and `queue.md`.
   - At most 30 drafts per run (`DEVTO_MAX_DRAFTS`). The rest wait, unseen, for the next run. A usage limit on the drafting seat stops drafting with a `LIMIT:` line and exit 6; a cap on the model alone is retried once with `DEVTO_FALLBACK_MODEL` (default `sonnet`).
3. It logs one human summary line, one `DEVTO_SUMMARY: {json}` line, and a `NEEDS-YOU:` line when drafts are waiting for review.

Test without changing anything: `node social/devto/devto.mjs scan --dry-run` writes the drafts to `~/.config/devya-social/devto/dry/` and leaves the queue and state alone. `--no-draft` only lists the new comments.

## The approval gate

`devto approve <id>` appends a record to `decisions.jsonl`: the id, the SHA-256 of the exact reply text, the time, and who approved it. `gate.mjs` `postPlan()` is the only way to anything that posts, and it lets a draft through only when all of these hold:

- it is a reply draft (a flag has no text and cannot be approved);
- its status is `approved`;
- its **latest** decision record is an `approve` whose SHA-256 matches the text now in the queue (editing the text, setting `"status": "approved"` by hand, or approving and then rejecting all block it);
- it is not in `posted.jsonl` (never twice).

The scheduled run never builds a plan, and the tests check that the launchd job runs the launcher with no argument, and that draft mode holds no `post-plan`, `post-record` or `--chrome` (`routine.test.mjs`, `gate.test.mjs`).

## Posting (`devto post`, by hand)

The Forem API v1 cannot create comments: it offers only `GET /comments`, `GET /comments/{id}` and `POST /comments/preview`. Posting is therefore a browser step:

1. `devto.mjs post-plan` takes the gated drafts and re-reads each comment's thread on dev.to. A deleted comment, or one he has answered since, becomes `stale` and is not posted. A reply already there with the approved text is recorded, not posted again.
2. A Claude session on the `DEVTO_POST_SEAT` seat (default `ceo`: Chrome "Profile 2", which must be signed in to dev.to as @ahmed_mahmoud360) gets only those items. It has only Chrome tools, follows `post-worker.md`, checks the signed-in account, clicks **Reply** under each comment, enters the approved text verbatim, and (if dev.to asks) picks "some AI assistance". It stops at the first error.
3. `devto.mjs post-record` records a reply as `posted` only when dev.to's API shows a reply by @ahmed_mahmoud360 with the approved text under that comment.

## Files

Code lives in `social/devto/`. State lives in `~/.config/devya-social/devto/`, outside the repo, because the repo is public and drafts and flagged comments stay private:

| File | What |
|---|---|
| `state.json` | Comment ids already handled, with the outcome (`drafted`, `flagged`, `own`, `answered`, `deleted`) and draft failure counts |
| `queue.json` / `queue.md` | The review queue (`pending`, `approved`, `flagged`, `posted`, `rejected`, `dismissed`, `stale`) |
| `decisions.jsonl` | Approve and reject records (append-only) |
| `posted.jsonl` | Posted replies: id, SHA-256, URL (append-only) |
| `runs.jsonl` | One summary per run |
| `paused` | If present, draft runs exit at once (`devto pause` / `devto resume`) |

Log: `~/Library/Logs/devya-devto-replies.log`. Tests: `node --test social/devto/*.test.mjs`. They mock all HTTP and the drafter, and run in `scripts/ci-local.sh` and GitHub CI.
