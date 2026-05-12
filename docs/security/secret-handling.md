# Secret Handling

Secrets must never be read, printed, uploaded, or written into generated files.

## Generated Configs

Generated MCP and client configs must reference environment variable names
instead of values.

Allowed:

```json
{
  "env": {
    "API_TOKEN": "$API_TOKEN"
  }
}
```

Not allowed:

```json
{
  "env": {
    "API_TOKEN": "literal-token-value"
  }
}
```

## Init Behavior

The init command may warn about secret files and suggest `.gitignore` changes,
but it must show a diff and ask approval before modifying `.gitignore`.

## Doctor Behavior

Doctor checks should flag:

- literal token-like values in generated or instruction files
- `.env` files that appear unignored
- MCP configs with broad filesystem access
- shell tools configured for automatic approval
- lockfile or generated-file drift without printing file contents
- unverifiable client runtime permission state with manual guidance
- generated artifacts that contain secret-like literals, without echoing the
  matched value
- missing `.gitignore` protection for `.env` and `.env.*`

## Profile Editor Behavior

The local `/profile` editor rejects secret-like literals before diff review and
again before applying a confirmed write. Server-side checks use
`containsSecretLikeLiteral` from `@agent-profile/core` and return only field
paths, never matched values.

The browser may keep the user's typed value in the local input while they edit,
but summaries, validation messages, route errors, and logs must not echo a
matched secret-like literal. Raw YAML previews continue to use redaction before
shipping preview text to the page.
