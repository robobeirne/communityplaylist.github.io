# Protex Account Intel (HubSpot private app)

A HubSpot private app, built with projects, that turns Clay enrichment on a
company record into a brief a rep can read before a call. It adds two cards to
company records.

**Step-by-step setup: see [SETUP.md](SETUP.md).** The deal card has its own guide: [DISCOVERY.md](DISCOVERY.md).

The project has three cards:

- **Account Intel** and **Pre-call brief** on companies (Clay enrichment), described below.
- **Discovery assessment** on deals: the 36-question discovery assessment with live discovery health and likelihood to close. See [DISCOVERY.md](DISCOVERY.md).

**Account Intel** (record tab, middle column)
- Header: logo, company name, one-line summary, a "No disqualifiers" or
  "Friction noted" tag, ownership type, website link, LinkedIn button and a
  fit score ring (Clay's 1-10 score).
- Key stats: employees, sites, fit score, hazards flagged.
- "Your opening angle" callout, then friction and disqualifiers.
- Tabs:
  - **Brief:** the full account brief (Clay `result`)
  - **Call plan:** Why Protex, Land first, Buying centre, fit score reasoning
  - **Company:** What they do, Operating model, Ownership & structure, Workforce
  - **Sites:** Site count (with a confidence tag), Site footprint, Typical site profile
  - **Safety:** Safety posture, Safety metrics, Hazard profile
  - **Tech:** Technology signals
  - **Sources:** a clickable, numbered list of the sources
- Footer: an intel coverage bar and how long ago Clay last enriched the record.

**Pre-call brief** (right sidebar): fit score, status tags, headcount and
sites, opening angle, top 3 reasons for Protex, land-first site and
watch-outs.

Both cards listen for property changes, so they update as soon as Clay writes
to the record.

## Properties

[SETUP.md](SETUP.md) has the full Clay field to HubSpot property table. The
mapping lives in [`src/app/cards/lib/config.ts`](src/app/cards/lib/config.ts),
and `scripts/create-properties.mjs` creates every property.

## Deploy

You need the HubSpot CLI and Super Admin (or developer) access to the portal.

```bash
npm install -g @hubspot/cli@latest   # 2025.2 projects need a recent CLI
hs account auth                       # connect your HubSpot account
cd protex-account-intel
(cd src/app/cards && npm install)
hs project upload                     # builds and deploys
```

Then, in HubSpot:

1. Create the properties (see above) and map your Clay columns to them in
   Clay's HubSpot "Update record" action.
2. Go to **Settings > Objects > Companies > Record customization**. Add
   **Account Intel** as a tab, or to the overview tab, and **Pre-call brief**
   to the right sidebar of the default view.
3. Open an enriched company.

For live editing against a real record, run `hs project dev` and follow the
prompts.

## Develop

```bash
cd src/app/cards
npm run typecheck   # checks the cards against the real @hubspot/ui-extensions types
npm test            # unit tests for the Clay text parsing
```

Files:

```
hsproject.json                    project config (platformVersion 2025.2)
src/app/app-hsmeta.json           private app: name, scopes, permitted image URLs
src/app/cards/
  account-intel-hsmeta.json       record tab card definition
  call-prep-hsmeta.json           sidebar card definition
  AccountIntel.tsx                record tab card
  CallPrep.tsx                    sidebar card
  lib/config.ts                   property mapping
  lib/parse.ts                    Clay text parsing (unit tested)
  lib/components.tsx              shared hook and display components
  lib/hooks.ts                    loads and live-syncs record properties
  discovery-hsmeta.json           deal record tab card definition
  Discovery.tsx                   discovery assessment card
  discovery/data.ts               questions and guidance (generated from the sheet)
  discovery/score.ts              discovery health and close points (unit tested)
scripts/create-properties.mjs     creates the company properties
scripts/build-discovery.py        regenerates discovery data from the sheet
scripts/deal-properties.json      deal property definitions (generated)
scripts/create-deal-properties.mjs creates the deal properties
```

## Notes

- Company logos come from Google's favicon service, using the company's
  domain. No API key is needed.
- `ScoreCircle` only appears when `clay_fit_score` starts with a number. If
  your portal's UI extensions runtime doesn't support it yet, delete the
  score blocks in both cards.
