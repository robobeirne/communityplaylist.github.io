# Order form card (deals)

One card on the deal captures everything the order form needs, for new business, renewals and expansions, and turns it into the order form itself: a HubSpot quote the client e-signs and Protex countersigns. Juro is only used to redline MSAs.

## What reps see

- **Summary:** order type, status (Draft, Ready to send, Sent or Signed), annual subscription, total contract value, overall discount, number of sites, and a "Ready to send" bar counting the required details.
- **Still needed before sending:** every missing item, listed under its section. Each section name is a link that opens that section. **Check these** flags anything that looks wrong:
  - the offer expires before the quote date;
  - the target signature date is after the offer expires;
  - an email address isn't valid;
  - a licence or camera quantity doesn't match the sites;
  - a unit price isn't the product's list price (a hidden discount);
  - a line is discounted 20% or more (needs approval);
  - a site goes live before the contract starts;
  - more than 20 sites (see below).
- **Three tabs**: **Order & client** (order and term, client and contacts), **Sites & products** (sites and rollout, products and pricing) and **Legal & signing**. Each title shows how many details are missing, or a ✓, and each tab lists what's missing at the top. Only you change tabs (or a "Still needed" link), so filling a field never moves you on. Most fields sit several to a row; products and sites keep a label on every field. The sections are:
  1. **Order and term.**
     - Order type, currency, quote date, offer expiry and target signature date.
     - Subscription term. For new business and expansions the order form states it as *N months from each Site's Deployment Date*, so a start date is optional (expected first Deployment Date, for forecasting). Renewals need a contract start date, and the end date is calculated.
     - Billing frequency, payment terms and auto-renewal.
     - For renewals: pro-rata and co-term.
  2. **Client and contacts.**
     - Legal entity name and address, with **Fill from the company**.
     - Registration number and VAT ID.
     - Client contact and billing contact, each filled from a deal contact.
     - Billing email (shows as **TBD** if blank, as the order form allows), billing address (**As legal entity address** if blank) and PO.
  3. **Sites and rollout.** All together or staged, then the site list: name, delivery address (devices ship there, DAP) and cameras per site, plus a go-live date for a staged rollout. There's no limit. Add sites one at a time, or **Paste a list of sites** (one per line, e.g. `Leeds DC, 12, 2027-02-01`; columns copied from a spreadsheet work too) and add them or replace the list.
  4. **Products and pricing.** The deal's HubSpot line items, edited in place:
     - **Add a product** lists the active products in the product library that have a price in the deal's currency, with that price. The quantity defaults from the sites: one licence per site, and the cameras added up across sites.
     - Each line shows the product, SKU, billing (per year or one-off), quantity, unit price, a discount (**% off** or **off per unit**), the net unit price and the line total. **Remove** takes it off on save; **Undo** brings it back.
     - Quick fixes on a line: **Match the sites (N)**, **Reset to list** (when the unit price was edited below list, it resets the price and shows the difference as a discount so the net doesn't change), and **Reprice at the GBP list price** for a line in the wrong currency.
     - A totals table: annual subscription at list, discounts, annual subscription, one-off fees, total contract value and the overall discount.
     - **Reason for the discounts**, required when any line is discounted.
  5. **Legal, MSA and signatures.**
     - **MSA status:** Existing MSA, Standard MSA (accepted by signing the order form), Negotiating in Juro, or Signed in Juro, with the MSA date where there is one. Notes for legal stay internal.
     - The counterparty signer, picked from a deal contact: that contact e-signs the quote.
     - The Protex countersignatory, picked from HubSpot users.
- **Save changes** saves what was typed and the line item changes (adds, edits, removals), plus the calculated fields: pricing table, annual subscription, discounts, one-off fees, total contract value, contract end date, site list and site schedule.
- **Order form quote** panel: **Create order form** stays disabled, showing how many details are left, until nothing required is missing and everything is saved. Then it creates the quote (see below) and shows its status, what to do next and links to it. **Preview the order form text** shows the Comments and Terms the quote will carry.

## Pricing: line items, list prices and per-line discounts

The line items on the deal are the pricing. The card doesn't keep a second copy, so the deal's **Line items** card, quotes, HubSpot's own ARR, ACV and TCV, and the order form always agree.

**The rules, enforced by the server function (not just the card):**
- New lines come from the product library, at the product's list price in the deal's currency. A product with no price in that currency can't be added.
- Reps can't type a unit price. An existing line's price can only be reset to list. Every discount sits on the line, as a % or an amount off each unit, so it's visible and reportable.
- Only line items on this deal can be changed or removed.
- **The deal's Amount follows the line items.** On save, Amount is set to the annual subscription after discounts, matching how existing Protex deals record Amount (the annual value, not the TCV). A deal with only one-off lines uses their total. A deal with no line items keeps whatever Amount the rep typed. The card shows the Amount it will set, and **Update the deal now** syncs it without other changes.
- Recurring lines are set to bill for the contract term from the billing start date (**Billing starts on**, or the contract start). That's what HubSpot uses for the line items' TCV, so the card updates any line that's out of step when it saves. If lines are out of step, the card says so and offers **Update them now**.

**Governance:**
- A discount needs a reason before the order form can be marked ready.
- A line discounted 20% or more is tagged **Needs approval** and listed under **Check these**. The threshold is `DISCOUNT_APPROVAL_PCT` in `src/app/cards/orderform/lines.ts`. Approval itself happens outside the card (see the decision in **The order form quote**).
- A unit price that isn't list (the hidden discounting found on existing deals) is flagged, with a one-click fix.
- A licence quantity that doesn't match the number of sites, or a camera quantity that doesn't match the cameras across sites, is flagged, with **Match the sites**.
- A line in a different currency from the deal blocks creating the order form.
- Deployment Services and On-site Installation default to one per site, and a mismatch with the sites is flagged.
- **New business deals get the free standard rows automatically, once:** Protex AI Licence - Intelligence (Free), Deployment Services (one per site) and Standard Support Services. They're tagged **Standard inclusion**. The card records that it added them (`of_standard_inclusions_added`), so a row a rep removes stays removed. The list is in `src/app/cards/orderform/inclusions.ts`.
- Free products (every price 0, or no price and "Free" in the name, like *Protex AI Licence - Intelligence (Free)*) are offered at 0 in every currency.

**The totals:**
- A line is quantity × unit price, minus its discount. A % is capped at 100% and an amount at the unit price.
- Recurring lines are annualised (monthly × 12, quarterly × 4). One-time lines are one-off fees.
- **Annual subscription** is the recurring lines after discount, per year.
- **Total contract value** is the annual subscription × term in years, plus one-off fees.
- **Overall discount** is all discounts as a share of list.
- **Contract end date** is the contract start date + term − 1 day. For example, a 24-month term from 1 Jan 2027 ends on 31 Dec 2028.

The calculated deal fields are written when the card saves. If someone edits line items elsewhere, the deal fields update the next time the card is saved.

## The order form quote

**Create order form** makes a HubSpot quote from the deal:
- **Line items:** copied from the deal on the server, so the quote shows exactly the pricing the card checked.
- **Expiry:** "Offer expires on".
- **Title:** "*deal name* | Order form", in the deal's currency.
- **Template:** the one you pick. The card picks a template with "order form" in its name if there is one.
- **People:** the counterparty signer as the contact who signs, the deal's company, and you as the sender.
- **E-signature:** switched on.
- **Comments to buyer**, laid out like the order form:
  - quote date and offer expiry;
  - **Client Details** (legal entity name and address, Attn, contact email);
  - **Billing Details** (billing email or TBD, billing address or "As legal entity address", VAT number, PO);
  - **Subscription Term** ("12 months from each Site's Deployment Date");
  - the **Notes**: Edge Device lease, cameras per site (e.g. "15 Camera Integrations per Site"), camera limits;
  - **Site Information**: each site with its address and cameras.
- **Terms**: the order form's Terms and Conditions (sections 1–7), word for word. Only these parts change by deal:
  - billing frequency (3C);
  - payment terms (3D, e.g. Net 30);
  - auto-renewal (section 4). It's on by default, as on the standard form. Switching it off leaves the clause out and warns.

Every quote template shows the Comments and Terms fields, so no template tokens are needed.

The quote is created as a **draft**. Open it, check it, add the Protex countersignatory, then publish it and send it for e-signature. The card shows the quote's state: Quote draft, Awaiting approval, Sent for signature, Signed, Expired or Rejected.

**The card's status follows the quote.** Each time anyone opens the card, it reads the order form quote:
- a draft or awaiting-approval quote is **Ready to send**;
- a published quote is **Sent**;
- a fully signed quote is **Signed**, and its signed date goes in `of_signed_at`;
- an expired or rejected quote puts the order form back to **Draft**.

To move the deal stage the moment a quote is signed, add a HubSpot workflow on the quote being signed.

**One live quote at a time.** Creating the order form is blocked while the deal has any live quote (draft, awaiting approval, sent or signed), including one made by hand. Expired and rejected quotes don't block.

**Changing the order form after the quote exists.** The quote is a copy taken when it was made. Edit the fields on the card, save, then use the button under the quote:
- **Replace the draft quote** (draft): deletes the draft and its line item copies and makes a fresh one.
- **Create a new version** (sent or awaiting approval): expires the current quote, so the client's link stops accepting signatures, and keeps it on the deal as a record. It then makes a new draft titled "… v2", "… v3".
- **Signed:** can't be replaced. Changes after signature need a new deal (an expansion or amendment) with its own order form.

If the card saves changes after the quote exists, it flags that the quote is out of date and highlights the button.

**Legal settings** live in `src/app/cards/orderform/legal.ts`:
- `PROTEX_ENTITY` is "Protex AI Limited" and `STANDARD_MSA_URL` is "www.protex.ai/legal", both taken from the current order form.

## MSAs and Juro

- **Existing MSA:** the order form is governed by it. Enter its date.
- **Standard MSA:** the order form links to the standard MSA, and signing the order form accepts it.
- **Negotiating in Juro:** redline the MSA in Juro. The order form can't be created until the MSA is signed. Then set **Signed in Juro** and enter its date, and the order form refers to it.

Older deals that answered "Is there an existing MSA? Yes" are read as **Existing MSA**.

## More than 20 sites

There's no limit on sites. The card keeps the full list in `of_sites` and writes every site to the **site schedule** (`of_site_schedule`), one line each: name, camera integrations and go-live date. Sites 1–20 are also copied to the numbered site fields for templates that list sites one by one. Above 20 sites, the card notes that only the site schedule has every site; the order form quote always uses the site schedule. **# of Sites for this Deal** is set from the list, and licence quantities are checked against it.

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
- a pricing table for documents and reports;
- an open-ended site list with paste-in;
- status, with who marked it ready and when.

## Field reference

Every order form property, for reports, workflows and any document template. `of_pricing_table` is one line per product (name (SKU), quantity × unit price, discount, net); `of_site_schedule` is every site, one line each. The line items themselves are the source of truth for pricing.

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
| `of_total_contract_value` | Total contract value (order form) | number |
| `amount` (existing) | Amount: the annual subscription after discounts | existing |
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
| `of_msa_status` | MSA status | enumeration |
| `of_existing_msa` | Is there an existing MSA? (old, replaced by MSA status) | enumeration |
| `of_msa_details` | MSA details or link | string |
| `of_msa_date` | MSA date | date |
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
| `of_status` | Order form status: Draft, Ready to send, Sent, Signed | enumeration |
| `of_ready_at` | Order form created at | datetime |
| `of_ready_by` | Order form created by | string |
| `of_quote_id` | Order form quote ID | string |
| `of_quote_status` | Order form quote status | enumeration |
| `of_changed_after_quote` | Order form changed after the quote was created | bool |
| `of_standard_inclusions_added` | Standard inclusions added | bool |
| `of_signed_at` | Order form signed at | datetime |

The dropdowns store values like `annually_in_advance` and show labels like "Annually in advance".

## Set it up

From the `protex-account-intel` folder:

1. **Create the new properties and update the changed ones.** Make a temporary HubSpot **service key** with `crm.schemas.deals.write`, then:
   ```
   read -s HUBSPOT_TOKEN
   export HUBSPOT_TOKEN
   node scripts/create-deal-properties.mjs src/app/cards/orderform/properties.json
   node scripts/create-deal-properties.mjs src/app/cards/orderform/properties.json --fix of_status,of_ready_at,of_ready_by,of_msa_date,of_existing_msa,of_legal_notes,of_counterparty_signer_contact_id,of_protex_signer_user_id
   unset HUBSPOT_TOKEN
   ```
   The first command creates any properties that don't exist yet: `of_msa_status`, `of_quote_id`, `of_quote_status`, `of_changed_after_quote`, `of_standard_inclusions_added` and `of_signed_at`. It skips the rest, so it's safe to run again. The second updates the status options (Draft, Ready to send, Sent, Signed; the old Juro values are kept hidden) and the changed labels. Delete the service key afterwards.
2. **Upload:**
   ```
   cd src/app/cards && npm install && cd ../../..
   hs project upload
   ```
3. **Reinstall the app.** It now also reads and creates quotes (`crm.objects.quotes.read`, `crm.objects.quotes.write`). Go to **Development > Projects > protex-account-intel > Protex Account Intel > Distribution** and reinstall it.
4. **Quote template:** build one that shows Comments to buyer, the line items, Terms and e-signature. Name it with "order form" in it so the card picks it by default. [QUOTE-TEMPLATE.md](QUOTE-TEMPLATE.md) lists everything the card fills in and the columns to use.
5. **Product library:** *Standard Support Services* (SKU 13/SUPPORT, 0, annual) was created on 18 Nov 2026 for the free standard rows.
6. **Legal:** the terms are the current order form wording, with no draft notice. When legal changes the wording, update `src/app/cards/orderform/terms.ts` and upload again.
7. **Optional:** a workflow on the quote being signed, to move the deal stage straight away.
8. **Optional tidy-up:** the first version's per-product pricing properties (`of_safety_units`, `of_safety_unit_fee`, `of_cameras_*`, `of_ops_*`, `of_intel_*`, `of_hardware_*`, `of_implementation_fee`, `of_discount_applied`, `of_discount_type`, `of_discount_value`, `of_*_units_manual`, `of_*_total`) and `of_existing_msa` are no longer used. Archive them in **Settings > Properties**.

## Changing the fields

Edit `scripts/build-order-form-properties.py`, then run:
```
python3 scripts/build-order-form-properties.py src/app/cards/orderform/properties.json
```
Then create any new properties (step 1) and upload. Required fields, sites and the totals live in `src/app/cards/orderform/calc.ts`; line item arithmetic, checks and the approval threshold in `src/app/cards/orderform/lines.ts`; the order form wording in `src/app/cards/orderform/terms.ts`; legal settings in `src/app/cards/orderform/legal.ts`.

## Develop

```
cd src/app/cards
npm test              # includes the order form line items, totals, sites and readiness checks
npm run test:render   # includes walking the order form card
cd ../../..
node --test tests/save-order-form.test.mjs
```
