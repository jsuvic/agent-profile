# Historical review corpus summary

Capture method: approved read-only GitHub review-thread API; bodies were classified only in memory and then discarded. Raw retention: none.
Snapshot policy: approved historical counts are immutable; current thread state is observation-only.

## Category recurrence and promotion

Occurrence unit: distinct reviewed pull request. Policy source: `packages/compiler/src/change-risk-policy.ts#changeRiskPromotionProjection`.

| Category | Findings | Reviewed changes | Systemic P1 | Threshold | Action | Earned obligations |
| --- | ---: | ---: | --- | --- | --- | --- |
| ownership-atomicity | 38 | 3 | yes | third occurrence | Add a test, lint, validator, or shared helper where practical; the prompt rule alone has proven insufficient. | regression test, scoped rule, mechanical guard or recorded impracticality |
| cross-consumer-integration | 19 | 3 | yes | third occurrence | Add a test, lint, validator, or shared helper where practical; the prompt rule alone has proven insufficient. | regression test, scoped rule, mechanical guard or recorded impracticality |
| parser-version-contract | 7 | 5 | yes | third occurrence | Add a test, lint, validator, or shared helper where practical; the prompt rule alone has proven insufficient. | regression test, scoped rule, mechanical guard or recorded impracticality |
| state-classification | 30 | 4 | yes | third occurrence | Add a test, lint, validator, or shared helper where practical; the prompt rule alone has proven insufficient. | regression test, scoped rule, mechanical guard or recorded impracticality |
| preview-before-write-ordering | 6 | 3 | no | third occurrence | Add a test, lint, validator, or shared helper where practical; the prompt rule alone has proven insufficient. | regression test, scoped rule, mechanical guard or recorded impracticality |
| network-process-boundary | 13 | 3 | no | third occurrence | Add a test, lint, validator, or shared helper where practical; the prompt rule alone has proven insufficient. | regression test, scoped rule, mechanical guard or recorded impracticality |
| secret-output | 3 | 3 | no | third occurrence | Add a test, lint, validator, or shared helper where practical; the prompt rule alone has proven insufficient. | regression test, scoped rule, mechanical guard or recorded impracticality |
| runtime-proof | 4 | 2 | no | second occurrence | Add a reviewer regression case plus a scoped Code Review Rules rule, unless an existing mechanical guard already provides equivalent or stronger protection, in which case cite the guard instead. | regression test, scoped rule |
| published-package-seam | 6 | 1 | yes | first systemic P1 | Immediately add a regression test and a scoped review rule where practical. | regression test, scoped rule |
