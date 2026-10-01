# Setup guide: Clay to HubSpot Account Intel

Do these steps in order. Total time is about 45 minutes.

| Part | What you do | Where |
| --- | --- | --- |
| 1 | Install the tools | Your computer |
| 2 | Create the 20 HubSpot properties Clay writes into | HubSpot + terminal |
| 3 | Upload the app | Terminal |
| 4 | Put the two cards on the company record | HubSpot |
| 5 | Send Clay's fields to HubSpot | Clay |
| 6 | Test with one company | Clay + HubSpot |

---

## Part 1: Install the tools (once)

1. Install **Node.js 20 or newer** (the "LTS" download) from https://nodejs.org.
2. Open a terminal. On Mac, that's the **Terminal** app; on Windows, it's **PowerShell**.
3. Check that Node.js works:
   ```
   node --version
   ```
   You should see `v20` or higher.
4. Install the HubSpot CLI:
   ```
   npm install -g @hubspot/cli
   ```
   On Mac, if this fails with a permissions error, run it again with `sudo` at the front.
5. Unzip `protex-account-intel.zip` somewhere easy, for example your Desktop.
6. In the terminal, go into the folder:
   ```
   cd ~/Desktop/protex-account-intel
   ```

You need **Super Admin** in HubSpot, or permission to manage apps and properties.

---

## Part 2: Create the HubSpot properties

Every field in your Clay JSON is a string, so each one becomes a **Multi-line text** company property in HubSpot. Multi-line text keeps line breaks, so numbered lists such as Why Protex and Sources stay readable.

The **internal names must be exactly as below**, because the cards look them up by internal name. You can't change an internal name after you create a property.

### Option A: run the script (recommended, about 2 minutes)

1. Get a token that is allowed to create properties:
   1. In HubSpot, go to **Settings > Integrations > Private Apps**. In newer portals it's under **Development > Legacy apps**, then **Create legacy app > Private**.
   2. Create an app called `Property setup`.
   3. On the **Scopes** tab, tick **`crm.schemas.companies.write`**. Its read scope gets added too.
   4. Create the app and copy the **access token** (it starts with `pat-`).
2. Run the script from the `protex-account-intel` folder.

   Mac:
   ```
   HUBSPOT_TOKEN=pat-xxxx node scripts/create-properties.mjs
   ```
   Windows PowerShell:
   ```
   $env:HUBSPOT_TOKEN="pat-xxxx"; node scripts/create-properties.mjs
   ```
3. You should see each property listed with `created`. If one says `exists`, it's already there, which is fine. The script is safe to run again.
4. Optional: delete the `Property setup` private app once you're done.

### Option B: create them by hand

Go to **Settings > Properties**, choose **Company properties**, then **Create property**. First create a group called **Clay enrichment**. Then create each property below with:

- **Group:** Clay enrichment
- **Field type:** Multi-line text, or Date picker for the last one
- **Internal name:** click the code icon or "Internal name" under the label and type it exactly as shown. HubSpot's auto-generated name usually won't match.

| Clay field | Property label | Internal name (exact) | Field type |
| --- | --- | --- | --- |
| `result` | Account brief | `clay_account_brief` | Multi-line text |
| `What_They_Do` | What they do | `clay_what_they_do` | Multi-line text |
| `Site_Count` | Site count | `clay_site_count` | Multi-line text |
| `Site_Footprint` | Site footprint | `clay_site_footprint` | Multi-line text |
| `Typical_Site_Profile` | Typical site profile | `clay_typical_site_profile` | Multi-line text |
| `Operating_Model` | Operating model | `clay_operating_model` | Multi-line text |
| `Ownership_And_Structure` | Ownership & structure | `clay_ownership_structure` | Multi-line text |
| `Workforce` | Workforce | `clay_workforce` | Multi-line text |
| `Safety_Posture` | Safety posture | `clay_safety_posture` | Multi-line text |
| `Safety_Metrics` | Safety metrics | `clay_safety_metrics` | Multi-line text |
| `Hazard_Profile` | Hazard profile | `clay_hazard_profile` | Multi-line text |
| `Technology_Signals` | Technology signals | `clay_technology_signals` | Multi-line text |
| `Why_Protex` | Why Protex | `clay_why_protex` | Multi-line text |
| `Land_First` | Land first | `clay_land_first` | Multi-line text |
| `Buying_Centre` | Buying centre | `clay_buying_centre` | Multi-line text |
| `Fit_Score` | Fit score | `clay_fit_score` | Multi-line text |
| `Disqualifiers` | Disqualifiers | `clay_disqualifiers` | Multi-line text |
| `Opening_Angle` | Opening angle | `clay_opening_angle` | Multi-line text |
| `Sources` | Sources | `clay_sources` | Multi-line text |
| *(optional, see Part 5)* | Last enriched (Clay) | `clay_last_enriched` | Date picker |

`Fit_Score` stays text, not number, because Clay sends "8 — reasoning". The card reads the number from the front and shows the sentence as the reason.

---

## Part 3: Upload the app

All commands run from the `protex-account-intel` folder.

1. Connect the CLI to your HubSpot account:
   ```
   hs account auth
   ```
   A browser opens. Log in, choose the right HubSpot account and generate a **personal access key**. Copy it and paste it back into the terminal. Give the account a short name, such as `protex`. On an older CLI, the command is `hs init`.
2. Install the card's code packages:
   ```
   cd src/app/extensions
   npm install
   cd ../../..
   ```
3. Upload:
   ```
   hs project upload
   ```
   - If it asks whether to create the project `protex-account-intel` in your account, say **yes**.
   - Wait for **Build succeeded** and **Deploy succeeded**.
