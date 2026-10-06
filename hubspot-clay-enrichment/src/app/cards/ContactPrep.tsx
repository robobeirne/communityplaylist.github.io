import React from 'react';
import { Divider, ErrorState, Flex, Link, LoadingSpinner, Tag, Text, hubspot } from '@hubspot/ui-extensions';
import { toUrl } from './lib/parse.ts';
import { NotEnrichedLine, RichText, SectionTitle } from './lib/components.tsx';
import { useRecordProperties, type CrmActions } from './lib/hooks.ts';
import { CONTACT_PROPERTIES } from './contact/config.ts';
import {
  authorityVariant,
  currencyVariant,
  isContactEnriched,
  leadTag,
  resolveContact,
} from './contact/shared.ts';

hubspot.extend<'crm.record.sidebar'>(({ actions }) => <ContactPrep actions={actions} />);

/** Compact sidebar card: what a rep needs before reaching out to this person. */
export function ContactPrep({ actions }: { actions: CrmActions }) {
  const { props, error, loading } = useRecordProperties(actions, CONTACT_PROPERTIES);

  if (loading) return <LoadingSpinner label="Loading" />;
  if (error || !props) {
    return (
      <ErrorState title="Couldn't load the profile">
        <Text>{error ?? 'Unknown error'}</Text>
      </ErrorState>
    );
  }
  const d = resolveContact(props);
  if (!isContactEnriched(d)) return <NotEnrichedLine subject="contact" />;

  const role = leadTag(d.dealRole);
  const authority = leadTag(d.buyingAuthority);
  const currency = leadTag(d.profileCurrency, 28);

  return (
    <Flex direction="column" gap="sm">
      <Flex direction="row" gap="xs" wrap="wrap">
        {role && <Tag variant="info">{role}</Tag>}
        {authority && <Tag variant={authorityVariant(d.buyingAuthority)}>{authority}</Tag>}
        {currency && <Tag variant={currencyVariant(d.profileCurrency)}>{currency}</Tag>}
      </Flex>

      {d.approachNotes && (
        <>
          <Divider distance="xs" />
          <SectionTitle icon="calling">Approach</SectionTitle>
          <RichText value={d.approachNotes} />
        </>
      )}

      {d.hooks && (
        <>
          <Divider distance="xs" />
          <SectionTitle icon="bulb">Hooks</SectionTitle>
          <RichText value={d.hooks} maxItems={3} />
        </>
      )}

      {d.statedPriorities && (
        <>
          <Divider distance="xs" />
          <SectionTitle icon="goal">They care about</SectionTitle>
          <RichText value={d.statedPriorities} maxItems={3} />
        </>
      )}

      {d.pathsIn && (
        <>
          <Divider distance="xs" />
          <SectionTitle icon="link">Paths in</SectionTitle>
          <RichText value={d.pathsIn} maxItems={3} />
        </>
      )}

      {d.linkedin && (
        <>
          <Divider distance="xs" />
          <Link href={toUrl(d.linkedin)}>LinkedIn profile</Link>
        </>
      )}
    </Flex>
  );
}
