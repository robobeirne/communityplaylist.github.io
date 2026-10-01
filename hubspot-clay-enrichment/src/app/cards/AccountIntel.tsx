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
  List,
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
  daysSince,
  firstNumber,
  firstSentence,
  formatCompact,
  freshnessLabel,
  hostname,
  isNone,
  isNotFound,
  logoUrl,
  ownershipType,
  parseFitScore,
  parseSiteCount,
  parseSources,
  splitItems,
  toUrl,
} from './lib/parse.ts';
import {
  IntelTile,
  NotEnriched,
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

  const site = parseSiteCount(data.siteCount);
  const fit = parseFitScore(data.fitScore);

  return (
    <Flex direction="column" gap="md">
      <Header data={data} />
      <KeyStats data={data} />
      {data.openingAngle && (
        <Alert title="Your opening angle" variant="tip">
          <RichText value={data.openingAngle} />
        </Alert>
      )}
      <Disqualifiers value={data.disqualifiers} />

      <Tabs defaultSelected="brief" variant="enclosed" fill>
        <Tab tabId="brief" title="Brief" tooltip="The full account brief. Read this first.">
          <Flex direction="column" gap="sm">
            <IntelTile icon="description" title="Account brief">
              <RichText value={data.brief} />
            </IntelTile>
          </Flex>
        </Tab>

        <Tab tabId="plan" title="Call plan" tooltip="Why Protex, where to land and who to talk to">
          <Flex direction="column" gap="sm">
            <IntelTile icon="trophy" title="Why Protex">
              <RichText value={data.whyProtex} />
            </IntelTile>
            <AutoGrid columnWidth={260} gap="sm" flexible>
              <IntelTile icon="location" title="Land first">
                <RichText value={data.landFirstSite} />
              </IntelTile>
              <IntelTile icon="contact" title="Buying centre">
                <RichText value={data.buyingCentre} />
              </IntelTile>
            </AutoGrid>
            {fit && fit.reason && (
              <IntelTile icon="gauge" title={`Fit score ${fmtScore(fit.score)}/10`}>
                <Text>{fit.reason}</Text>
              </IntelTile>
            )}
          </Flex>
        </Tab>

        <Tab tabId="company" title="Company" tooltip="What they do, how they operate and who owns them">
          <Flex direction="column" gap="sm">
            <IntelTile icon="description" title="What they do">
              <RichText value={data.whatTheyDo} />
            </IntelTile>
            <AutoGrid columnWidth={260} gap="sm" flexible>
              <IntelTile icon="workflows" title="Operating model">
                <RichText value={data.operatingModel} />
              </IntelTile>
              <IntelTile icon="objectAssociations" title="Ownership & structure">
                <RichText value={data.ownershipStructure} />
              </IntelTile>
            </AutoGrid>
            <IntelTile icon="contact" title="Workforce">
              <RichText value={data.workforce} />
            </IntelTile>
          </Flex>
        </Tab>

        <Tab tabId="sites" title="Sites" tooltip="Site count, footprint and what a typical site looks like">
          <Flex direction="column" gap="sm">
            <IntelTile icon="hash" title="Site count">
              {data.siteCount ? (
                <Flex direction="column" gap="xs">
                  <Flex direction="row" gap="sm" align="center" wrap="wrap">
                    {site.label && <Heading inline>{`${site.label} sites`}</Heading>}
                    {site.confidence && (
                      <Tag variant={site.confidence === 'High' ? 'success' : site.confidence === 'Medium' ? 'warning' : 'error'}>
                        {`${site.confidence} confidence`}
                      </Tag>
                    )}
                  </Flex>
                  {site.detail && <Text variant="microcopy">{site.detail}</Text>}
                </Flex>
              ) : (
                <NotEnriched />
              )}
            </IntelTile>
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

        <Tab tabId="safety" title="Safety" tooltip="Safety posture, metrics and hazards">
          <Flex direction="column" gap="sm">
            <IntelTile icon="approvals" title="Safety posture">
              <RichText value={data.safetyPosture} />
            </IntelTile>
            <AutoGrid columnWidth={260} gap="sm" flexible>
              <IntelTile icon="gauge" title="Safety metrics">
                {isNotFound(data.safetyMetrics) ? (
                  <Flex direction="column" gap="xs">
                    <Tag variant="warning">No published safety metrics</Tag>
                    <Text variant="microcopy">
                      They don't publish TRIR or LTIFR. Ask how they measure safety today.
                    </Text>
                  </Flex>
                ) : (
                  <RichText value={data.safetyMetrics} />
                )}
              </IntelTile>
              <IntelTile icon="warning" title="Hazard profile">
                <TagCloud value={data.hazardProfile} variant="warning" />
              </IntelTile>
            </AutoGrid>
          </Flex>
        </Tab>

        <Tab tabId="tech" title="Tech" tooltip="Camera estate, core systems and digital programmes">
          <Flex direction="column" gap="sm">
            <IntelTile icon="signal" title="Technology signals">
              <TagCloud value={data.technologySignals} variant="info" />
            </IntelTile>
          </Flex>
        </Tab>

        <Tab tabId="sources" title="Sources" tooltip="Where Clay found each fact">
          <Flex direction="column" gap="sm">
            <IntelTile icon="link" title="Sources">
              <Sources value={data.sources} />
            </IntelTile>
          </Flex>
        </Tab>
      </Tabs>

      <Footer data={data} />
    </Flex>
  );
}

