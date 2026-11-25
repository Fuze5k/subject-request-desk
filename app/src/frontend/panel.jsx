import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Stack, Text, Button } from '@forge/react';
import { view } from '@forge/bridge';
import { call, Loading, ErrorBox } from './shared';
import { RequestView, NewRequestForm } from './request';

function Panel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const load = async () => {
    try {
      const ctx = /** @type {any} */ (await view.getContext());
      const issueKey = ctx?.extension?.issue?.key;
      setData(await call('forIssue', { issueKey }));
      setError(null);
    } catch (err) {
      setError(err);
    }
  };
  useEffect(() => { load(); }, []);
  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!data) return <Loading label="Loading…" />;
  if (data.request) return <RequestView id={data.request.id} initial={data.request} />;
  if (creating) return <NewRequestForm suggestion={data.suggestion} onCreated={() => { setCreating(false); load(); }} onCancel={() => setCreating(false)} />;
  return (
    <Stack space="space.150">
      <Text>{`No data subject request is linked to ${data.issue.key}. If this work item is one, open a request to start its deadline clock and search Jira and Confluence for the person's data.`}</Text>
      <Button appearance="primary" onClick={() => setCreating(true)}>Open a data subject request</Button>
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <Panel />
  </React.StrictMode>
);
