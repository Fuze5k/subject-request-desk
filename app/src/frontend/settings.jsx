import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Stack, Inline, Text, Button, Select, Label, HelperMessage, SectionMessage, Textfield } from '@forge/react';
import { call, notify, Loading, ErrorBox, LabeledToggle, when } from './shared';

const n = (k, word) => `${k} ${word}${k === 1 ? '' : 's'}`;

function Settings() {
  const [data, setData] = useState(null);
  const [s, setS] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    try {
      const d = await call('settings');
      setData(d);
      setS(d.settings);
    } catch (err) {
      setError(err);
    }
  };
  useEffect(() => { load(); }, []);
  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!data || !s) return <Loading label="Loading settings…" />;
  const set = (k, v) => setS((x) => ({ ...x, [k]: v }));
  const laws = data.laws.map((l) => ({ label: `${l.name}: ${l.note}`, value: l.id }));
  const save = async () => {
    setBusy(true);
    try {
      setS(await call('saveSettings', { settings: s }));
      notify('Settings saved');
    } catch (err) {
      notify('Could not save', 'error', err.message);
    } finally {
      setBusy(false);
    }
  };
  const runDaily = async () => {
    setBusy(true);
    try {
      const r = await call('runDaily');
      notify('Deadlines checked', 'success', `${n(r.checked, 'open request')}, ${n(r.comments.length, 'comment')} posted.`);
      load();
    } catch (err) {
      notify('Could not check deadlines', 'error', err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Stack space="space.200">
      {!data.isAdmin ? <SectionMessage appearance="warning"><Text>Only Jira admins can change these settings.</Text></SectionMessage> : null}
      <Stack space="space.050">
        <Label labelFor="law">Law preselected for new requests</Label>
        <Select inputId="law" isDisabled={!data.isAdmin} options={laws} value={laws.find((o) => o.value === s.defaultLaw)} onChange={(o) => set('defaultLaw', o.value)} />
        <HelperMessage>The deadline is counted from the day the request was received. The officer can pick another law per request.</HelperMessage>
      </Stack>
      <Stack space="space.050">
        <Label labelFor="soon">Warn this many days before a deadline</Label>
        <Textfield id="soon" type="number" isDisabled={!data.isAdmin} defaultValue={String(s.dueSoonDays)} onChange={(e) => set('dueSoonDays', Number(e.target.value))} />
      </Stack>
      <LabeledToggle id="comments" label="Comment on the linked work item when a deadline is due soon or has passed" isDisabled={!data.isAdmin} isChecked={s.deadlineComments} onChange={() => set('deadlineComments', !s.deadlineComments)} />
      <Stack space="space.050">
        <Label labelFor="company">Company name in reply drafts</Label>
        <Textfield id="company" isDisabled={!data.isAdmin} defaultValue={s.company} onChange={(e) => set('company', e.target.value)} />
      </Stack>
      <Stack space="space.050">
        <Label labelFor="sender">Sender (name and role) in reply drafts</Label>
        <Textfield id="sender" isDisabled={!data.isAdmin} defaultValue={s.sender} onChange={(e) => set('sender', e.target.value)} />
      </Stack>
      <Inline space="space.100">
        <Button appearance="primary" isDisabled={!data.isAdmin || busy} onClick={save}>Save settings</Button>
        <Button isDisabled={!data.isAdmin || busy} onClick={runDaily}>Check deadlines now</Button>
      </Inline>
      <Text size="small" color="color.text.subtle">{data.lastDaily ? `Last deadline check: ${when(data.lastDaily.at)}, ${n(data.lastDaily.checked, 'open request')}, ${n(data.lastDaily.comments.length, 'comment')}.` : 'The deadline check runs once a day.'}</Text>
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <Settings />
  </React.StrictMode>
);
