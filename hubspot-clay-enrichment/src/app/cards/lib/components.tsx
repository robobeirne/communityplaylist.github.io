import React, { useEffect, useState } from 'react';
import {
  DescriptionList,
  DescriptionListItem,
  Flex,
  Icon,
  List,
  Tag,
  Text,
  Tile,
  type IconNames,
} from '@hubspot/ui-extensions';
import { ALL_PROPERTIES, CLAY_ONLY_FIELDS, COVERAGE_FIELDS, type ClayData } from './config.ts';
import { clean, isNumbered, isTaggable, paragraphs, parseKeyValues, resolveFields, splitItems } from './parse.ts';

type CrmActions = {
  fetchCrmObjectProperties: (properties: string[] | '*') => Promise<Record<string, string>>;
  onCrmPropertiesUpdate: (
    properties: string[] | '*',
    callback: (properties: Record<string, string>, error?: { message: string }) => void
  ) => void;
};

/**
 * Loads the company properties and keeps them in sync with the record, so the
 * cards update as soon as Clay writes back (no page refresh needed).
 */
export function useClayData(actions: CrmActions) {
  const [data, setData] = useState<ClayData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    actions
      .fetchCrmObjectProperties(ALL_PROPERTIES)
      .then((props) => active && setData(resolveFields(props)))
      .catch((e: unknown) => active && setError(e instanceof Error ? e.message : String(e)));

    actions.onCrmPropertiesUpdate(ALL_PROPERTIES, (props, err) => {
      if (!active) return;
      if (err) setError(err.message);
      else setData(resolveFields(props));
    });

    return () => {
      active = false;
    };
  }, []);

  return { data, error, loading: !data && !error };
}

export function isEnriched(data: ClayData): boolean {
  return CLAY_ONLY_FIELDS.some((k) => !!data[k]);
}

export function coverage(data: ClayData): { filled: number; total: number } {
  return {
    filled: COVERAGE_FIELDS.filter((k) => !!data[k]).length,
    total: COVERAGE_FIELDS.length,
  };
}

/** Icon and title row used at the top of every section. */
export function SectionTitle({ icon, children }: { icon: IconNames; children: string }) {
  return (
    <Flex direction="row" gap="xs" align="center">
      <Icon name={icon} size="sm" />
      <Text format={{ fontWeight: 'demibold', textTransform: 'uppercase' }} variant="microcopy">
        {children}
      </Text>
    </Flex>
  );
}

export function NotEnriched() {
  return (
    <Text variant="microcopy" format={{ italic: true }}>
      Not enriched yet
    </Text>
  );
}

/**
 * Renders Clay free text in the most readable shape: "Label: value" lines become
 * a description list, list-like text becomes bullets, everything else becomes
 * paragraphs.
 */
export function RichText({ value, maxItems }: { value: string; maxItems?: number }) {
  const v = clean(value);
  if (!v) return <NotEnriched />;

  const pairs = parseKeyValues(v);
  if (pairs) {
    return (
      <DescriptionList direction="column">
        {pairs.slice(0, maxItems).map((p, i) => (
          <DescriptionListItem key={i} label={p.label}>
            <Text>{p.value}</Text>
          </DescriptionListItem>
        ))}
      </DescriptionList>
    );
  }

  const items = splitItems(v);
  const listLike = items.length >= 2 && (/\r?\n|[;|•]/.test(v) || isTaggable(items));
  if (listLike) {
    return (
      <List variant={isNumbered(v) ? 'ordered-styled' : 'unordered-styled'}>
        {items.slice(0, maxItems).map((item, i) => (
          <Text key={i}>{item}</Text>
        ))}
      </List>
    );
  }

  return (
    <Flex direction="column" gap="xs">
      {paragraphs(v).map((p, i) => (
        <Text key={i}>{p}</Text>
      ))}
    </Flex>
  );
}

type TagVariant = 'default' | 'warning' | 'success' | 'error' | 'info';

/** Short list items as tags. Falls back to RichText for long-form text. */
export function TagCloud({ value, variant = 'default' }: { value: string; variant?: TagVariant }) {
  const items = splitItems(value);
  if (!items.length) return <NotEnriched />;
  if (!isTaggable(items)) return <RichText value={value} />;
  return (
    <Flex direction="row" gap="xs" wrap="wrap">
      {items.map((item, i) => (
        <Tag key={i} variant={variant}>
          {item}
        </Tag>
      ))}
    </Flex>
  );
}

/** A titled tile. Used for every block of intel. */
export function IntelTile({
  icon,
  title,
  children,
}: {
  icon: IconNames;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Tile compact>
      <Flex direction="column" gap="sm">
        <SectionTitle icon={icon}>{title}</SectionTitle>
        {children}
      </Flex>
    </Tile>
  );
}
