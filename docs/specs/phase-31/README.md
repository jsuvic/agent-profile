# Phase 31: Permission Posture Lifecycle

Phase 31 adds a state-aware, client-capability-accurate lifecycle for choosing,
inspecting, reconciling, activating, and validating agent permission posture.

- Spec: [`001-permission-posture-lifecycle.md`](001-permission-posture-lifecycle.md)
- Issue briefs: [`issues/`](issues/)

The spec and governing ADR amendments were approved on 2026-07-14. A same-day
field-evidence amendment requires exact local permission-source attribution,
consequence guidance, and explicit cross-client scope. I1-I7 provide the
resolver, mappings, inspection, configure, activation, Doctor, and dispatcher
slices. I8 assembles their published journey and records the final evidence in
the [`spec-to-test matrix`](002-final-spec-to-test-matrix.md).
