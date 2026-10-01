import React from 'react';
import {
  Alert,
  AutoGrid,
  Box,
  Button,
  Divider,
  EmptyState,
  ErrorState,
  Flex,
  Heading,
  Image,
  Link,
  LoadingSpinner,
  ProgressBar,
  ScoreCircle,
  Statistics,
  StatisticsItem,
  Tab,
  Tabs,
  Tag,
  Text,
  Tile,
  hubspot,
} from '@hubspot/ui-extensions';
import { STALE_AFTER_DAYS, type ClayData } from './lib/config.ts';
import {
  clampScore,
  daysSince,
  firstNumber,
  firstSentence,
  formatCompact,
  freshnessLabel,
  hostname,
  isNone,
  logoUrl,
  ownershipType,
  splitItems,
  toUrl,
} from './lib/parse.ts';
import {
  IntelTile,
  RichText,
  SectionTitle,
  TagCloud,
  coverage,
  isEnriched,
  useClayData,
} from './lib/components.tsx';

hubspot.extend<'crm.record.tab'>(({ actions }) => <AccountIntel actions={actions} />);

function AccountIntel({ actions }: { actions: Parameters<typeof useClayData>[0] }) {
  const { data, error, loading } = useClayData(actions);

  if (loading) return <LoadingSpinner label="Loading account intel" layout="centered" />;
  if (error || !data) {
    return (
      <ErrorState title="Couldn't load account intel">
        <Text>{error ?? 'Unknown error'}</Text>
      </ErrorState>
    );
  }
  if (!isEnriched(data)) {
    return (
      <EmptyState title="No Clay enrichment yet" imageName="integrations" layout="vertical">
        <Text>
          When Clay enriches this company, the account brief appears here: why Protex, where to
          land first, who to talk to and how to open.
        </Text>
      </EmptyState>
    );
  }

  return (
    <Flex direction="column" gap="md">
      <Header data={data} />
      <KeyStats data={data} />
      <Disqualifiers value={data.disqualifiers} />
      {data.openingAngle && (
        <Alert title="Your opening angle" variant="tip">
          <RichText value={data.openingAngle} />
        </Alert>
      )}

      <Tabs defaultSelected="brief" variant="enclosed" fill>
        <Tab tabId="brief" title="Call brief" tooltip="Everything you need in the first 60 seconds">
          <Flex direction="column" gap="sm">
            <IntelTile icon="trophy" title="Why Protex">
              <RichText value={data.whyProtex} />
            </IntelTile>
            <AutoGrid columnWidth={260} gap="sm" flexible>
              <IntelTile icon="location" title="Land first site">
                <RichText value={data.landFirstSite} />
              </IntelTile>
              <IntelTile icon="contact" title="Buying centre">
                <RichText value={data.buyingCentre} />
              </IntelTile>
            </AutoGrid>
          </Flex>
        </Tab>

        <Tab tabId="company" title="Company" tooltip="What they do, how they're owned and who works there">
          <Flex direction="column" gap="sm">
            <IntelTile icon="description" title="What they do">
              <RichText value={data.whatTheyDo} />
            </IntelTile>
            <AutoGrid columnWidth={260} gap="sm" flexible>
              <IntelTile icon="objectAssociations" title="Ownership & structure">
                <RichText value={data.ownershipStructure} />
              </IntelTile>
              <IntelTile icon="contact" title="Workforce">
                <RichText value={data.workforce} />
              </IntelTile>
            </AutoGrid>
          </Flex>
        </Tab>

        <Tab tabId="sites" title="Sites" tooltip="Site footprint and what a typical site looks like">
          <Flex direction="column" gap="sm">
            <AutoGrid columnWidth={260} gap="sm" flexible>
              <IntelTile icon="globe" title="Site footprint">
                <RichText value={data.siteFootprint} />
              </IntelTile>
              <IntelTile icon="realEstateListing" title="Typical site profile">
                <RichText value={data.typicalSiteProfile} />
              </IntelTile>
            </AutoGrid>
          </Flex>
        </Tab>

        <Tab tabId="safety" title="Safety & tech" tooltip="Safety metrics, hazards and technology signals">
          <Flex direction="column" gap="sm">
            <IntelTile icon="gauge" title="Safety metrics">
              <RichText value={data.safetyMetrics} />
            </IntelTile>
            <AutoGrid columnWidth={260} gap="sm" flexible>
              <IntelTile icon="warning" title="Hazard profile">
                <TagCloud value={data.hazardProfile} variant="warning" />
              </IntelTile>
              <IntelTile icon="signal" title="Technology signals">
                <TagCloud value={data.technologySignals} variant="info" />
              </IntelTile>
            </AutoGrid>
          </Flex>
        </Tab>
      </Tabs>

      <Footer data={data} />
    </Flex>
  );
}

