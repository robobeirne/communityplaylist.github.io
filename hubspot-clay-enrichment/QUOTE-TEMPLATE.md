# Order form quote template: what the card fills in

The order form card's **Create order form** button creates a HubSpot quote. Use this page when building the quote template it uses.

**Name the template with "order form" in it** (for example "Protex Order Form") so the card picks it by default.

## What the quote carries

The card fills these quote fields. The template only has to display them; no personalisation tokens are needed.

| Quote field | What the card puts in it |
| --- | --- |
| Title | "*Deal name* \| Order form" |
| Expiration date | The order form's **Offer expires on** date |
| Currency | The deal's currency |
| **Comments to buyer** | The top half of the order form (see below) |
| **Terms** | The Terms and Conditions, sections 1–7 (see below) |
| E-signature | Switched on. The client signer is the quote's contact; the rep adds the Protex countersigner before publishing |
| Sender | The rep creating it, with company "Protex AI Limited" |
| Contact | The counterparty signer (who e-signs) |
| Company | The deal's company |
| Line items | Copies of the deal's line items |

**Comments to buyer** contains, in this order:
1. Quote Date and Offer Expiry Date.
2. **Client Details:** Legal Entity Name, Legal Entity Address, Company Number (if any), Attn, Contact Email.
3. **Billing Details:** Billing Email (or TBD), Billing Address (or "As legal entity address"), Billing Contact, VAT Number and Purchase Order (if any).
4. **Subscription Term**, e.g. "12 months from each Site's Deployment Date".
5. **Notes:**
   - the Edge Device lease;
   - cameras per site, e.g. "15 Camera Integrations per Site";
   - camera limits.
6. **Site Information:** every site, with its delivery address and cameras.

**Terms** contains the Terms and Conditions 1A–7B, word for word from the current order form. Three parts vary by deal:
- billing frequency (3C);
- payment terms (3D);
- auto-renewal (section 4, left out if switched off).

Until legal confirms, the terms start with "DRAFT TERMS: NOT YET APPROVED BY LEGAL".

## Sections to put in the template, top to bottom

1. **Header:** logo, "ORDER FORM", quote date and expiration date.
2. **Comments to buyer:** Client Details, Billing Details, Subscription Term, Notes and Site Information all come from here.
3. **Line items**, with these columns to match the current order form:

   | Order form column | Line item field |
   | --- | --- |
   | Item | Name |
   | Unit # | Quantity |
   | Subscription Term | Term (and billing frequency) |
   | Annual Unit Fee | Unit price |
   | Discount | Unit discount / discount % |
   | Annual Line Total | Net price |

   Show the **Discount** column: discounts now sit on each line, at list price, so this column is where they show. **Leave out Description:** product descriptions hold internal notes (the Signal products say "legal + technical review required before quoting").
4. **Totals:** annual subscription and total contract value. Free rows show as 0.00.
5. **Terms:** the Terms and Conditions.
6. **Signatures:** e-signature for the client signer and the Protex countersigner.
7. **Footer:** Protex AI Limited, registered address, VAT # IE3772746SH, "Protex AI Confidential".

## Lines every new business order form has

On a new business deal, the card adds these automatically, once:
- **Protex AI Licence - Intelligence (Free)**, quantity 1;
- **Deployment Services**, one per site;
- **Standard Support Services**, quantity 1.

All three show at 0.00. They sit with the paid lines: site licences, camera integrations, and optional products such as Operations or On-site Installation.

## Deal properties, if you want tokens

You don't need deal tokens: everything above is in Comments to buyer, Terms and the line items. If you add tokens anyway, the order form's deal properties are listed in [ORDER-FORM.md](ORDER-FORM.md#field-reference). The useful ones are `of_client_legal_name`, `of_client_legal_address`, `of_client_contact_name`, `of_client_contact_email`, `client_s_email_for_invoicing_`, `of_site_schedule`, `of_pricing_table` and `of_total_contract_value`.