4. Check it in HubSpot: go to **Development > Projects** (in older portals, **CRM Development > Projects**). Open **protex-account-intel**. You should see the app **Protex Account Intel** with two cards: **Account Intel** and **Pre-call brief**.

If the build fails, the terminal shows the error and a link to the build log. Send me the error and I'll fix it.

---

## Part 4: Put the cards on the company record

1. Go to **Settings > Objects > Companies**, then the **Record customization** tab.
2. Open the **Default view**, or the team view your reps use.
3. **Middle column:**
   1. Click **+** next to the tabs to add a new tab called **Account Intel**.
   2. In that tab, click **Add cards**, then filter by **Card types > Apps** and choose **Account Intel**.
   3. Optional: also add it near the top of the **Overview** tab so reps can't miss it.
4. **Right sidebar:** click **Add cards** and choose **Pre-call brief**. Drag it to the top.
5. Click **Save and exit**.

The cards show "No Clay enrichment yet" until Part 5 fills the properties.

---

## Part 5: Send Clay's fields to HubSpot

### 5.1 Split the JSON into columns

Your AI column returns one JSON object. HubSpot needs each field separately.

1. In your Clay table, click a cell in the AI research column to open the output.
2. For each field (`result`, `What_They_Do`, and so on), hover over it and click **Add as column**. Clay may also call this **Extract to column**.
3. You now have 19 new columns, one per field. Keep their names the same as the JSON keys so mapping is easy.

### 5.2 Optional: a "last enriched" date

This shows reps how fresh the data is, and warns after 90 days.

1. Add a **Formula** column called `Enriched date`.
2. Ask Clay's formula helper for "today's date in YYYY-MM-DD format", or use:
   ```
   new Date().toISOString().slice(0, 10)
   ```
3. If it's fiddly, skip it. The card just hides the date.

### 5.3 Add the HubSpot update step

1. Click **Add enrichment** (or **+ Add column > Add enrichment**), search **HubSpot** and choose **Update Company** (or **Create or Update Company**).
2. **Account:** your connected HubSpot account.
3. **Which company to update:** use the **HubSpot Company Record ID** column if your table came from HubSpot. That's the safest match. Otherwise match on **Company domain**.
4. **Map the fields.** For each row below, choose the HubSpot property on the left and the Clay column on the right:

| HubSpot property | Clay column |
| --- | --- |
| Account brief | `result` |
| What they do | `What_They_Do` |
| Site count | `Site_Count` |
| Site footprint | `Site_Footprint` |
| Typical site profile | `Typical_Site_Profile` |
| Operating model | `Operating_Model` |
| Ownership & structure | `Ownership_And_Structure` |
| Workforce | `Workforce` |
| Safety posture | `Safety_Posture` |
| Safety metrics | `Safety_Metrics` |
| Hazard profile | `Hazard_Profile` |
| Technology signals | `Technology_Signals` |
| Why Protex | `Why_Protex` |
| Land first | `Land_First` |
| Buying centre | `Buying_Centre` |
| Fit score | `Fit_Score` |
| Disqualifiers | `Disqualifiers` |
| Opening angle | `Opening_Angle` |
| Sources | `Sources` |
| Last enriched (Clay) | `Enriched date` *(optional)* |

5. **Header fields.** These are standard HubSpot fields. Map them only if Clay has better data than HubSpot already holds:

| HubSpot property | Clay column |
| --- | --- |
| Company name | company name |
| Website URL | website / domain |
| LinkedIn company page | LinkedIn URL |
| Number of employees | employee count (a plain number) |

6. Turn off **auto-run** for now and save.

---

## Part 6: Test with one company

1. In Clay, run the HubSpot update on **one row** only.
2. Open that company in HubSpot and click the **Account Intel** tab. You should see:
   - **Header:** logo, name, one-line summary, status tag, ownership tag, LinkedIn button and the fit score ring (8/10 shows as 80 on the ring).
   - **Key numbers:** employees, sites, fit score.
   - **Opening angle**, then **Friction and disqualifiers** (or a green "No disqualifiers identified").
   - **Tabs:** Brief, Call plan, Company, Sites, Safety, Tech, Sources.
   - **Footer:** the coverage bar, which should read 23 of 23 when everything is filled.
3. Check the **Pre-call brief** in the right sidebar.
4. If it looks right, run the rest of the table and turn auto-run back on.

### If something's wrong

| What you see | Cause and fix |
| --- | --- |
| No Account Intel card at all | The card isn't on the view (redo Part 4), or the build failed (check Development > Projects). |
| "No Clay enrichment yet" on an enriched company | The internal names don't match. Open **Settings > Properties**, search `clay_` and compare against the table in Part 2. |
| One section says "Not enriched yet" | That property is empty. Check its mapping in Part 5.3. |
| No fit score ring | `Fit_Score` doesn't start with a number. It must look like `8 — reason`. |
| Site count shows no number | `Site_Count` must start with the number or range (`47 — ...` or `30-40 — ...`). |
| Coverage bar below 23 | One or more fields are empty. The empty sections say "Not enriched yet". |

### How the cards lay out Clay's text

- `1. ... 2. ... 3. ...` (Why Protex) or `[1] ... [2] ...` (Sources) becomes a numbered list, even when written on one line.
- Separate lines, `-` or `•` bullets, or `;` separators become a bulleted list.
- Short comma-separated items (Hazard profile, Technology signals) become coloured tags.
- `Role: Title` lines (Buying centre) become a label and value list.
- `Safety_Metrics` = `Not found` shows a "No published safety metrics" tag with a prompt to ask about it.
- `Disqualifiers` = `None identified` shows green. Anything else shows an amber "Friction noted".
- Each Sources entry becomes a clickable link with its note underneath.
