---
name: find-subject-data
description: Search Jira work items and Confluence pages for a data subject's names, emails and aliases, then review the hits one by one - relevant or not, and what to do with each (provide, erase, redact, correct, withhold).
allowed-tools: get-request search-subject-data list-hits record-decision
---
# Find and review the subject's data

1. Call `get-request` to see the search terms, the identity status and whether a search was already run.
2. Confirm the terms with the user. Short names match many people: suggest adding an email address or an alias. Then
   call `search-subject-data` (pass `terms` only when they change).
3. Report the counts per product and any search error. Remind the user that the search shows only what they are
   allowed to see in Jira and Confluence.
4. Review the hits with the user in small groups (call `list-hits` with `only: pending`). For each, ask whether it
   is about this person. Propose a decision from the title and container only, never invent what a page says.
5. Record agreed decisions with `record-decision`, several references at a time. Use the action that fits the
   request type: `provide` for access and portability, `erase` or `redact` for erasure, `correct` for rectification,
   `withhold` only with the exemption in the note.
6. When no hit is pending, say so and move to the reply (skill `answer-requester`).

## Tools

- `get-request`: reads the request and its search terms.
- `search-subject-data`: runs the Jira and Confluence search as the user and stores the hit references.
- `list-hits`: lists hits, optionally only the pending ones, for review.
- `record-decision`: saves the agreed decision and action for one or more hits.