function fmtScore(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function Header({ data }: { data: ClayData }) {
  const logo = logoUrl(data.website);
  const ownership = ownershipType(data.ownershipStructure);
  const fit = parseFitScore(data.fitScore);
  const friction = !!data.disqualifiers && !isNone(data.disqualifiers);

  return (
    <Tile>
      <Flex direction="row" gap="md" align="center" justify="between" wrap="wrap">
        <Flex direction="row" gap="md" align="center">
          {logo && <Image src={logo} alt={`${data.name} logo`} width={48} height={48} />}
          <Flex direction="column" gap="xs">
            <Heading>{data.name || 'Unnamed company'}</Heading>
            {data.whatTheyDo && <Text variant="microcopy">{firstSentence(data.whatTheyDo)}</Text>}
            <Flex direction="row" gap="xs" wrap="wrap" align="center">
              {friction ? (
                <Tag variant="warning">Friction noted</Tag>
              ) : (
                <Tag variant="success">No disqualifiers</Tag>
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
          {fit && (
            <Flex direction="column" gap="flush" align="center">
              <ScoreCircle score={Math.round(fit.score * 10)} />
              <Text variant="microcopy">{`Fit ${fmtScore(fit.score)}/10`}</Text>
            </Flex>
          )}
        </Flex>
      </Flex>
    </Tile>
  );
}

function KeyStats({ data }: { data: ClayData }) {
  const employees = firstNumber(data.employeeCount);
  const site = parseSiteCount(data.siteCount);
  const fallbackSites = firstNumber(data.siteFootprint);
  const sitesLabel = site.label || (fallbackSites !== null ? formatCompact(fallbackSites) : '');
  const fit = parseFitScore(data.fitScore);
  const hazards = splitItems(data.hazardProfile).length;

  const items = [
    employees !== null && { id: 'employees', label: 'Employees', number: formatCompact(employees) },
    sitesLabel && { id: 'sites', label: 'Sites', number: sitesLabel },
    fit && { id: 'fit', label: 'Fit score', number: `${fmtScore(fit.score)}/10` },
    hazards > 1 && { id: 'hazards', label: 'Hazards flagged', number: hazards },
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
      <Alert title="No disqualifiers identified" variant="success">
        <Text>Clay found nothing that rules this account out.</Text>
      </Alert>
    );
  }
  return (
    <Alert title="Friction and disqualifiers to check" variant="warning">
      <RichText value={value} />
    </Alert>
  );
}

function Sources({ value }: { value: string }) {
  const sources = parseSources(value);
  if (!sources.length) return <NotEnriched />;
  return (
    <List variant="ordered-styled">
      {sources.map((s, i) => (
        <Flex key={i} direction="column" gap="flush">
          {s.url ? <Link href={s.url}>{s.label}</Link> : <Text>{s.label}</Text>}
          {s.note && <Text variant="microcopy">{s.note}</Text>}
        </Flex>
      ))}
    </List>
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
