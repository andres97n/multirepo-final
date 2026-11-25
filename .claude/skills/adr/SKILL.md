---
name: adr
description: >
  Create the next numbered Architecture Decision Record (ADR) from the template
  in docs/adr/0000-template.md. Supports superseding an existing ADR by updating
  both files' status and cross-links, without rewriting the original decision text.
---

# ADR skill

Use this skill when the user asks to create a new ADR, or to supersede an existing one.

## Creating a new ADR

1. **Find the next number.** Take the highest `NNNN` in `docs/adr/NNNN-*.md` and
   add 1, zero-padded to 4 digits. Never reuse or fill gaps.

2. **Copy the template.** Copy `docs/adr/0000-template.md` to
   `docs/adr/NNNN-<kebab-title>.md` and keep its header layout:

   ```markdown
   # ADR-NNNN — Title

   - Status: Accepted
   - Date: YYYY-MM-DD (today, from `date`; never invented)
   - Supersedes: — / Superseded-by: —
   ```

   Then fill Context, Decision, Alternatives and Consequences.

3. **Superseding ADR-XXXX** (link both ways, relative links):
   - New ADR: `- Supersedes: [ADR-XXXX](./XXXX-old-title.md) / Superseded-by: —`
   - Old ADR: change only its header lines:
     `- Status: Superseded by [ADR-NNNN](./NNNN-new-title.md)` and
     `- Supersedes: … / Superseded-by: [ADR-NNNN](./NNNN-new-title.md)`.
   - **Never** edit the old ADR's Context/Decision/Alternatives/Consequences text.
     Check with `git diff docs/adr/XXXX-*.md`: only the header lines may change.

4. **Commit** (only if the user asks):
   ```
   docs(adr): add ADR-NNNN — <title> (Mxx)
   ```

## Rules

- ADRs are **immutable** once accepted. Supersede, don't rewrite.
- Always use the template format.
- Cross-link both ways when superseding.
- Never include secrets or sensitive values in ADRs.
