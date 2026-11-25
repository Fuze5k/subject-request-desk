import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box, xcss, Stack, Inline, Text, Button, SectionMessage, DynamicTable, Tabs, TabList, Tab, TabPanel, Select, Label, Link,
} from '@forge/react';
import { call, notify, askAgent, Loading, ErrorBox, ClockLozenge, daysText } from './shared';
import { RequestView, NewRequestForm } from './request';

const fullWidth = xcss({ width: '100%' });

function Table({ rows, closed, onOpen }) {
  const head = { cells: [
    { key: 'id', content: 'Request', width: 10 }, { key: 'type', content: 'Type', width: 14 }, { key: 'subject', content: 'About', width: 22 }, { key: 'law', content: 'Law', width: 14 },
    { key: 'clock', content: closed ? 'Outcome' : 'Deadline', width: 22 }, { key: 'stage', content: closed ? 'Closed' : 'Next step', width: 18 },
  ] };
  return (
    <Box xcss={fullWidth}>
      <DynamicTable
        head={head}
        emptyView={<Text>{closed ? 'No closed requests yet.' : 'No open requests. Open one when a data subject request arrives.'}</Text>}
        rows={rows.map((r) => ({
          key: r.id,
          cells: [
            { key: 'id', content: <Button appearance="subtle" spacing="none" onClick={() => onOpen(r.id)}>{r.id}</Button> },
            { key: 'type', content: <Text>{r.typeName.split(' (')[0]}</Text> },
            { key: 'subject', content: <Text>{r.subject}</Text> },
            { key: 'law', content: <Text size="small">{r.lawName}</Text> },
            {
              key: 'clock',
              content: closed ? <Text>{r.outcomeName}</Text> : (
                <Inline space="space.075" alignBlock="center">
                  <ClockLozenge state={r.clock.state} />
                  <Text size="small">{`${r.due} · ${daysText(r.clock.daysLeft)}`}</Text>
                </Inline>
              ),
            },
            { key: 'stage', content: <Text size="small">{closed ? r.closedOn : `${r.stageName}${r.hitCounts.total ? ` (${r.hitCounts.decided}/${r.hitCounts.total})` : ''}`}</Text> },
          ],
        }))}
      />
    </Box>
  );
}

function SamplePicker({ onDone }) {
  const [projects, setProjects] = useState(null);
  const [project, setProject] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { call('projects').then(setProjects, () => setProjects([])); }, []);
  const add = async () => {
    setBusy(true);
    try {
      const r = await call('addSample', { projectKey: project?.value || '' });
      notify('Sample data added', 'success', `${r.requests.length} sample requests${r.issues.length ? ` and ${r.issues.length} work items in ${project.value}` : ''}. ${r.note || ''}`);
      onDone();
    } catch (err) {
      notify('Could not add sample data', 'error', err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <SectionMessage appearance="information" title="Try it with sample data">
      <Text>Adds a closed sample erasure request and an open access request about a fictional person, and (in the project you pick) three work items that mention her so the search has something to find.</Text>
      <Inline space="space.100" alignBlock="end">
        <Stack space="space.050">
          <Label labelFor="sample-project">Project for the sample work items</Label>
          <Select inputId="sample-project" isLoading={!projects} value={project} onChange={(o) => setProject(o || null)} placeholder="Pick a project (optional)"
            options={(projects || []).map((p) => ({ label: `${p.name} (${p.key})`, value: p.key }))} />
        </Stack>
        <Button appearance="primary" isDisabled={busy} onClick={add}>{busy ? 'Adding…' : 'Add sample data'}</Button>
      </Inline>
    </SectionMessage>
  );
}

function Desk() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const load = async () => {
    try {
      setData(await call('board'));
      setError(null);
    } catch (err) {
      setError(err);
    }
  };
  useEffect(() => { load(); }, []);
  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!data) return <Loading label="Loading requests…" />;
  if (openId) return <RequestView id={openId} onBack={() => { setOpenId(null); load(); }} onChanged={() => {}} />;
  if (creating) return <NewRequestForm onCreated={(r) => { setCreating(false); setOpenId(r.id); }} onCancel={() => setCreating(false)} />;
  const { counts } = data;
  return (
    <Stack space="space.200">
      <Inline space="space.100" alignBlock="center" spread="space-between">
        <Text>{`${counts.open} open request${counts.open === 1 ? '' : 's'}${counts.breached ? `, ${counts.breached} late` : ''}${counts.dueSoon ? `, ${counts.dueSoon} due soon` : ''} · ${data.closed.length} closed`}</Text>
        <Inline space="space.100">
          <Button onClick={() => askAgent('Which data subject requests are due soon, and what is the next step on each?')}>Ask the assistant</Button>
          <Button appearance="primary" onClick={() => setCreating(true)}>New request</Button>
        </Inline>
      </Inline>
      <Tabs id="desk-tabs">
        <TabList><Tab>Open requests</Tab><Tab>Closed</Tab></TabList>
        <TabPanel>
          <Stack space="space.200">
            <Table rows={data.open} closed={false} onOpen={setOpenId} />
            {!data.open.length && !data.closed.length ? <SamplePicker onDone={load} /> : null}
          </Stack>
        </TabPanel>
        <TabPanel><Table rows={data.closed} closed onOpen={setOpenId} /></TabPanel>
      </Tabs>
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <Desk />
  </React.StrictMode>
);
