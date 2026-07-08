# ADR 0009: Upgrade As A Distinct Insertion-Only Command

## Status

Accepted 2026-07-08 with phase-27/002 spec approval.

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
