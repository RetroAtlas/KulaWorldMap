# 37. An intake that runs itself

## What and why

A level reaches the community levels by hand: it arrives by email or as an issue on the repository, a person runs the tool's `--add` and commits the record, the ledger and the index, as "Adding a level by hand" in [docs/community.md](../docs/community.md) says, and the site promises that a person looks at every level before it appears.

That step costs little while levels are few and becomes a chore once they are not, and "An intake that runs itself" in [docs/community.md](../docs/community.md) holds the shape of the intake that would add a level itself: the issue form as the write path, an Action in a data repository of its own as the only writer, a pull request a person merges as the publish path, the body kept out of every shell, the tool's gates, and the author's numeric GitHub id as the owner that may update or remove a record.

This item is the question of when to build it and what is to be verified or decided first; the shape itself stays in the doc.

## Sketch

Build it once more than about two levels a month arrive by hand, or once the catalogue is past about twenty entries, and not before: the community the levels would come from is small, a chat room of some seventy, a forum with a handful active in a month and no custom level found anywhere in years, so the hand road may stay the only one.

The build, when it comes, is the section's shape in order: the data repository with its ruleset and its settings, the tool's root flag and its pinned checkout, the tests over the committed catalogue moved, the Action, the form and `ISSUE_FORM` moved, and `INDEX_URL` pointed across origins last, once the data site answers the header.

## Open

- Whether GitHub Pages answers `Access-Control-Allow-Origin: *` on the data site's own origin, which the panel's fetch across origins rests on: this site's origin and the organisation's site both answer it (2026-11-10, `curl -sSI https://kulaworld.retroatlas.org/community/index.json`, which answered 404 with the header while the index was not yet deployed, and the same on `https://retroatlas.org/`, both through Cloudflare), and a plain `github.io` origin was not measured, since this site's `github.io` address redirects to its own domain.
- The repository's settings, read on 2026-11-10 with `gh api repos/RetroAtlas/KulaWorldMap/actions/permissions/workflow`, `gh api repos/RetroAtlas/KulaWorldMap/rules/branches/main`, `gh api repos/RetroAtlas/KulaWorldMap/branches/main/protection` and `gh api repos/RetroAtlas/KulaWorldMap/pages`: the default workflow permissions read, Actions not allowed to create or approve pull requests, no rule and no protection on main, Pages built from the workflow; the organisation's setting, which the repository's setting inherits, needs an administrator to read, and the data repository's settings are set as the section says before anything runs.
- Two issues opened close together both take the id `next` names, so the second pull request conflicts with the first on the ledger and the index; whether the Action runs one job at a time and writes the second again once the first is merged, or the id is taken at the merge, is open.
- The tool's command reads the records under its own repository's root and the face table, the names and the shipped levels' digests from this repository's files, so a flag for the records' root comes before the move, and whether the data repository reads those files from the pinned checkout is decided with it.
- What the Action says back on a refusal: the tool's sentence as a comment on the issue is the sketch, and whether the issue closes with it is open.
- Where the owner's id and login live, the ledger or a table beside it, and the growth rule for whatever holds them.
- How a later issue names the record it updates or takes down: the form takes a link alone, a shared link names no record and a removal carries no level, so the form wants a field for the record's id, or for a link to the published level, read as a number and nothing else.
- Whether a bundle may ever come by the form, which takes a link alone, or stays on the hand road with its file.

## Ruled out

- Usernames and password hashes in a private repository: the page cannot read it without a token, a token in the page is public, a hash store the page can read is crackable offline, "logged in" would be a variable in the visitor's tab, and the write would still need a credential in the page; identity is borrowed from a service with a server, GitHub through its form, or is a key the author holds, never a secret the site holds.
- OAuth from the page: GitHub's flow cannot be completed from a static page, since the token exchange needs the client's secret even with PKCE and the device flow's endpoints send no CORS headers; anonymous gists are gone too.
- A hosted database or function: the free plans looked at pause a project after a week idle, cap it by credits, or have closed or announced their closing, so the catalogue would hang on a service's terms rather than on a repository a person holds.
- A relay: a Nostr relay would need a library the repo may not vendor, and the writer would still be a key or a secret somewhere.
- The Action pushing to main itself, since the merge is where a person looks, and this repository's own Action writing into the data repository, since a write across repositories takes a secret kept.
- Reading the issue's body by its headings, which are no contract, or following an address in it, which would make the writer a fetcher of whatever an issue names.
