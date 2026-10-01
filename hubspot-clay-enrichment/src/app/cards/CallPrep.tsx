import React from 'react';
import {
  Divider,
  EmptyState,
  ErrorState,
  Flex,
  Link,
  LoadingSpinner,
  ScoreCircle,
  Tag,
  Text,
  hubspot,
} from '@hubspot/ui-extensions';
import { STALE_AFTER_DAYS } from './lib/config.ts';
import {
  daysSince,
  firstNumber,
  formatCompact,
  freshnessLabel,
  isNone,
  ownershipType,
  parseFitScore,
  parseSiteCount,
  toUrl,
} from './lib/parse.ts';
import { RichText, SectionTitle, TagCloud, isEnriched, useClayData } from './lib/components.tsx';

hubspot.extend<'crm.record.sidebar'>(({ actions }) => <CallPrep actions={actions} />);

/** Compact sidebar card: the five things a rep needs before dialling. */
function CallPrep({ actions }: { actions: Parameters<typeof useClayData>[0] }) {
  const { data, error, loading } = useClayData(actions);

  if (loading) return <LoadingSpinner label="Loading brief" />;
  if (error || !data) {
    return (
      <ErrorState title="Couldn't load the brief">
        <Text>{error ?? 'Unknown error'}</Text>
      </ErrorState>
    );
  }
  if (!isEnriched(data)) {
    return (
      <EmptyState title="Not enriched yet" imageName="integrations" layout="vertical" imageWidth={120}>
        <Text variant="microcopy">The pre-call brief appears once Clay enriches this company.</Text>
      </EmptyState>
    );
  }

  const fit = parseFitScore(data.fitScore);
  const employees = firstNumber(data.employeeCount);
  const sites = parseSiteCount(data.siteCount).label;
  const ownership = ownershipType(data.ownershipStructure);
  const redFlags = !!data.disqualifiers && !isNone(data.disqualifiers);
  const days = daysSince(data.lastEnriched);

  return (
    <Flex direction="column" gap="sm">
      <Flex direction="row" gap="sm" align="center">
        {fit && <ScoreCircle score={Math.round(fit.score * 10)} />}
        <Flex direction="column" gap="xs">
          <Flex direction="row" gap="xs" wrap="wrap">
            {fit && <Tag variant="default">{`Fit ${fit.score}/10`}</Tag>}
            {redFlags ? <Tag variant="warning">Friction noted</Tag> : <Tag variant="success">No disqualifiers</Tag>}
            {ownership && <Tag variant="info">{ownership}</Tag>}
          </Flex>
          <Text variant="microcopy">
            {[
              employees !== null && `${formatCompact(employees)} employees`,
              sites && `${sites} sites`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </Flex>
      </Flex>

      {data.openingAngle && (
        <>
          <Divider distance="xs" />
          <SectionTitle icon="calling">Open with</SectionTitle>
          <RichText value={data.openingAngle} />
        </>
      )}

      {data.whyProtex && (
        <>
          <Divider distance="xs" />
          <SectionTitle icon="trophy">Why Protex</SectionTitle>
          <RichText value={data.whyProtex} maxItems={3} />
        </>
      )}

      {data.landFirstSite && (
        <>
          <Divider distance="xs" />
          <SectionTitle icon="location">Land first</SectionTitle>
          <RichText value={data.landFirstSite} />
        </>
      )}

      {redFlags && (
        <>
          <Divider distance="xs" />
          <SectionTitle icon="warning">Watch-outs</SectionTitle>
          <TagCloud value={data.disqualifiers} variant="warning" />
        </>
      )}

      <Divider distance="xs" />
      <Flex direction="row" gap="sm" justify="between" align="center" wrap="wrap">
        {data.linkedin ? <Link href={toUrl(data.linkedin)}>LinkedIn</Link> : <Text variant="microcopy"> </Text>}
        {days !== null && (
          <Text variant="microcopy">
            {freshnessLabel(days)}
            {days > STALE_AFTER_DAYS ? ' · may be stale' : ''}
          </Text>
        )}
      </Flex>
    </Flex>
  );
}