function Header({ data }: { data: ClayData }) {
  const logo = logoUrl(data.website);
  const ownership = ownershipType(data.ownershipStructure);
  const score = clampScore(data.fitScore);
  const hasRedFlags = !!data.disqualifiers && !isNone(data.disqualifiers);

  return (
    <Tile>
      <Flex direction="row" gap="md" align="center" justify="between" wrap="wrap">
        <Flex direction="row" gap="md" align="center">
          {logo && <Image src={logo} alt={`${data.name} logo`} width={48} height={48} />}
          <Flex direction="column" gap="xs">
            <Heading>{data.name || 'Unnamed company'}</Heading>
            {data.whatTheyDo && <Text variant="microcopy">{firstSentence(data.whatTheyDo)}</Text>}
            <Flex direction="row" gap="xs" wrap="wrap">
              {hasRedFlags ? (
                <Tag variant="error">Check disqualifiers</Tag>
              ) : (
                <Tag variant="success">Clear to engage</Tag>
              )}
              {ownership && <Tag variant="info">{ownership}</Tag>}
              {data.website && <Link href={toUrl(data.website)}>{hostname(data.website)}</Link>}
            </Flex>
          </Flex>
        </Flex>

        <Flex direction="row" gap="sm" align="center">
          {data.linkedin && (
            <Button href={toUrl(data.linkedin)} size="sm" variant="secondary">
              LinkedIn
            </Button>
          )}
          {score !== null && (
            <Flex direction="column" gap="flush" align="center">
              <ScoreCircle score={score} />
              <Text variant="microcopy">Protex fit</Text>
            </Flex>
          )}
        </Flex>
      </Flex>
    </Tile>
  );
}

function KeyStats({ data }: { data: ClayData }) {
  const employees = firstNumber(data.employeeCount);
  const sites = firstNumber(data.siteFootprint);
  const hazards = splitItems(data.hazardProfile).length;
  const techSignals = splitItems(data.technologySignals).length;

  const items = [
    employees !== null && { id: 'employees', label: 'Employees', number: formatCompact(employees) },
    sites !== null && { id: 'sites', label: 'Sites', number: formatCompact(sites) },
    hazards > 0 && { id: 'hazards', label: 'Hazards flagged', number: hazards },
    techSignals > 0 && { id: 'tech', label: 'Tech signals', number: techSignals },
  ].filter(Boolean) as { id: string; label: string; number: string | number }[];

  if (!items.length) return null;
  return (
    <Statistics>
      {items.map((s) => (
        <StatisticsItem key={s.id} id={s.id} label={s.label} number={s.number} />
      ))}
    </Statistics>
  );
}

function Disqualifiers({ value }: { value: string }) {
  if (!value) return null;
  if (isNone(value)) {
    return (
      <Alert title="No disqualifiers found" variant="success">
        <Text>Clay found nothing that rules this account out.</Text>
      </Alert>
    );
  }
  return (
    <Alert title="Check these disqualifiers before you call" variant="danger">
      <RichText value={value} />
    </Alert>
  );
}

function Footer({ data }: { data: ClayData }) {
  const { filled, total } = coverage(data);
  const days = daysSince(data.lastEnriched);
  const stale = days !== null && days > STALE_AFTER_DAYS;

  return (
    <Flex direction="column" gap="sm">
      <Divider distance="sm" />
      <Flex direction="row" gap="md" align="center" justify="between" wrap="wrap">
        <Box flex={1}>
          <ProgressBar
            title="Intel coverage"
            value={filled}
            maxValue={total}
            valueDescription={`${filled} of ${total} data points`}
            variant={filled === total ? 'success' : filled / total >= 0.6 ? 'warning' : 'danger'}
          />
        </Box>
        <Flex direction="column" gap="xs" align="end">
          <SectionTitle icon="enrichment">Source: Clay</SectionTitle>
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
