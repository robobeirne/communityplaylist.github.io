# Order form card (deals)

One card on the deal captures everything the order form and MSA need, for new business, renewals and expansions. It saves it all as deal properties, so Juro can pull it into the contract through its HubSpot integration. Edits and approvals then happen in Juro.

## What reps see

- **Summary:** order type, status (Draft, Ready for Juro, Sent to Juro or Signed), annual subscription, total contract value, term, and a "Ready for Juro" bar counting the required details.
- **Still needed before Juro:** what's missing, counted by section. **Check these** flags anything that looks wrong:
  - the offer expires before the quote date;
  - the target signature date is after the offer expires;
  - an email address isn't valid;
  - cameras per site don't add up to the camera integrations priced;
  - a site goes live before the contract starts.
- **Five sections**, each showing what's left to fill:
  1. **Client and contacts.**
     - Legal entity name and address, with **Fill from the company**.
     - Registration number and VAT ID.
     - Client contact and billing contact, each filled from a deal contact.
     - Billing email, billing address and PO.
  2. **Order and term.**
     - Order type, currency, quote date, offer expiry and target signature date.
     - Contract start (live) date and term, with the end date calculated.
     - Billing frequency, payment terms and auto-renewal.
     - For renewals: pro-rata and co-term.
  3. **Pricing.**
     - Site licences (Safety Pack) and camera integrations as units × fee.
     - Tick to add an Operations License, Protex Intelligence or hardware.
     - Implementation fee.
     - Discount (percentage or a fixed amount a year) with a reason.
     - A totals table.
  4. **Sites and rollout.** Number of sites, then each site's name and cameras. For a staged rollout, each site also gets a go-live date.
  5. **Legal, MSA and signatures.**
     - Existing MSA (details or link and date if yes) and notes for legal.
     - The counterparty signer, picked from a deal contact.
     - The Protex signatory, picked from HubSpot users.
- **Save changes** saves what was typed, plus the calculated fields: line totals, annual subscription, discount, one-off fees, total contract value, contract end date and site schedule.
- **Mark ready for Juro** appears only when nothing required is missing. It records who marked it and when. If anything changes afterwards, the status goes back to Draft.

## How the totals work

- Each line is units × fee per unit.
- **Annual subscription** is site licences + camera integrations + Operations License + Protex Intelligence + hardware (when billed annually), minus the discount.
- The **discount** applies to the annual subscription only, never to one-off fees. A percentage is capped at 100% and a fixed amount at the annual total.
- **One-off fees** are the implementation fee plus hardware (when billed one-off).
- **Total contract value** is the annual subscription × term in years, plus one-off fees.
- **Contract end date** is the contract start date + term − 1 day. For example, a 24-month term from 1 Jan 2027 ends on 31 Dec 2028.

The calculated fields are written when the card saves. If someone edits pricing from the deal's property sidebar instead, the totals update the next time the card is saved. Map Juro to the card's totals, and only create the contract once the order form is **Ready for Juro**.

## How your field list maps

| Your field | Now |
| --- | --- |
| Client's legal entity name | `of_client_legal_name` (also the MSA's "full legal company name of the counterparty") |
| Client's legal entity address | `of_client_legal_address` |
| Name of the Client contact | `of_client_contact_name` (filled from a deal contact) |
| Client's contact email address | `of_client_contact_email` |
| Client's contact email for billing | Existing **Client's Email for Invoicing?** (`client_s_email_for_invoicing_`) |
| Date of this quote | `of_quote_date` |
| When will this offer expire | `of_offer_expiry_date` |
| Target signature date | `of_target_signature_date` |
| Additional notes for legal (listed twice) | One field: `of_legal_notes` |
| Currency of this order | Existing **Currency** (`deal_currency_code`) |
| Unit Number / Unit Fee for Platform Site License; Safety Pack Total Fee | `of_safety_units`, `of_safety_unit_fee`, `of_safety_total` (calculated) |
| Camera Integrations Unit Number / Unit Fee / Total Fee | `of_cameras_units`, `of_cameras_unit_fee`, `of_cameras_total` (calculated) |
| Camera Integrations per site | `of_site_N_cameras`, checked against the priced total |
| How many sites | Existing **# of Sites for this Deal** (`number_of_sites_to_start`) |
| Site names 1, 2, 3… | `of_site_N_name`, for N = 1–20 |
| Does this renewal involve an Operations License | `of_ops_included`, plus its own price line. It applies to any order type, not just renewals |
| Are they purchasing Protex Intelligence | `of_intel_included`, plus its own price line |
| Total Annual Subscription Fee | `of_annual_subscription_fee` (calculated, after discount) |
| Total Contract Value | `of_total_contract_value` (calculated) |
| Is there an existing MSA | `of_existing_msa` (Yes, No or Not sure) |
| Details or a link of the MSA | `of_msa_details`, plus `of_msa_date` |
| Is there a discount being applied? | `of_discount_applied`, plus type, amount and a required reason |
| Signatory (Protex), with email and job title | `of_protex_signer_user_id`, `_name`, `_email`, `_title`, filled from the HubSpot user |
| Signer name, email and job title; counterparty job title | `of_counterparty_signer_name`, `_email`, `_title`, filled from a deal contact |

