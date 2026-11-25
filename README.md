# Subject Request Desk

A case desk for data subject requests (GDPR, CCPA) in Jira and Confluence Cloud. Forge app (UI Kit), runs on Atlassian, no external calls.

- Tracks each request: type, law, deadline clock, identity check, extension, outcome.
- Searches Jira work items and Confluence pages for the person as the logged-in officer (permissions apply), and lists the hits for review.
- Drafts the reply and keeps an audit record; search terms and hit titles are removed when a request is closed.
- Rovo agent "Privacy request assistant" answers about request status and finds subject data.

Docs: [docs/DOCS.md](docs/DOCS.md) · Privacy: [docs/PRIVACY.md](docs/PRIVACY.md) · Support: [docs/SUPPORT.md](docs/SUPPORT.md) · Personal data: [docs/personal-data.md](docs/personal-data.md)

Code is in `app/` (`npm install`, `npm run check`, `forge deploy`). All sample data is fictional.
