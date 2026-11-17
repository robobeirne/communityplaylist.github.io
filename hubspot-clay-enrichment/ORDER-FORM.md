# Order form card (deals)

One card on the deal captures everything the order form and MSA need, for new business, renewals and expansions. It saves it all as deal properties, so Juro can pull it into the contract through its HubSpot integration. Edits and approvals then happen in Juro.

## What reps see

- **Summary:** order type, status (Draft, Ready for Juro, Sent to Juro or Signed), annual subscription, total contract value, overall discount, number of sites, and a "Ready for Juro" bar counting the required details.
- **Still needed before Juro:** every missing item, listed under its section. Each section name is a link that opens that section. **Check these** flags anything that looks wrong:
  - the offer expires before the quote date;
  - the target signature date is after the offer expires;
  - an email address isn't valid;
  - a licence or camera quantity doesn't match the sites;
  - a unit price isn't the product's list price (a hidden discount);
  - a line is discounted 20% or more (needs approval);
  - a site goes live before the contract starts;
  - more than 20 sites (see below).
- **Five sections**, each showing what's left to fill. Sections with gaps start open and complete ones start closed:
  1. **Order and term.**
     - Order type, currency, quote date, offer expiry and target signature date.
     - Contract start (live) date and term, with the end date calculated.
     - Billing frequency, payment terms and auto-renewal.
     - For renewals: pro-rata and co-term.
  2. **Client and contacts.**
     - Legal entity name and address, with **Fill from the company**.
     - Registration number and VAT ID.
     - Client contact and billing contact, each filled from a deal contact.
     - Billing email, billing address and PO.
  3. **Sites and rollout.** All together or staged, then the site list: name and cameras per site, plus a go-live date for a staged rollout. There's no limit. Add sites one at a time, or **Paste a list of sites** (one per line, e.g. `Leeds DC, 12, 2027-02-01`; columns copied from a spreadsheet work too) and add them or replace the list.
  4. **Products and pricing.** The deal's HubSpot line items, edited in place:
     - **Add a product** lists the active products in the product library that have a price in the deal's currency, with that price. The quantity defaults from the sites: one licence per site, and the cameras added up across sites.
     - Each line shows the product, SKU, billing (per year or one-off), quantity, unit price, a discount (**% off** or **off per unit**), the net unit price and the line total. **Remove** takes it off on save; **Undo** brings it back.
     - Quick fixes on a line: **Match the sites (N)**, **Reset to list** (when the unit price was edited below list, it resets the price and shows the difference as a discount so the net doesn't change), and **Reprice at the GBP list price** for a line in the wrong currency.
     - A totals table: annual subscription at list, discounts, annual subscription, one-off fees, total contract value and the overall discount.
     - **Reason for the discounts**, required when any line is discounted.
  5. **Legal, MSA and signatures.**
     - Existing MSA (details or link and date if yes) and notes for legal.
     - The counterparty signer, picked from a deal contact.
     - The Protex signatory, picked from HubSpot users.
- **Save changes** saves what was typed and the line item changes (adds, edits, removals), plus the calculated fields: pricing table, annual subscription, discounts, one-off fees, total contract value, contract end date, site list and site schedule.
- **Mark ready for Juro** is always visible. It stays disabled, showing how many details are left, until nothing required is missing and everything is saved. It records who marked it and when. If anything changes afterwards, the status goes back to Draft.

## Pricing: line items, list prices and per-line discounts

The line items on the deal are the pricing. The card doesn't keep a second copy, so the deal's **Line items** card, quotes, HubSpot's own ARR, ACV and TCV, and the order form always agree.

**The rules, enforced by the server function (not just the card):**
- New lines come from the product library, at the product's list price in the deal's currency. A product with no price in that currency can't be added.
- Reps can't type a unit price. An existing line's price can only be reset to list. Every discount sits on the line, as a % or an amount off each unit, so it's visible and reportable.
- Only line items on this deal can be changed or removed.
- Recurring lines are set to bill for the contract term from the billing start date (**Billing starts on**, or the contract start). That's what HubSpot uses for the line items' TCV, so the card updates any line that's out of step when it saves. If lines are out of step, the card says so and offers **Update them now**.

**Governance:**
- A discount needs a reason before the order form can be marked ready.
- A line discounted 20% or more is tagged **Needs approval** and listed under **Check these**. The threshold is `DISCOUNT_APPROVAL_PCT` in `src/app/cards/orderform/lines.ts`. Approval itself happens in Juro.
- A unit price that isn't list (the hidden discounting found on existing deals) is flagged, with a one-click fix.
- A licence quantity that doesn't match the number of sites, or a camera quantity that doesn't match the cameras across sites, is flagged, with **Match the sites**.
- A line in a different currency from the deal blocks **Ready for Juro**.

**The totals:**
- A line is quantity × unit price, minus its discount. A % is capped at 100% and an amount at the unit price.
- Recurring lines are annualised (monthly × 12, quarterly × 4). One-time lines are one-off fees.
- **Annual subscription** is the recurring lines after discount, per year.
- **Total contract value** is the annual subscription × term in years, plus one-off fees.
- **Overall discount** is all discounts as a share of list.
- **Contract end date** is the contract start date + term − 1 day. For example, a 24-month term from 1 Jan 2027 ends on 31 Dec 2028.

The calculated deal fields are written when the card saves. If someone edits line items elsewhere, the deal fields update the next time the card is saved. Map Juro to the card's fields, and only create the contract once the order form is **Ready for Juro**.

## More than 20 sites

There's no limit on sites. The card keeps the full list in `of_sites` and writes every site to the **site schedule** (`of_site_schedule`), one line each: name, camera integrations and go-live date. Sites 1–20 are also copied to the numbered site fields for templates that list sites one by one. Above 20 sites, the card warns that the Juro template should use the site schedule. **# of Sites for this Deal** is set from the list, and licence quantities are checked against it.

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
| Unit Number / Unit Fee for Platform Site License; Safety Pack Total Fee | A line item for the site licence product: quantity, list price, discount, net. Summed into `of_pricing_table` |
| Camera Integrations Unit Number / Unit Fee / Total Fee | A line item for the camera product |
| Camera Integrations per site | Cameras per site in the site list. Their total is checked against the camera line's quantity |
| How many sites | Existing **# of Sites for this Deal** (`number_of_sites_to_start`), set from the site list |
| Site names 1, 2, 3… | The site list (`of_sites`, no limit), the site schedule, and `of_site_N_name` for N = 1–20 |
| Does this renewal involve an Operations License | A line item for the Operations licence product, on any order type |
| Are they purchasing Protex Intelligence | A line item for the Intelligence product |
| Total Annual Subscription Fee | `of_annual_subscription_fee` (calculated, after discount) |
| Total Contract Value | `of_total_contract_value` (calculated) |
| Is there an existing MSA | `of_existing_msa` (Yes, No or Not sure) |
| Details or a link of the MSA | `of_msa_details`, plus `of_msa_date` |
| Is there a discount being applied? | A discount on each line item, `of_discount_amount` and `of_discount_pct` (calculated), and a required reason `of_discount_reason` |
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
- products drawn from the product library at list price, with a discount per line and approval flags;
- a pricing table for Juro;
- an open-ended site list with paste-in;
- status, with who marked it ready and when.

## Juro mapping

In Juro, map each template smartfield to the HubSpot deal property below. For the price table, map `of_pricing_table`: one line per product, as name (SKU), quantity × unit price, discount and net. For the site table, map `of_site_schedule`: every site, one line each. If your Juro templates can read HubSpot line items directly, they can use those instead, since the line items are the source of truth. The Juro side of the setup belongs to whoever owns the templates; this table is what they need.

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
| `of_pricing_table` | Pricing table | string |
| `of_discount_reason` | Reason for the discounts | string |
| `of_annual_list_fee` | Annual subscription before discount | number |
| `of_discount_amount` | Discount per year | number |
| `of_discount_pct` | Overall discount % | number |
| `of_annual_subscription_fee` | Total annual subscription fee | number |
| `of_one_off_fees` | One-off fees | number |
| `of_total_contract_value` | Total contract value | number |
| Line items (HubSpot) | Product, SKU, quantity, unit price, discount, net price, billing frequency and term | line items |

**Sites**

| HubSpot property | Label | Type |
| --- | --- | --- |
| `of_rollout` | Rollout | enumeration |
| `of_site_schedule` | Site schedule (every site) | string |
| `of_sites` | Site list (card data, JSON) | string |
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

1. **Create the order form properties (104).** Run the same command as before: it skips the ones that exist and creates the three new ones (`of_sites`, `of_pricing_table`, `of_discount_pct`). This needs a private app token with `crm.schemas.deals.write`:
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
3. **Reinstall the app.** It now reads products and reads and writes line items (`e-commerce`, `crm.objects.line_items.read`, `crm.objects.line_items.write`). Go to **Development > Projects > protex-account-intel > Protex Account Intel > Distribution** and reinstall it. Until you do, the Products section shows "Couldn't load the line items".
4. **Add the card** if it isn't there yet: **Settings > Objects > Deals > Record customization**, add an **Order form** tab with the **Order form** card.
5. **Optional:** add job titles to the people who sign for Protex (**Settings > Users**). Until then, a title typed once is remembered from that signatory's last order form.
6. **Optional tidy-up:** the first version's per-product pricing properties (`of_safety_units`, `of_safety_unit_fee`, `of_cameras_*`, `of_ops_*`, `of_intel_*`, `of_hardware_*`, `of_implementation_fee`, `of_discount_applied`, `of_discount_type`, `of_discount_value`, `of_*_units_manual`, `of_*_total`) are no longer used. Archive them in **Settings > Properties** once nothing in Juro points at them.

## Changing the fields

Edit `scripts/build-order-form-properties.py`, then run:
```
python3 scripts/build-order-form-properties.py src/app/cards/orderform/properties.json
```
Then create any new properties (step 1) and upload. Required fields, sites and the totals live in `src/app/cards/orderform/calc.ts`; line item arithmetic, checks and the approval threshold in `src/app/cards/orderform/lines.ts`.

## Develop

```
cd src/app/cards
npm test              # includes the order form line items, totals, sites and readiness checks
npm run test:render   # includes walking the order form card
cd ../../..
node --test tests/save-order-form.test.mjs
```