**Added, because they were missing:**
- contract start (live) date, which reuses the existing **Contract Start Date**;
- contract term (existing) and the calculated end date;
- billing start, if different (existing **Subscription start date**);
- billing frequency, payment terms, PO and auto-renewal;
- staged rollout with a go-live date per site, and a generated site schedule;
- company registration number and VAT ID;
- a billing contact and address;
- one-off implementation and hardware fees;
- status, with who marked it ready and when.

## Juro mapping

In Juro, map each template smartfield to the HubSpot deal property below. For a site table, map `of_site_schedule`: one line per site, as name, camera integrations and go-live date. Or map the numbered site fields one by one. The Juro side of the setup belongs to whoever owns the templates; this table is what they need.

**Order**

| HubSpot property | Label | Type |
| --- | --- | --- |
| `of_order_type` | Order type | enumeration |
| `of_quote_date` | Date of this quote | date |
| `of_offer_expiry_date` | Offer expires on | date |
| `of_target_signature_date` | Target signature date | date |
| `of_contract_end_date` | Contract end date | date |
| `of_billing_frequency` | Billing frequency | enumeration |
| `of_payment_terms` | Payment terms | enumeration |
| `of_po_required` | Client needs a PO before invoicing | bool |
| `of_auto_renew` | Auto-renews at the end of the term | bool |
| `deal_currency_code` (existing) | Currency | existing |
| `contract_start_date` (existing) | Contract start (live) date | existing |
| `term_year_length` (existing) | Contract term | existing |
| `subscription_start_date` (existing) | Billing starts on | existing |
| `pro_rata_renewal` (existing) | Pro-rata renewal? | existing |
| `coterm_site_renewals` (existing) | Co-term site renewals? | existing |

**Client**

| HubSpot property | Label | Type |
| --- | --- | --- |
| `of_client_legal_name` | Client's legal entity name | string |
| `of_client_legal_address` | Client's legal entity address | string |
| `of_client_company_number` | Company registration number | string |
| `of_client_tax_id` | VAT / tax ID | string |
| `of_client_contact_name` | Client contact name | string |
| `of_client_contact_email` | Client contact email | string |
| `of_client_contact_title` | Client contact job title | string |
| `of_billing_contact_name` | Billing contact name | string |
| `of_billing_address` | Billing address (if different) | string |
| `client_s_email_for_invoicing_` (existing) | Billing email | existing |
| `purchase_order` (existing) | PO number | existing |

**Pricing**

