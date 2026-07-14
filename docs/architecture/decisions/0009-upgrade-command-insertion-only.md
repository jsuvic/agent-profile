# ADR 0009: Upgrade As A Distinct Insertion-Only Command

## Status

Accepted 2026-07-08 with phase-27/002 spec approval.

Amended 2026-07-14 with phase-32/001 approval: insertion-only ownership stands,
while interactive adopt-all becomes preselection into an editable explained
review rather than final acceptance.

## Context

Existing profiles cannot reach capabilities added after their creation
without hand-editing `ai-profile.yaml`. Two questions were grilled: where
the upgrade flow lives, and how it may edit the profile - the first flow
ever allowed to touch the user-owned intent file.

## Decision

Upgrade is a new top-level `agent-profile upgrade` command; `init` keeps
its phase-12/007 contract ("init does not edit existing profiles")
untouched, gaining only an interactive-TTY pointer line. Upgrade edits
`ai-profile.yaml` exclusively through targeted, comment-preserving
insertions (via the `yaml` Document API): new list entries and new
booleans only - never modifying or removing existing values, and never
re-rendering the file. When safe insertion is impossible, upgrade refuses
and prints the exact manual line to add.

## Rationale

An init-embedded upgrade would rewrite a binding contract that tests and
goldens encode, and would change what `init` means in every existing
script. Re-rendering would destroy user comments and formatting in the
one artifact that is explicitly the user's to annotate - contradicting
the ownership model phase-27/001 hardened. A refused insertion costs the
user seconds; a clobbered comment costs trust in the ownership rule.
Alternatives considered: upgrade branch inside init (rejected: contract
break); full canonical re-render (rejected: ownership violation).

## Consequences

Positive:

- Each command keeps one meaning: init creates, upgrade evolves, compile
  refreshes.
- Upgrade diffs are minimal and reviewable (inserted lines only).
- The insertion-only rule makes a mutation sentinel testable.

Negative:

- A fourth top-level command until the phase-27/004 dispatcher absorbs
  discoverability.
- Insertion-edge-case refusals push occasional users to manual edits.

## 2026-07-14 Phase 32 Accepted Amendment

The insertion-only decision stands. Interactive `Adopt all available` and
`Customize` now feed one editable adoption review. Adopt-all preselects every
offered capability; it does not accept or write them. The review explains each
current/proposed value, enabled/disabled consequence, affected and unaffected
clients, generated artifact families, prerequisites, and material tradeoffs.

After editing, the user sees the exact insertion preview and receives a
separate default-No profile-write confirmation. Compile remains a different
mutation with a different confirmation. The scripted
`--write --adopt-recommended` spelling and behavior remain the explicit fast
path.

This amendment preserves targeted comment-safe insertion while correcting the
interactive consent model: choosing a strategy narrows the review; it is not
itself informed acceptance of every setting.
