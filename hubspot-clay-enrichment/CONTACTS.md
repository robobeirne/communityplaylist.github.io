# Contact profile cards (Clay person research)

Two cards on the contact record, filled from your Clay person research:

- **Profile summary** (middle column tab): name, title and company. Tags for likely deal role, buying authority and profile currency, plus a LinkedIn button. A "How to approach them" callout. Six tabs: **Brief** (the 250-350 word narrative), **Role** (current role, scope and remit, reporting line), **Deal role** (likely deal role, buying authority), **What they care about** (stated priorities, public voice, posture on technology), **Background** (career history, credentials) and **Reach out** (personalisation hooks, paths in, footprint assessment). A coverage bar at the bottom shows how many of the 16 data points Clay filled.
- **Before you reach out** (right sidebar): deal role, authority and currency tags, the approach notes, then the top 3 hooks, stated priorities and paths in.

On contacts Clay hasn't researched, both cards shrink to one line.

The three header tags take the first few words of each answer. Ask Clay to **start each of these with a short label**, then explain:

- Likely Deal Role: `Champion — owns the safety programme and…`
- Buying Authority: `Influencer — recommends; the COO signs.`
- Profile Currency: `Current — LinkedIn updated last month.`

Lists (hooks, paths in, priorities) read best one per line or numbered.

## Clay field to HubSpot property

All are **Multi-line text** contact properties in a **Clay contact profile** group.

| Clay field | HubSpot property | Internal name |
| --- | --- | --- |
| `result` (narrative brief) | Profile brief | `clay_contact_brief` |
| Current Role | Current role | `clay_contact_current_role` |
| Career History | Career history | `clay_contact_career_history` |
| Background and Credentials | Background and credentials | `clay_contact_background_credentials` |
| Profile Currency | Profile currency | `clay_contact_profile_currency` |
| Scope and Remit | Scope and remit | `clay_contact_scope_remit` |
| Reporting Line | Reporting line | `clay_contact_reporting_line` |
| Public Voice | Public voice | `clay_contact_public_voice` |
| Stated Priorities | Stated priorities | `clay_contact_stated_priorities` |
| Posture on Technology | Posture on technology | `clay_contact_technology_posture` |
| Likely Deal Role | Likely deal role | `clay_contact_likely_deal_role` |
| Buying Authority | Buying authority | `clay_contact_buying_authority` |
| Personalisation Hooks | Personalisation hooks | `clay_contact_personalisation_hooks` |
| Approach Notes | Approach notes | `clay_contact_approach_notes` |
| Paths In | Paths in | `clay_contact_paths_in` |
| Footprint Assessment | Footprint assessment | `clay_contact_footprint_assessment` |
| *(optional)* today's date | Last enriched (Clay) | `clay_contact_last_enriched` (date) |

The header uses HubSpot's own `firstname`, `lastname`, `jobtitle`, `company` and `hs_linkedin_url` (or `linkedin_url`).

## Set it up

From the `protex-account-intel` folder:

1. **Create the properties.** Make a private app with the **`crm.schemas.contacts.write`** scope and copy its token, then run:
   ```
   read -s HUBSPOT_TOKEN
   ```
   Paste the token and press Enter. Then run:
   ```
   export HUBSPOT_TOKEN
   node scripts/create-contact-properties.mjs
   unset HUBSPOT_TOKEN
   ```
   Delete the private app afterwards.
2. **Upload:** `hs project upload`.
3. **Reinstall the app.** It now also reads contacts. Go to **Development > Projects > protex-account-intel > Protex Account Intel > Distribution** and reinstall. Until you do, the contact cards won't appear in the card library.
4. **Add the cards:** go to **Settings > Objects > Contacts > Record customization > Default view**. Add a **Profile** tab with the **Profile summary** card, and put **Before you reach out** at the top of the right sidebar.
5. **Map Clay:** in your person-research table, use **Add as column** on each JSON field, then add a **HubSpot > Update Contact** step matched on the contact's HubSpot record ID (or email). Map each column using the table above. Run it on one row and check the contact.
