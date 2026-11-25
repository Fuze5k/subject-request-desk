import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Stack, Heading, Text, Link, SectionMessage } from '@forge/react';
import { view } from '@forge/bridge';

/** Confluence has no case storage of its own: requests live in Jira. This page says so and links to the desk. */
function Launcher() {
  const [href, setHref] = useState(null);
  useEffect(() => {
    view.getContext().then((ctx) => {
      // localId: ari-cloud-ecosystem--extension-<app id>-<environment id>-static-<module key>
      const m = /extension-([0-9a-f]{8}-[0-9a-f-]{27})-([0-9a-f]{8}-[0-9a-f-]{27})-/.exec(/** @type {any} */ (ctx).localId || '');
      if (m) setHref(`/jira/apps/${m[1]}/${m[2]}`);
    }, () => {});
  }, []);
  return (
    <Stack space="space.200">
      <Heading size="medium">Subject Request Desk</Heading>
      <Text>
        Data subject requests are handled in Jira, where the deadline clock, the identity check and the audit record live. When an officer runs a search there, it
        covers the Confluence pages the officer can see, and every page found is listed with a link.
      </Text>
      {href ? <Link href={href}>Open the desk in Jira</Link> : <Text>Open Apps, then Subject Request Desk, in Jira.</Text>}
      <SectionMessage appearance="information" title="Where the data is">
        <Text>This app does not copy page content. It stores the page id and title of each hit with the officer's decision, and removes the title when the request is closed.</Text>
      </SectionMessage>
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <Launcher />
  </React.StrictMode>
);
