import React from 'react';
import { invoke, showFlag, rovo } from '@forge/bridge';
import {
  Box, Stack, Inline, Text, Heading, Button, Lozenge, SectionMessage, Spinner, Toggle, Label, xcss,
} from '@forge/react';

/** @type {{type: 'forge', agentName: string, agentKey: string}} */
export const AGENT = { type: 'forge', agentName: 'Privacy request assistant', agentKey: 'srd-agent' };

/** Call a resolver; resolvers answer { ok, data } or { ok: false, error }. */
export async function call(name, payload = {}) {
  const res = /** @type {any} */ (await invoke(name, payload));
  if (!res || res.ok !== true) {
    throw Object.assign(new Error(res?.error?.message || 'Subject Request Desk could not reach the server. Please try again.'), {
      code: res?.error?.code || 'UNKNOWN',
      details: res?.error?.details,
    });
  }
  return res.data;
}

/** @param {string} title @param {'success'|'info'|'warning'|'error'} [type] @param {string} [description] */
export function notify(title, type = 'success', description = undefined) {
  showFlag({ id: `srd-${Date.now()}`, title, description, type, isAutoDismiss: type !== 'error' });
}

export async function askAgent(prompt) {
  try {
    if (!(await rovo.isEnabled())) {
      notify('Rovo is not turned on for this site', 'warning', 'An admin can turn on Rovo in Atlassian Administration.');
      return;
    }
    await rovo.open({ ...AGENT, prompt });
  } catch (err) {
    notify('Could not open Rovo chat', 'error', err.message);
  }
}

/** UI Kit's Toggle does not show its `label` prop, so put a real Label beside it. */
export function LabeledToggle({ id, label, isChecked, onChange, isDisabled = false }) {
  return (
    <Inline space="space.100" alignBlock="center">
      <Toggle id={id} isChecked={isChecked} onChange={onChange} label={label} isDisabled={isDisabled} />
      <Label labelFor={id}>{label}</Label>
    </Inline>
  );
}

export const cardStyle = xcss({
  borderColor: 'color.border',
  borderStyle: 'solid',
  borderWidth: 'border.width',
  borderRadius: 'radius.medium',
  padding: 'space.150',
  backgroundColor: 'elevation.surface',
});

export function Card({ children }) {
  return <Box xcss={cardStyle}>{children}</Box>;
}

export function Loading({ label = 'Loading…' }) {
  return (
    <Inline space="space.100" alignBlock="center">
      <Spinner size="small" label={label} />
      <Text color="color.text.subtle">{label}</Text>
    </Inline>
  );
}

export function ErrorBox({ error, onRetry = undefined }) {
  if (!error) return null;
  return (
    <SectionMessage appearance="error" title="Something went wrong">
      <Text>{error.message || String(error)}</Text>
      {onRetry ? <Button appearance="subtle" onClick={onRetry}>Try again</Button> : null}
    </SectionMessage>
  );
}

const CLOCK = { breached: ['Late', 'removed'], 'met-late': ['Answered late', 'moved'], 'due-soon': ['Due soon', 'moved'], running: ['On time', 'inprogress'], met: ['Answered', 'success'] };
export const ClockLozenge = ({ state }) => {
  const [label, appearance] = CLOCK[state] || [state, 'default'];
  return <Lozenge appearance={/** @type {any} */ (appearance)}>{label}</Lozenge>;
};

const DECISION = { pending: ['To review', 'default'], relevant: ['Relevant', 'inprogress'], 'not-relevant': ['Not relevant', 'success'] };
export const DecisionLozenge = ({ decision }) => {
  const [label, appearance] = DECISION[decision] || [decision, 'default'];
  return <Lozenge appearance={/** @type {any} */ (appearance)}>{label}</Lozenge>;
};

/** "5 days left", "3 days late", "due today" */
export function daysText(d) {
  if (d == null) return '';
  if (d === 0) return 'due today';
  const n = Math.abs(d);
  const t = `${n} day${n === 1 ? '' : 's'}`;
  return d > 0 ? `${t} left` : `${t} late`;
}

export const when = (iso) => (iso ? String(iso).slice(0, 16).replace('T', ' ') + ' UTC' : '');

/** Show Markdown as plain UI Kit text: headings, bullets and table rows. */
export function MarkdownText({ text }) {
  const lines = String(text || '').split('\n');
  return (
    <Stack space="space.050">
      {lines.map((line, i) => {
        if (!line.trim() || /^\|[-| ]+\|$/.test(line) || line.trim() === '| | |') return null;
        if (line.startsWith('# ')) return <Heading key={i} size="small">{line.slice(2)}</Heading>;
        if (line.startsWith('## ')) return <Heading key={i} size="xsmall">{line.slice(3)}</Heading>;
        const plain = line.replace(/\*\*/g, '').replace(/^_(.*)_$/, '$1');
        if (line.startsWith('|')) return <Text key={i} size="small">{plain.split('|').map((x) => x.trim()).filter(Boolean).join('  ·  ')}</Text>;
        return <Text key={i} size="small">{plain}</Text>;
      })}
    </Stack>
  );
}
