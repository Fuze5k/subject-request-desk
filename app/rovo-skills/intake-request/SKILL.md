---
name: intake-request
description: Open a data subject request (access, erasure, rectification, portability, restriction, objection), start its deadline clock, and extend the deadline where the law allows it.
allowed-tools: list-requests get-request create-request extend-deadline
---
# Intake a data subject request

Use this when a request has arrived (by email, a service portal ticket, a letter) or the user asks what is due.

1. If the user asks what is open or due, call `list-requests` and answer in order of deadline: id, type, days
   left, next step. Say plainly which ones are due soon or late.
2. To open a request, agree these with the user, one short question for whatever is missing:
   - who it is about (a name or a reference) and the search terms (names, email addresses, aliases);
   - the type (access, erasure, rectification, portability, restriction, objection);
   - the law (gdpr, uk-gdpr, ccpa, lgpd, custom) and the date it was received (the clock starts that day);
   - how it arrived, and the linked work item if there is one.
3. Call `create-request` with the confirmed values. Tell the user the deadline the desk computed and that identity
   must be verified next, by a person, in the panel.
4. If the request is complex or numerous and the law allows more time, call `extend-deadline` with the reason that
   will be given to the requester, before the deadline passes. Say which law's extension applies from the tool result.

## Tools

- `list-requests`: lists open requests with days left and next step; used to answer "what is due".
- `get-request`: reads one request's state to confirm what exists before opening a duplicate.
- `create-request`: opens the request and starts the clock; used once the user has confirmed the details.
- `extend-deadline`: extends the deadline once, where the law allows it, with the reason for the requester.
