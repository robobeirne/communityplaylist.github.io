import React from 'react';
import {
  Alert,
  AutoGrid,
  Box,
  Button,
  Divider,
  ErrorState,
  Flex,
  Heading,
  LoadingSpinner,
  ProgressBar,
  Tab,
  Tabs,
  Tag,
  Text,
  Tile,
  hubspot,
} from '@hubspot/ui-extensions';
import { STALE_AFTER_DAYS } from './lib/config.ts';
import { firstSentence, freshnessLabel, toUrl } from './lib/parse.ts';
import { IntelTile, NotEnrichedLine, RichText, SectionTitle } from './lib/components.tsx';
import { useRecordProperties, type CrmActions } from './lib/hooks.ts';
import { CONTACT_PROPERTIES, type ContactData } from './contact/config.ts';
import {
  authorityVariant,
  contactCoverage,
  currencyVariant,
  daysSince,
  fullName,
  isContactEnriched,
  leadTag,
  resolveContact,
} from './contact/shared.ts';

hubspot.extend<'crm.record.tab'>(({ actions }) => <ContactProfile actions={actions} />);

export function ContactProfile({ actions }: { actions: CrmActions }) {
  const { props, error, loading } = useRecordProperties(actions, CONTACT_PROPERTIES);

  if (loading) return <LoadingSpinner label="Loading profile" layout="centered" />;
  if (error || !props) {
    return (
      <ErrorState title="Couldn't load the profile">
        <Text>{error ?? 'Unknown error'}</Text>
      </ErrorState>
    );
  }
  const d = resolveContact(props);
  if (!isContactEnriched(d)) return <NotEnrichedLine subject="contact" />;

  return (
    <Flex direction="column" gap="md">
      <Header d={d} />
      {d.approachNotes && (
        <Alert title="How to approach them" variant="tip">
          <RichText value={d.approachNotes} />
        </Alert>
      )}

      <Tabs defaultSelected="brief" variant="enclosed" fill>
        <Tab tabId="brief" title="Brief" tooltip="The full profile. Read this first.">
          <IntelTile icon="description" title="Profile brief">
            <RichText value={d.brief} />
          </IntelTile>
        </Tab>

        <Tab tabId="role" title="Role" tooltip="What they do now, what they own and who they report to">
          <Flex direction="column" gap="sm">
            <IntelTile icon="contact" title="Current role">
              <RichText value={d.currentRole} />
            </IntelTile>
            <AutoGrid columnWidth={260} gap="sm" flexible>
              <IntelTile icon="globe" title="Scope and remit">
                <RichText value={d.scopeRemit} />
              </IntelTile>
              <IntelTile icon="objectAssociations" title="Reporting line">
                <RichText value={d.reportingLine} />
              </IntelTile>
            </AutoGrid>
          </Flex>
        </Tab>

        <Tab tabId="deal" title="Deal role" tooltip="Likely role in the deal and how much they can buy">
          <AutoGrid columnWidth={260} gap="sm" flexible>
            <IntelTile icon="trophy" title="Likely deal role">
              <RichText value={d.dealRole} />
            </IntelTile>
            <IntelTile icon="key" title="Buying authority">
              <RichText value={d.buyingAuthority} />
            </IntelTile>
          </AutoGrid>
        </Tab>

        <Tab tabId="mind" title="What they care about" tooltip="Public voice, stated priorities and view of technology">
          <Flex direction="column" gap="sm">
            <IntelTile icon="goal" title="Stated priorities">
              <RichText value={d.statedPriorities} />
            </IntelTile>
            <AutoGrid columnWidth={260} gap="sm" flexible>
              <IntelTile icon="comment" title="Public voice">
                <RichText value={d.publicVoice} />
              </IntelTile>
              <IntelTile icon="artificialIntelligence" title="Posture on technology">
                <RichText value={d.technologyPosture} />
              </IntelTile>
            </AutoGrid>
          </Flex>
        </Tab>

        <Tab tabId="background" title="Background" tooltip="Career history and credentials">
          <AutoGrid columnWidth={260} gap="sm" flexible>
            <IntelTile icon="readMore" title="Career history">
              <RichText value={d.careerHistory} />
            </IntelTile>
            <IntelTile icon="cap" title="Background and credentials">
              <RichText value={d.credentials} />
            </IntelTile>
          </AutoGrid>
        </Tab>

        <Tab tabId="engage" title="Reach out" tooltip="Hooks to personalise with and ways in">
          <Flex direction="column" gap="sm">
            <IntelTile icon="bulb" title="Personalisation hooks">
              <RichText value={d.hooks} />
            </IntelTile>
            <AutoGrid columnWidth={260} gap="sm" flexible>
              <IntelTile icon="link" title="Paths in">
                <RichText value={d.pathsIn} />
              </IntelTile>
              <IntelTile icon="signal" title="Footprint assessment">
                <RichText value={d.footprint} />
              </IntelTile>
            </AutoGrid>
          </Flex>
        </Tab>
      </Tabs>

      <Footer d={d} />
    </Flex>
  );
}

function Header({ d }: { d: ContactData }) {
  const role = leadTag(d.dealRole);
  const authority = leadTag(d.buyingAuthority);
  const currency = leadTag(d.profileCurrency, 28);
  const title = [d.jobTitle, d.company].filter(Boolean).join(' · ');
  return (
    <Tile>
      <Flex direction="row" gap="md" align="center" justify="between" wrap="wrap">
        <Flex direction="column" gap="xs">
          <Heading>{fullName(d) || 'Unnamed contact'}</Heading>
          {title && <Text variant="microcopy">{title}</Text>}
          {d.currentRole && !title && <Text variant="microcopy">{firstSentence(d.currentRole)}</Text>}
          <Flex direction="row" gap="xs" wrap="wrap">
            {role && <Tag variant="info">{role}</Tag>}
            {authority && <Tag variant={authorityVariant(d.buyingAuthority)}>{authority}</Tag>}
            {currency && <Tag variant={currencyVariant(d.profileCurrency)}>{currency}</Tag>}
          </Flex>
        </Flex>
        {d.linkedin && (
          <Button href={toUrl(d.linkedin)} size="sm" variant="secondary">
            LinkedIn
          </Button>
        )}
      </Flex>
    </Tile>
  );
}

function Footer({ d }: { d: ContactData }) {
  const { filled, total } = contactCoverage(d);
  const days = daysSince(d.lastEnriched);
  const stale = days !== null && days > STALE_AFTER_DAYS;
  return (
    <Flex direction="column" gap="sm">
      <Divider distance="sm" />
      <Flex direction="row" gap="md" align="center" justify="between" wrap="wrap">
        <Box flex={1}>
          <ProgressBar
            title="Profile coverage"
            value={filled}
            maxValue={total}
            valueDescription={`${filled} of ${total} data points`}
            variant={filled === total ? 'success' : filled / total >= 0.6 ? 'warning' : 'danger'}
          />
        </Box>
        <Flex direction="column" gap="xs" align="end">
          <SectionTitle icon="enrichment">Source: Clay</SectionTitle>
          {d.profileCurrency && <Text variant="microcopy">{`Profile currency: ${firstSentence(d.profileCurrency, 90)}`}</Text>}
          {days !== null && (
            <Tag variant={stale ? 'warning' : 'default'}>
              {stale ? `${freshnessLabel(days)} · may be stale` : freshnessLabel(days)}
            </Tag>
          )}
        </Flex>
      </Flex>
    </Flex>
  );
}
