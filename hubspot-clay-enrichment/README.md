# Protex Account Intel (HubSpot private app)

A HubSpot private app, built with projects, that turns Clay enrichment on a
company record into a brief a rep can read before a call. It adds two cards to
company records.

**Account Intel** (record tab, middle column)
- Header: logo, company name, one-line summary, a "Clear to engage" or
  "Check disqualifiers" tag, ownership type, website link, LinkedIn button and
  an optional Protex fit score ring.
- Key stats: employees, sites, hazards flagged, tech signals.
- Disqualifiers alert (red), or a green "No disqualifiers found".
- "Your opening angle" callout.
- Tabs:
  - **Call brief:** Why Protex, Land first site, Buying centre
  - **Company:** What they do, Ownership & structure, Workforce
  - **Sites:** Site footprint, Typical site profile
  - **Safety & tech:** Safety metrics, Hazard profile (tags), Technology signals (tags)
- Footer: an intel coverage bar (how many of the 17 data points are filled)
  and how long ago Clay last enriched the record. It warns after 90 days.

**Pre-call brief** (right sidebar): fit score, status tags, headcount and
sites, opening angle, top 3 reasons for Protex, land-first site and
watch-outs. A rep sees it as soon as they open the company.

Both cards listen for property changes, so they update as soon as Clay writes
to the record.

## How Clay text is displayed

Clay columns are usually AI-written text. The cards choose a layout from the
shape of the text:

| Clay output | Rendered as |
| --- | --- |
| `Economic buyer: COO` lines (2 or more) | Label and value list |
| One item per line, `-`/`•`/`1.` bullets, or `;` / `\|` separators | Bulleted list |
| Short items (40 characters or fewer) in hazards, tech signals, disqualifiers | Coloured tags |
| Anything else | Paragraphs (split on blank lines) |
| `None`, `None identified`, `No red flags` in disqualifiers | Green "clear" state |

Tips for your Clay prompts:
- **Site footprint:** start with the number ("42 sites across UK & Ireland"),
  because the Sites stat uses the first number in the text.
- **Hazard profile / Technology signals:** short items separated by
  semicolons or new lines ("Forklifts; Racking; Loading docks").
- **Buying centre:** one `Role: Name, title` per line.
- **Why Protex:** 3 to 5 bullets. The sidebar shows the first 3.
- **Disqualifiers:** return `None identified` when there are none.

## Properties

The cards read these company properties. Change the mapping in
[`src/app/extensions/lib/config.ts`](src/app/extensions/lib/config.ts) if your
Clay table writes to different names.

| Data point | Property (fallback) |
| --- | --- |
| Name | `name` (`clay_company_name`) |
| Website | `website`, `domain` (`clay_website`) |
| LinkedIn URL | `linkedin_company_page` (`clay_linkedin_url`) |
| Employee count | `numberofemployees` (`clay_employee_count`) |
| What they do | `clay_what_they_do` |
| Site footprint | `clay_site_footprint` |
| Typical site profile | `clay_typical_site_profile` |
| Ownership & structure | `clay_ownership_structure` |
| Workforce | `clay_workforce` |
| Safety metrics | `clay_safety_metrics` |
| Hazard profile | `clay_hazard_profile` |
| Technology signals | `clay_technology_signals` |
| Why Protex | `clay_why_protex` |
| Land first site | `clay_land_first_site` |
| Buying centre | `clay_buying_centre` |
| Disqualifiers | `clay_disqualifiers` |
| Opening angle | `clay_opening_angle` |
| Protex fit score (optional, 0-100) | `clay_protex_fit_score` |
| Last enriched (optional, date) | `clay_last_enriched` |

To create all the `clay_*` properties in a "Clay enrichment" group (safe to
re-run):

```bash
HUBSPOT_TOKEN=pat-xxx node scripts/create-properties.mjs
```

The token needs `crm.schemas.companies.write`. This app only requests
`crm.objects.companies.read`, so use a token from another private app, or
add the scope to `src/app/app.json` for one upload and then remove it.

## Deploy

You need the HubSpot CLI and Super Admin (or developer) access to the portal.

```bash
npm install -g @hubspot/cli
hs account auth                       # connect your HubSpot account
cd hubspot-clay-enrichment
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
- `ScoreCircle` only appears when `clay_protex_fit_score` has a value. If
  your portal's UI extensions runtime doesn't support it yet, delete the
  score blocks in both cards.
