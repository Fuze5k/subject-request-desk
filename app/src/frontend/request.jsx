import React, { useEffect, useState } from 'react';
import {
  Stack, Inline, Text, Heading, Button, Lozenge, Link, SectionMessage, Textfield, TextArea, Select, Label, HelperMessage, DatePicker,
  DynamicTable, Modal, ModalBody, ModalFooter, ModalHeader, ModalTitle, ModalTransition, User,
} from '@forge/react';
import { realtime } from '@forge/bridge';
import { call, notify, askAgent, Loading, ErrorBox, ClockLozenge, DecisionLozenge, daysText, when, MarkdownText, Card } from './shared';
import { REQUEST_CHANGED } from '../live.js';

const opt = (value, label) => ({ value, label });
const DEFAULT_ACTION = { access: 'provide', portability: 'provide', erasure: 'erase', rectification: 'correct', restriction: 'none', objection: 'none' };
const ACTIONS = [opt('provide', 'Provide'), opt('erase', 'Erase'), opt('redact', 'Redact'), opt('correct', 'Correct'), opt('withhold', 'Withhold (exemption)'), opt('none', 'No action')];
const DECISIONS = [opt('pending', 'To review'), opt('relevant', 'Relevant'), opt('not-relevant', 'Not relevant')];
const OUTCOMES = [opt('fulfilled', 'Fulfilled'), opt('partial', 'Partly fulfilled'), opt('refused', 'Refused'), opt('withdrawn', 'Withdrawn by the requester')];
const IDENTITY = [opt('verified', 'Verified'), opt('waived', 'Check waived (with a reason)'), opt('pending', 'Not verified yet')];
const today = () => new Date().toISOString().slice(0, 10);
const find = (list, value) => list.find((o) => o.value === value) || list[0];

// -------------------------------------------------------------------------------------------- new request