| HubSpot property | Label | Type |
| --- | --- | --- |
| `of_ops_included` | Includes an Operations License | bool |
| `of_intel_included` | Includes Protex Intelligence | bool |
| `of_safety_units` | Protex AI Platform Site License (Safety Pack) — units | number |
| `of_safety_unit_fee` | Protex AI Platform Site License (Safety Pack) — annual fee per unit | number |
| `of_safety_total` | Protex AI Platform Site License (Safety Pack) — annual total | number |
| `of_cameras_units` | Camera integrations — units | number |
| `of_cameras_unit_fee` | Camera integrations — annual fee per unit | number |
| `of_cameras_total` | Camera integrations — annual total | number |
| `of_ops_units` | Operations License — units | number |
| `of_ops_unit_fee` | Operations License — annual fee per unit | number |
| `of_ops_total` | Operations License — annual total | number |
| `of_intel_units` | Protex Intelligence — units | number |
| `of_intel_unit_fee` | Protex Intelligence — annual fee per unit | number |
| `of_intel_total` | Protex Intelligence — annual total | number |
| `of_hardware_included` | Includes hardware / edge devices | bool |
| `of_hardware_units` | Hardware / edge devices — units | number |
| `of_hardware_unit_fee` | Hardware / edge devices — fee per unit | number |
| `of_hardware_billing` | Hardware / edge devices — billed | enumeration |
| `of_hardware_total` | Hardware / edge devices — total | number |
| `of_implementation_fee` | Implementation / onboarding fee (one-off) | number |
| `of_discount_applied` | Is a discount being applied? | bool |
| `of_discount_type` | Discount type | enumeration |
| `of_discount_value` | Discount | number |
| `of_discount_reason` | Reason for the discount | string |
| `of_discount_amount` | Discount per year | number |
| `of_annual_list_fee` | Annual subscription before discount | number |
| `of_annual_subscription_fee` | Total annual subscription fee | number |
| `of_one_off_fees` | One-off fees | number |
| `of_total_contract_value` | Total contract value | number |

**Sites**

| HubSpot property | Label | Type |
| --- | --- | --- |
| `of_rollout` | Rollout | enumeration |
| `of_site_schedule` | Site schedule | string |
| `of_site_N_name` (N = 1–20) | Site N — name | string |
| `of_site_N_cameras` (N = 1–20) | Site N — camera integrations | number |
| `of_site_N_go_live` (N = 1–20) | Site N — go-live date | date |
| `number_of_sites_to_start` (existing) | Number of sites | existing |

**Legal & MSA**

| HubSpot property | Label | Type |
| --- | --- | --- |
| `of_existing_msa` | Is there an existing MSA? | enumeration |
| `of_msa_details` | MSA details or link | string |
| `of_msa_date` | Existing MSA date | date |
| `of_legal_notes` | Notes for legal | string |
| `of_counterparty_signer_name` | Counterparty signer name | string |
| `of_counterparty_signer_email` | Counterparty signer email | string |
| `of_counterparty_signer_title` | Counterparty signer job title | string |
| `of_counterparty_signer_contact_id` | Counterparty signer contact ID | string |
| `of_protex_signer_user_id` | Protex signatory (user ID) | string |
| `of_protex_signer_name` | Protex signatory name | string |
| `of_protex_signer_email` | Protex signatory email | string |
| `of_protex_signer_title` | Protex signatory job title | string |

**Status**

| HubSpot property | Label | Type |
| --- | --- | --- |
| `of_status` | Order form status | enumeration |
| `of_ready_at` | Marked ready for Juro at | datetime |
| `of_ready_by` | Marked ready for Juro by | string |

The dropdowns store values like `annually_in_advance` and show labels like "Annually in advance". If Juro shows the stored value rather than the label, map the smartfield to the label, or use a Juro text smartfield.

## Set it up

From the `protex-account-intel` folder:

1. **Create the 124 order form properties.** This needs a private app token with `crm.schemas.deals.write`:
   ```
   read -s HUBSPOT_TOKEN
   export HUBSPOT_TOKEN
   node scripts/create-deal-properties.mjs src/app/cards/orderform/properties.json
   unset HUBSPOT_TOKEN
   ```
   Delete the private app afterwards.
2. **Upload:**
   ```
   cd src/app/cards && npm install && cd ../../..
   hs project upload
   ```
3. **Reinstall the app.** It now also reads HubSpot users (`crm.objects.users.read`) for the signatory list. Go to **Development > Projects > protex-account-intel > Protex Account Intel > Distribution** and reinstall it.
4. **Add the card:** go to **Settings > Objects > Deals > Record customization**. Add an **Order form** tab with the **Order form** card.
5. **Optional:** add job titles to the people who sign for Protex (**Settings > Users**, open the user). The card then fills their title automatically. Until then, a title typed once is remembered from that signatory's last order form.

## Changing the fields

Edit `scripts/build-order-form-properties.py`, then run:
```
python3 scripts/build-order-form-properties.py src/app/cards/orderform/properties.json
```
Then create any new properties (step 1) and upload. Required fields and the totals live in `src/app/cards/orderform/calc.ts`.

## Develop

```
cd src/app/cards
npm test              # includes the order form totals and readiness checks
npm run test:render   # includes walking the order form card
cd ../../..
node --test tests/save-order-form.test.mjs
```
