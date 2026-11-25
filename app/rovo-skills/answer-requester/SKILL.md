---
name: answer-requester
description: Check what still stops a data subject request from being closed and draft the reply to the requester - fulfilled, partly fulfilled, refused or withdrawn - without repeating any personal data.
allowed-tools: get-request list-hits check-closure draft-response
---
# Answer the requester

1. Call `check-closure` with the outcome the user expects (fulfilled by default). Quote every blocking finding
   with its fix. Do not draft a "fulfilled" reply while identity is unverified or hits are unreviewed.
2. For a partial or refused outcome, agree the reason and the legal basis with the user first. Never invent an
   exemption.
3. Call `draft-response` with the outcome and the reason. Show the draft. It states what was searched and done by
   counts and the complaint wording for the law, and it repeats no personal data. Offer wording changes; the user
   edits the final text in the panel.
4. Tell the user what is left: edit the draft, send it from their own mail or the service portal, then press
   **Close request** in the panel with the date it was sent. Warn if the deadline is within a week or has passed.

## Tools

- `get-request`: reads the request state and law before drafting.
- `list-hits`: lists the hits and the decisions, to check nothing is pending.
- `check-closure`: lists what still blocks closing, each with its fix.
- `draft-response`: saves the reply draft on the request; the user edits and sends it.