export function NewRequestForm({ suggestion = /** @type {any} */ ({}), onCreated, onCancel = undefined }) {
  const [opts, setOpts] = useState(null);
  const [f, setF] = useState({ type: suggestion.type || 'access', law: '', receivedOn: today(), channel: 'email', subject: '', terms: '', notes: '', issueKey: suggestion.issueKey || '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    call('options').then((o) => { setOpts(o); setF((x) => ({ ...x, law: x.law || o.settings.defaultLaw })); }, () => setOpts({ laws: [], types: [], settings: {} }));
  }, []);
  if (!opts) return <Loading />;
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const types = opts.types.map((t) => opt(t.id, t.name));
  const laws = opts.laws.map((l) => opt(l.id, l.name));
  const channels = [opt('email', 'Email'), opt('portal', 'Service portal'), opt('letter', 'Letter'), opt('other', 'Other')];
  const create = async () => {
    setBusy(true);
    try {
      const r = await call('create', { fields: f });
      notify(`Request ${r.request.id} opened`, 'success', `Deadline ${r.request.due}.`);
      onCreated(r.request);
    } catch (err) {
      notify('Could not open the request', 'error', err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Stack space="space.200">
      <Heading size="small">New data subject request</Heading>
      <Stack space="space.050">
        <Label labelFor="n-subject">Who is it about?</Label>
        <Textfield id="n-subject" defaultValue={f.subject} onChange={(e) => set('subject')(e.target.value)} />
        <HelperMessage>A name or a reference you can recognise. It is removed from the record when the request is closed.</HelperMessage>
      </Stack>
      <Inline space="space.200">
        <Stack space="space.050">
          <Label labelFor="n-type">Type</Label>
          <Select inputId="n-type" options={types} value={find(types, f.type)} onChange={(o) => set('type')(o.value)} />
        </Stack>
        <Stack space="space.050">
          <Label labelFor="n-law">Law (sets the deadline)</Label>
          <Select inputId="n-law" options={laws} value={find(laws, f.law)} onChange={(o) => set('law')(o.value)} />
        </Stack>
      </Inline>
      <Inline space="space.200">
        <Stack space="space.050">
          <Label labelFor="n-date">Received on</Label>
          <DatePicker id="n-date" value={f.receivedOn} onChange={(v) => set('receivedOn')(v)} />
          <HelperMessage>The clock starts on this day. Change it if the request arrived earlier.</HelperMessage>
        </Stack>
        <Stack space="space.050">
          <Label labelFor="n-channel">How it arrived</Label>
          <Select inputId="n-channel" options={channels} value={find(channels, f.channel)} onChange={(o) => set('channel')(o.value)} />
        </Stack>
      </Inline>
      <Stack space="space.050">
        <Label labelFor="n-terms">Search terms</Label>
        <TextArea id="n-terms" defaultValue={f.terms} onChange={(e) => set('terms')(e.target.value)} />
        <HelperMessage>Names, email addresses and aliases, one per line (up to 8). Used only to search Jira and Confluence.</HelperMessage>
      </Stack>
      <Stack space="space.050">
        <Label labelFor="n-issue">Linked work item (optional)</Label>
        <Textfield id="n-issue" defaultValue={f.issueKey} onChange={(e) => set('issueKey')(e.target.value)} />
        <HelperMessage>For example the service portal ticket. Deadline warnings are posted there.</HelperMessage>
      </Stack>
      <Inline space="space.100">
        <Button appearance="primary" isDisabled={busy} onClick={create}>{busy ? 'Opening…' : 'Open request'}</Button>
        {onCancel ? <Button appearance="subtle" onClick={onCancel}>Cancel</Button> : null}
      </Inline>
    </Stack>
  );
}

// -------------------------------------------------------------------------------------------- request view

function StepTitle({ n, title, done }) {
  return (
    <Inline space="space.100" alignBlock="center">
      <Lozenge appearance={done ? 'success' : 'default'}>{done ? 'Done' : `Step ${n}`}</Lozenge>
      <Heading size="xsmall">{title}</Heading>
    </Inline>
  );
}

function IdentityStep({ r, act }) {
  const [status, setStatus] = useState(r.identity.status === 'pending' ? 'verified' : r.identity.status);
  const [method, setMethod] = useState(r.identity.method || '');
  const [note, setNote] = useState(r.identity.note || '');
  const done = r.identity.status !== 'pending';
  return (
    <Card>
      <Stack space="space.100">
        <StepTitle n={1} title="Verify the requester's identity" done={done} />
        {done ? <Text size="small">{`${r.identity.status === 'verified' ? 'Verified' : 'Check waived'}${r.identity.method ? `: ${r.identity.method}` : ''}${r.identity.note ? ` (${r.identity.note})` : ''} · ${when(r.identity.at)}`}</Text> : null}
        {!r.closure ? (
          <Stack space="space.100">
            <Inline space="space.200" alignBlock="end">
              <Stack space="space.050">
                <Label labelFor="id-status">Result</Label>
                <Select inputId="id-status" options={IDENTITY} value={find(IDENTITY, status)} onChange={(o) => setStatus(o.value)} />
              </Stack>
              <Stack space="space.050">
                <Label labelFor="id-method">How</Label>
                <Textfield id="id-method" defaultValue={method} onChange={(e) => setMethod(e.target.value)} />
              </Stack>
            </Inline>
            {status === 'waived' ? (
              <Stack space="space.050">
                <Label labelFor="id-note">Reason for waiving the check</Label>
                <Textfield id="id-note" defaultValue={note} onChange={(e) => setNote(e.target.value)} />
              </Stack>
            ) : null}
            <Inline><Button onClick={() => act('identity', { fields: { status, method, note } }, 'Identity check saved')}>Save identity check</Button></Inline>
          </Stack>
        ) : null}
      </Stack>
    </Card>
  );
}

function SearchStep({ r, act, busy }) {
  const [terms, setTerms] = useState(r.terms.join('\n'));
  const s = r.search;
  return (
    <Card>
      <Stack space="space.100">
        <StepTitle n={2} title="Search Jira and Confluence" done={!!s} />
        {!r.closure ? (
          <Stack space="space.100">
            <Stack space="space.050">
              <Label labelFor="s-terms">Search terms</Label>
              <TextArea id="s-terms" defaultValue={terms} onChange={(e) => setTerms(e.target.value)} />
              <HelperMessage>One per line: names, email addresses, aliases. The search shows only what you are allowed to see.</HelperMessage>
            </Stack>
            <Inline space="space.100">
              <Button appearance="primary" isDisabled={busy} onClick={() => act('search', { terms }, 'Search done')}>{busy ? 'Working…' : s ? 'Search again' : 'Search Jira and Confluence'}</Button>
              <Button isDisabled={busy} onClick={() => act('terms', { terms }, 'Search terms saved')}>Save terms only</Button>
            </Inline>
          </Stack>
        ) : null}
        {s ? (
          <Text size="small">{`Last search ${when(s.ranAt)}: ${s.jira} Jira work item${s.jira === 1 ? '' : 's'}, ${s.confluence} Confluence page${s.confluence === 1 ? '' : 's'}.${s.truncated.jira || s.truncated.confluence ? ' Results were capped: use narrower terms.' : ''}`}</Text>
        ) : null}
        {s?.errors?.length ? <SectionMessage appearance="warning"><Text>{s.errors.join(' ')}</Text></SectionMessage> : null}
      </Stack>
    </Card>
  );
}

function HitsStep({ r, act }) {
  if (!r.search) return null;
  const closed = !!r.closure;
  const decide = (ref, patch, msg) => act('decide', { ref, patch }, msg);
  const rows = r.hits.map((h) => ({
    key: h.ref,
    cells: [
      { key: 'ref', content: h.url && !closed ? <Link href={h.url} openNewTab>{h.ref}</Link> : <Text>{h.ref}</Text> },
      { key: 'title', content: <Text>{h.title || '-'}</Text> },
      { key: 'where', content: <Text size="small">{h.container}</Text> },
      {
        key: 'decision',
        content: closed ? <DecisionLozenge decision={h.decision} /> : (
          <Select spacing="compact" options={DECISIONS} value={find(DECISIONS, h.decision)}
            onChange={(o) => decide(h.ref, o.value === 'relevant' ? { decision: 'relevant', action: h.action || DEFAULT_ACTION[r.type] || 'provide' } : { decision: o.value })} />
        ),
      },
      {
        key: 'action',
        content: h.decision !== 'relevant' ? <Text size="small">-</Text> : closed ? <Text size="small">{h.action}</Text> : (
          <Select spacing="compact" options={ACTIONS} value={find(ACTIONS, h.action || DEFAULT_ACTION[r.type])} onChange={(o) => decide(h.ref, { action: o.value })} />
        ),
      },
      {
        key: 'note',
        content: closed || h.decision === 'pending' ? <Text size="small">{h.note}</Text> : (
          <Textfield defaultValue={h.note} placeholder={h.action === 'withhold' ? 'Exemption (required)' : 'Note'} onBlur={(e) => { if (e.target.value !== h.note) decide(h.ref, { note: e.target.value }); }} />
        ),
      },
    ],
  }));
  return (
    <Card>
      <Stack space="space.100">
        <StepTitle n={3} title={`Review the hits (${r.hitCounts.decided}/${r.hitCounts.total} reviewed)`} done={r.hitCounts.total > 0 && r.hitCounts.pending === 0} />
        {!closed ? <HelperMessage>Open each hit and check it is about this person, not someone with the same name. Mark it relevant, then choose what happens to it.</HelperMessage> : null}
        <DynamicTable
          head={{ cells: [{ key: 'ref', content: 'Item' }, { key: 'title', content: 'Title' }, { key: 'where', content: 'Where' }, { key: 'decision', content: 'Decision' }, { key: 'action', content: 'Action' }, { key: 'note', content: 'Note' }] }}
          emptyView={<Text>The search found nothing. If the person may be in restricted projects or spaces, ask an admin to run the search.</Text>}
          rows={rows}
        />
      </Stack>
    </Card>
  );
}

function ExtendButton({ r, act }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  if (!r.extendable) return null;
  return (
    <>
      <Button spacing="compact" onClick={() => setOpen(true)}>{`Extend the deadline (up to ${r.latestDue})`}</Button>
      <ModalTransition>
        {open ? (
          <Modal onClose={() => setOpen(false)}>
            <ModalHeader><ModalTitle>Extend the deadline</ModalTitle></ModalHeader>
            <ModalBody>
              <Stack space="space.100">
                <Text>{`${r.lawName} allows more time for complex or numerous requests, once. The new deadline is ${r.latestDue}. Tell the requester within the first period and give the reason.`}</Text>
                <Label labelFor="x-reason">Reason given to the requester</Label>
                <TextArea id="x-reason" onChange={(e) => setReason(e.target.value)} />
              </Stack>
            </ModalBody>
            <ModalFooter>
              <Button appearance="primary" onClick={async () => { if (await act('extend', { reason }, 'Deadline extended')) setOpen(false); }}>Extend</Button>
              <Button onClick={() => setOpen(false)}>Cancel</Button>
            </ModalFooter>
          </Modal>
        ) : null}
      </ModalTransition>
    </>
  );
}

function AnswerStep({ r, act, busy }) {
  const [outcome, setOutcome] = useState('fulfilled');
  const [reason, setReason] = useState('');
  const [text, setText] = useState(r.response.draft || '');
  const [sentOn, setSentOn] = useState(today());
  const [confirm, setConfirm] = useState(false);
  useEffect(() => setText(r.response.draft || ''), [r.response.draft]);
  if (r.closure) {
    return (
      <Card>
        <Stack space="space.100">
          <StepTitle n={4} title="Answer the requester" done />
          <Text>{`${r.outcomeName} on ${r.closure.closedOn}${r.closure.reason ? `: ${r.closure.reason}` : ''}.`}</Text>
          <Text size="small" color="color.text.subtle">The search terms, the subject and the hit titles were removed when the request was closed. The record keeps references, decisions and the history.</Text>
        </Stack>
      </Card>
    );
  }
  const blocks = r.findings.filter((f) => f.level === 'block');
  const warns = r.findings.filter((f) => f.level === 'warn');
  return (
    <Card>
      <Stack space="space.100">
        <StepTitle n={4} title="Answer the requester and close" done={false} />
        {blocks.length ? (
          <SectionMessage appearance="warning" title="Before this can be closed">
            <Stack space="space.050">{blocks.map((f) => <Text key={f.code}>{`${f.message} ${f.fix}`}</Text>)}</Stack>
          </SectionMessage>
        ) : <SectionMessage appearance="success"><Text>Nothing blocks closing.</Text></SectionMessage>}
        {warns.map((f) => <Text key={f.code} size="small" color="color.text.subtle">{`${f.message} ${f.fix}`}</Text>)}
        <Inline space="space.200" alignBlock="end">
          <Stack space="space.050">
            <Label labelFor="a-outcome">Outcome</Label>
            <Select inputId="a-outcome" options={OUTCOMES} value={find(OUTCOMES, outcome)} onChange={(o) => setOutcome(o.value)} />
          </Stack>
          <Button isDisabled={busy} onClick={() => act('draft', { outcome, reason }, 'Reply drafted')}>Draft the reply</Button>
        </Inline>
        {outcome !== 'fulfilled' ? (
          <Stack space="space.050">
            <Label labelFor="a-reason">Reason (and legal basis)</Label>
            <Textfield id="a-reason" defaultValue={reason} onChange={(e) => setReason(e.target.value)} />
          </Stack>
        ) : null}
        <Stack space="space.050">
          <Label labelFor="a-text">Reply to the requester (edit before sending it yourself)</Label>
          <TextArea id="a-text" key={r.response.draftedAt || 'none'} defaultValue={text} onChange={(e) => setText(e.target.value)} />
        </Stack>
        <Inline space="space.100" alignBlock="end">
          <Button isDisabled={busy} onClick={() => act('saveDraft', { text }, 'Reply saved')}>Save reply</Button>
          <ExtendButton r={r} act={act} />
        </Inline>
        <HelperMessage>The desk does not send mail. Send the reply from your own mail or the service portal, then close the request with the date you sent it.</HelperMessage>
        <Inline space="space.200" alignBlock="end">
          <Stack space="space.050">
            <Label labelFor="a-sent">Sent on</Label>
            <DatePicker id="a-sent" value={sentOn} onChange={(v) => setSentOn(v)} />
          </Stack>
          <Button appearance="primary" isDisabled={busy || blocks.length > 0} onClick={() => setConfirm(true)}>Close request</Button>
        </Inline>
        <ModalTransition>
          {confirm ? (
            <Modal onClose={() => setConfirm(false)}>
              <ModalHeader><ModalTitle>{`Close ${r.id}?`}</ModalTitle></ModalHeader>
              <ModalBody>
                <Text>{`The outcome is recorded as "${find(OUTCOMES, outcome).label}". The search terms, the subject and the hit titles are removed from the record. This cannot be undone.`}</Text>
              </ModalBody>
              <ModalFooter>
                <Button appearance="primary" onClick={async () => { if (await act('close', { fields: { outcome, reason, sentOn } }, 'Request closed')) setConfirm(false); }}>Close request</Button>
                <Button onClick={() => setConfirm(false)}>Cancel</Button>
              </ModalFooter>
            </Modal>
          ) : null}
        </ModalTransition>
      </Stack>
    </Card>
  );
}

function ReportModal({ id, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { call('report', { id }).then(setData, setError); }, [id]);
  return (
    <Modal onClose={onClose} width="x-large">
      <ModalHeader><ModalTitle>{`Record of ${id}`}</ModalTitle></ModalHeader>
      <ModalBody>{error ? <ErrorBox error={error} /> : !data ? <Loading label="Building the record…" /> : <MarkdownText text={data.markdown} />}</ModalBody>
      <ModalFooter><Button onClick={onClose}>Close</Button></ModalFooter>
    </Modal>
  );
}

/** One request, all its steps. `id` is the request number; `onBack` shows a back button. */
export function RequestView({ id, initial = null, onBack = undefined, onChanged = /** @type {(r: any) => void} */ (() => {}) }) {
  const [r, setR] = useState(initial);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(false);

  const load = async () => {
    try {
      setR(await call('get', { id }));
      setError(null);
    } catch (err) {
      setError(err);
    }
  };
  useEffect(() => { if (!initial || initial.id !== id) load(); }, [id]);
  useEffect(() => {
    let timer;
    let sub = null;
    let gone = false;
    realtime.subscribeGlobal(REQUEST_CHANGED, (payload, err) => {
      if (err) return;
      const event = typeof payload === 'string' ? JSON.parse(payload) : payload;
      if (event?.id !== id) return;
      clearTimeout(timer);
      timer = setTimeout(load, 400);
    }).then((s) => { if (gone) s.unsubscribe(); else sub = s; }, () => {});
    return () => { gone = true; clearTimeout(timer); if (sub) sub.unsubscribe(); };
  }, [id]);

  /** Run a resolver that returns the request (or {request}) and show it. Returns true on success. */
  const act = async (name, payload, message) => {
    setBusy(true);
    try {
      const out = await call(name, { id, ...payload });
      const next = out.request || out;
      setR(next);
      notify(message, 'success', out.errors?.length ? out.errors.join(' ') : out.added != null ? `${out.added} new hit${out.added === 1 ? '' : 's'}.` : undefined);
      onChanged(next);
      return true;
    } catch (err) {
      notify('Could not do that', 'error', err.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!r) return <Loading label="Loading the request…" />;
  const closed = !!r.closure;
  return (
    <Stack space="space.200">
      <Inline space="space.100" alignBlock="center" spread="space-between">
        <Inline space="space.100" alignBlock="center">
          {onBack ? <Button appearance="subtle" onClick={onBack}>Back</Button> : null}
          <Heading size="medium">{`${r.id} · ${r.typeName}`}</Heading>
        </Inline>
        <Inline space="space.100">
          <Button onClick={() => askAgent(closed ? `Summarise how ${r.id} was handled.` : `What is the next step on ${r.id} and what blocks closing it?`)}>Ask the assistant</Button>
          <Button onClick={() => setReport(true)}>{closed ? 'Audit record' : 'Draft record'}</Button>
        </Inline>
      </Inline>
      <Inline space="space.100" alignBlock="center">
        <ClockLozenge state={r.clock.state} />
        <Text weight="medium">{closed ? `Closed ${r.closure.closedOn} · ${r.outcomeName}` : `Due ${r.due} · ${daysText(r.clock.daysLeft)}`}</Text>
        <Text color="color.text.subtle">{`${r.lawName} · received ${r.receivedOn}`}</Text>
        {r.extension ? <Lozenge appearance="moved">Extended</Lozenge> : null}
      </Inline>
      {!closed ? <Text size="small" color="color.text.subtle">{`${r.subject} · now: ${r.stageName}${r.issueKey ? ` · work item ${r.issueKey}` : ''}`}</Text> : null}
      <IdentityStep key={`id-${r.identity.at}`} r={r} act={act} />
      <SearchStep key={`s-${r.search?.ranAt || 'none'}`} r={r} act={act} busy={busy} />
      <HitsStep r={r} act={act} />
      <AnswerStep r={r} act={act} busy={busy} />
      <Stack space="space.050">
        <Heading size="xsmall">History</Heading>
        {[...r.history].reverse().slice(0, 12).map((h, i) => (
          <Inline key={i} space="space.100" alignBlock="center">
            <Text size="small" color="color.text.subtle">{when(h.at)}</Text>
            {h.by === 'system' || h.by === 'closed-account' ? <Text size="small">{h.by === 'system' ? 'System' : 'Former user'}</Text> : <User accountId={h.by} />}
            <Text size="small">{h.what}</Text>
          </Inline>
        ))}
      </Stack>
      <ModalTransition>{report ? <ReportModal id={r.id} onClose={() => setReport(false)} /> : null}</ModalTransition>
    </Stack>
  );
}
