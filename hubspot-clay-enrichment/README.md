# Protex Account Intel (HubSpot private app)

A HubSpot private app, built with projects, that turns Clay enrichment on a
company record into a brief a rep can read before a call. It adds two cards to
company records.

**Step-by-step setup: see [SETUP.md](SETUP.md).**

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
mapping lives in [`src/app/extensions/lib/config.ts`](src/app/extensions/lib/config.ts),
and `scripts/create-properties.mjs` creates every property.

## Deploy

You need the HubSpot CLI and Super Admin (or developer) access to the portal.

```bash
npm install -g @hubspot/cli
hs account auth                       # connect your HubSpot account
cd protex-account-intel
(cd src/app/extensions && npm install)
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
cd src/app/extensions
npm run typecheck   # checks the cards against the real @hubspot/ui-extensions types
npm test            # unit tests for the Clay text parsing
```

Files:

```
hsproject.json                    project config (platformVersion 2025.1)
src/app/app.json                  private app: name, scopes, cards
src/app/extensions/
  account-intel-card.json         record tab card definition
  call-prep-card.json             sidebar card definition
  AccountIntel.tsx                record tab card
  CallPrep.tsx                    sidebar card
  lib/config.ts                   property mapping
  lib/parse.ts                    Clay text parsing (unit tested)
  lib/components.tsx              shared hook and display components
scripts/create-properties.mjs     creates the HubSpot properties
```

## Notes

- Company logos come from Google's favicon service, using the company's
  domain. No API key is needed.
- `ScoreCircle` only appears when `clay_fit_score` starts with a number. If
  your portal's UI extensions runtime doesn't support it yet, delete the
  score blocks in both cards.
