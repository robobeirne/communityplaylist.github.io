# Discovery assessment card (deals)

A card on the deal record built from the **Protex Discovery Assessment** sheet: 36 questions in nine topics, with live **discovery health** and **likelihood to close**.

## What reps see

- **Summary:** a discovery health ring (the sheet's Deal scorer: weighted share of questions due by this stage that are answered well enough), likelihood to close out of 100 with its band (High, Medium, Low or At risk), the deal's stage and industry, and how many questions are short for this stage.
- **Up next:** the questions due by the current stage that aren't at the level needed yet, most important first.
- **All questions:** the nine topics, each showing how many questions are short.
- **By who to ask:** the questions each person leads on, the job titles to look for in the deal's industry, and what not to ask them.
- **Close signals:** the 11 Win-Loss signals, which are met, and the points behind the score.
- **A question, opened:** the card switches to that question. It shows why it matters, who to ask, a form to record status, notes, source, details captured and any extra fields, the details checklist, the six ways to ask it, what to listen for and the red flag. Previous and Next step through what's due.

Only the money question for the deal's industry shows. Until the industry is set, the card asks for it at the top.

Deals in other pipelines (expansion, renewal, partnership) show one line: "The discovery assessment is for new-business deals."

## How it scores

These are the sheet's own formulas, tested against its worked example (85% health, 32 points, Medium, 6 short).

| Input | Comes from |
| --- | --- |
| Stage 1–5 | The deal stage. "Stage 3 Approval" counts as stage 3 and "Stage 5 Approval" as stage 5, so the card shows what's needed to pass the gate. Closed deals count as stage 5. |
| Industry | **Industry** (`da_industry`) |
| How well each question is answered | Each question's **how well answered** dropdown |
| People engaged | HubSpot's **Number of associated contacts** |
| VP, IT and Ops leader engaged | Ticks in **Who's involved — details captured** |
| Something should stop us, with no fix | **Ticked with no known fix** (`da_stop_unresolved`), under question 36 |

The sheet's Deal scorer uses "Something should stop us, no fix" as an input, but the HubSpot properties tab doesn't list a property for it. The card adds one checkbox, `da_stop_unresolved`, for that.

The four "Calculation" properties on the sheet (discovery health, close points, close band, value-to-cost ratio) are **not created**. The card calculates them live. If you want them on the deal for reports and lists, that's a follow-up: a small app function or workflow that writes the card's numbers back to the deal.

## Set it up

All commands run from the project folder (`protex-account-intel`).

1. **Create the deal properties (167 of them).**
   1. In HubSpot, create a private app (the same way as for the company properties) with the scope **`crm.schemas.deals.write`**, and copy its token.
   2. Run:
      ```
      HUBSPOT_TOKEN=pat-xxxx node scripts/create-deal-properties.mjs
      ```
      It takes about a minute. Each property prints `created`, or `exists` if it's already there.
   3. Delete that private app afterwards.
2. **Upload the app:**
   ```
   cd src/app/cards
   npm install
   cd ../../..
   hs project upload
   ```
   The app now also asks to read deals (`crm.objects.deals.read`). If HubSpot asks you to approve the new permission, open **Development > Projects > protex-account-intel > Protex Account Intel** and accept it.
3. **Put the card on deals:** go to **Settings > Objects > Deals > Record customization** and open the default view. Add a tab called **Discovery**, click **Add cards**, filter by **App** and choose **Discovery assessment**. Click **Save and exit**.
4. **Check a deal:** open a new-business deal, set **Industry** at the top of the card, then open a question and set its status. The health ring and close points update as you save.

## When the sheet changes

1. In Google Sheets, choose **File > Download > Microsoft Excel (.xlsx)**.
2. Run:
   ```
   pip install openpyxl
   python3 scripts/build-discovery.py ~/Downloads/Protex_Discovery_Assessment.xlsx
   ```
   This regenerates `src/app/cards/discovery/data.ts` and `scripts/deal-properties.json`.
3. If the sheet added properties, run `create-deal-properties.mjs` again. It only creates the new ones.
4. Run `hs project upload`.

Changing question wording, guidance, weights or stage bars only needs steps 1, 2 and 4.

## Develop

```
cd src/app/cards
npm run typecheck
npm test              # scoring, checked against the sheet's worked example
npm run test:render   # renders the card with HubSpot's test renderer and a sample deal
```
