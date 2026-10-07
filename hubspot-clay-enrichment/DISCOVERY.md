# Discovery assessment card (deals), filled by AI from Avoma

The card on the deal record is a record of what the buyer has said, kept by AI from Avoma calls. Reps don't type answers. They read what's known, prep from what's missing, and correct a level when the AI got it wrong.

It's built from the **Protex Discovery Assessment** sheet: 36 questions in nine topics, with live **discovery health** and **likelihood to close**.

## How it works

1. **`assessor/run.mjs`** runs on a schedule. It finds completed Avoma sales calls linked to a HubSpot deal and reads each transcript.
2. Claude marks the call against **`assessor/rubric.json`**, following **`prompt.md`**, and returns JSON shaped by **`schema.json`**.
3. **`assessor/merge.mjs`** applies the rules in code, then writes to the deal:
   - Only buyer quotes count, and every quote must be found in the transcript.
   - "Told and nodded" caps a question at Touched on.
   - An answer from the wrong person caps it at Touched on.
   - Confirmed needs two different buyers.
   - A level never goes down automatically.
   - A contradiction holds the level and flags it for review.
   - A rep's correction is the floor.
4. It writes each question's status, notes, source and details, plus the full record as JSON in `da_ai_assessment`.
5. **The card** reads that record.

## What reps see

- **Top line:** stage, industry, discovery %, close points out of 100, and the band (High, Medium, Low or At risk).
- **Last call assessed:** the call, linked to Avoma, with the AI's summary of what it did and didn't establish. Before the first call it says "No calls assessed yet".
- **Industry picker:** shown until the industry is set. It saves straight to the deal.
- **Answers to check:** any answer that conflicts with an earlier call, or that the AI wasn't confident about.
- **Still to find out for {stage}:** each gap, with what's missing and the question to ask, and who to ask it. Filter it with **Prepping for a call with** to see only one person's questions.
- **Everything we know:** every question, grouped by topic. Each shows its summary, who said it and when.
- **How these numbers work:** the 11 Win-Loss signals and the points they add.
- **One question, opened:**
  - The level, and why the AI gave it.
  - The buyer's quotes, each with who said it, when, and a **Listen** link to the call.
  - What's still needed to reach the next level, and what we already have.
  - The question to ask next.
  - **Other ways to ask**, and **What counts, and red flags**.
  - **Correct the level:** pick the right level and say why. The correction sticks until a later call gives stronger evidence.

Expansion, renewal and partnership deals show one line: "The discovery assessment is for new-business deals."

## How it scores

These are the sheet's formulas, tested against its worked example (85% health, 32 points, Medium, 6 short) and against the Siemens call from 6 Oct (29%, 0/100, Low, 13 to find out).

| Input | Comes from |
| --- | --- |
| Stage 1–5 | The deal stage. "Stage 3 Approval" counts as stage 3 and "Stage 5 Approval" as stage 5. Closed deals count as stage 5. |
| Industry | `da_industry` |
| How well each question is answered | Each question's `da_*_status` |
| People engaged | HubSpot's number of associated contacts |
| VP, IT and Ops leader engaged | Ticks in `da_who_details` |
| Something should stop us, with no fix | `da_stop_unresolved` |

## Saving from the card

The card saves through a private app function, **`save_discovery`** (`src/app/functions/save-discovery.js`). It does two things:

- **`{ properties }`** sets `da_` properties, such as the industry. It can't write anything else, and it can't write `da_ai_assessment` directly.
- **`{ override }`** is a rep's correction. It sets the question's status and records the correction in `da_ai_assessment`, so the assessor treats it as the floor.

This is why the project is on **platform version 2026.03** (private app functions) and why the app needs **`crm.objects.deals.write`**.

## Set it up

All commands run from the project folder (`protex-account-intel`).

1. **Create any missing deal properties** (173 in total). This needs a private app token with `crm.schemas.deals.write`:
   ```
   read -s HUBSPOT_TOKEN
   export HUBSPOT_TOKEN
   node scripts/create-deal-properties.mjs
   ```
2. **Fix the three checklists** whose options were split at a semicolon. No deal had values on them when this was written, so nothing is lost:
   ```
   node scripts/create-deal-properties.mjs --fix da_who_details,da_sites_details,da_cameras_details
   unset HUBSPOT_TOKEN
   ```
   Delete the private app afterwards.
3. **Upload:**
   ```
   cd src/app/cards && npm install && cd ../../..
   hs project upload
   ```
4. **Reinstall the app.** It now writes to deals. Go to **Development > Projects > protex-account-intel > Protex Account Intel > Distribution** and reinstall it. Until you do, saving from the card fails.
5. **Run the assessor.** See "The assessor" below.

## The assessor

It runs outside HubSpot, on any machine or scheduler that has Node 20+.

- **Environment:**
  - `AVOMA_API_KEY`
  - `ANTHROPIC_API_KEY`
  - `HUBSPOT_TOKEN`: a private app token with `crm.objects.deals.read`, `crm.objects.deals.write` and `crm.objects.contacts.read`
  - `ASSESSOR_MODEL`
- **Already filled in:** `CFG.stages`, which maps the new-business, Kroninn and testing pipeline stages to 1–5, the same as the card.
- **Check before switching it on:**
  - `CFG.purposes`: the Avoma meeting purposes that count as sales calls.
  - Avoma's transcript endpoint path.
- **First run:** `DRY_RUN=1 node assessor/run.mjs` prints the writes without making them.
- **Tests:** `cd assessor/test && node test.mjs`. This runs the Siemens call and checks that each rule holds.

**Keeping the checklists in step:** the assessor ticks details straight into the `da_*_details` properties, so its checklist values must match the HubSpot options. After regenerating the deal properties or rebuilding the rubric, run:
```
node assessor/sync_details.mjs
```

## When the sheet changes

1. Download the sheet as .xlsx.
2. Regenerate the card data and deal properties:
   ```
   python3 scripts/build-discovery.py ~/Downloads/Protex_Discovery_Assessment.xlsx
   ```
3. Re-sync the assessor's checklists:
   ```
   node assessor/sync_details.mjs
   ```
4. Create any new properties (step 1 above). Use `--fix` for checklists whose options changed.
5. Run `hs project upload`.

The card's level descriptions and "what counts" guidance live in `src/app/cards/discovery/guide.ts`, generated from the Opportunity Workbench.

## Develop

```
cd src/app/cards
npm run typecheck
npm test              # scoring, checked against the sheet's worked example
npm run test:render   # renders the card on the Siemens assessment and walks the flow
cd ../../..
node --test tests/save-discovery.test.mjs   # the save function, against a stubbed HubSpot API
cd assessor/test && node test.mjs           # the assessor's rules
```
