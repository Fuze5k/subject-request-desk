# Subject Request Desk: privacy policy

Last updated: 2026-11-25

Subject Request Desk ("the app") is an Atlassian Forge app for Jira Cloud and Confluence Cloud. It helps a privacy officer track data subject requests. This page says what the app stores, where, and what it does not do.

## Where the app runs

The app runs on Atlassian's Forge platform ("Runs on Atlassian"). It does not call any server outside Atlassian. The developer has no server, no database and no analytics for this app, and receives no data from your site.

## What the app stores

Everything is kept in Forge hosted storage, inside your Atlassian site. The developer cannot read it.

- **Request record:** request number, type, law, dates (received, due, extension), channel, a subject label and search terms typed by your officer, notes, the linked Jira work item key, the identity-check result (status, method, note), the reply draft, the outcome, and a history of who did what and when.
- **Hit references:** the key or id, the source (Jira or Confluence), the title, the container name and the link of each work item or page the search found, plus the officer's decision. The app does not copy the content of work items or pages.
- **Atlassian account ids** of the people who opened, decided on or closed a request (needed for the history).
- **Settings:** default law, warning days, company name and sender name for reply drafts.

## What happens at closure

When a request is closed, the subject label, the search terms, the hit titles and the reply draft are removed from the record. The record keeps references, counts, decisions and the history, so you can show an auditor what was done.

## Personal data reporting and erasure

The app reports the Atlassian account ids it stores through the Forge personal data reporting API. If an account is closed, the app removes that account id from its records.

## What the app reads from your site

Only when an officer runs a search, the app reads Jira work items and Confluence pages **as that officer**, so Atlassian permissions apply: it finds only what the officer may see. Search results are shown to the officer and stored as references (see above).

## What the app does not do

- It does not send data to the developer or any third party.
- It does not use advertising, tracking or analytics.
- It does not use a language model. Reply drafts are built from fixed templates.
- It does not send email. The officer sends the reply.

## Retention

Records stay until your organisation deletes the app's data (uninstalling the app removes its stored data, as described in Atlassian's Forge documentation).

## Contact

Questions about this policy: see the support page (SUPPORT.md) for the contact address.
