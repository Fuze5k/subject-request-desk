# Subject Request Desk: documentation

Subject Request Desk helps you handle data subject requests (access, erasure, rectification, portability, restriction, objection) in Jira Cloud and Confluence Cloud. It is a case desk, not a redaction tool: it keeps the deadline, the checks and the proof.

## Where to find it

- **Jira:** Apps > Subject Request Desk (the desk). On a work item, the "Subject Request Desk" panel links the item to a request.
- **Confluence:** Apps > Subject Request Desk is a launcher with a link to the Jira desk. Requests are stored in Jira (app storage is per product); Confluence pages are still searched from the desk.
- **Rovo:** the agent "Privacy request assistant".
- **Settings:** Jira settings > Apps > Subject Request Desk (admins only).

## Handling a request

1. **Open the request.** Pick the type and the law (GDPR, UK GDPR, CCPA, LGPD or a custom number of days), the date it was received and how it arrived. The deadline is calculated from the received date. Optionally link a work item (for example the service portal ticket); deadline warnings are posted there.
2. **Verify identity.** Record the result and how you checked. A waived check needs a reason. Closing a request is blocked until this step is done.
3. **Search.** Type the names, email addresses and aliases (up to 8). The app searches Jira work items and Confluence pages as you, so you see only what you may see. If the person may appear in restricted spaces or projects, ask an admin to search too.
4. **Review the hits.** Open each hit. Mark it relevant or not relevant. For a relevant hit choose the action (provide, erase, redact, correct, withhold, none). A withheld hit needs the exemption you rely on.
5. **Answer.** Pick the outcome (fulfilled, partly fulfilled, refused, withdrawn) and draft the reply. The draft is a template: edit it, send it yourself, then close the request with the date you sent it.
6. **Close.** The closing checks list what is missing. After closing, personal terms and hit titles are removed from the record; the audit record (references, decisions, history) stays and can be shown as Markdown.

## Deadlines

| Law | Time to answer | Extension |
|---|---|---|
| GDPR / UK GDPR | 1 calendar month | up to 2 more months for complex or numerous requests |
| CCPA | 45 days | up to 45 more days |
| LGPD | 15 days | none |
| Custom | the number of days you set | none |

A daily check warns when a request is due soon or late, with a comment on the linked work item (can be switched off in settings). Extending a deadline needs a reason that you give to the requester.

## Rovo agent

"Privacy request assistant" can open a request from a description, search for a subject's data, list hits and your decisions, extend a deadline, draft the reply and tell you what blocks closing. It cannot verify identity or close a request: only a person does that in the desk.

## Sample data

On an empty desk an admin can add fictional sample requests and three sample work items to try the flow.

## Limits

- Search covers Jira work items and Confluence pages. Attachments, comments' full text outside the search index, and other apps are not searched.
- Results are capped per search; use narrower terms if the app says so.
- The app does not erase or redact content itself. It records your decision; you do the change in Jira or Confluence.
- The app is a tool, not legal advice. Check deadlines and exemptions with your counsel.
