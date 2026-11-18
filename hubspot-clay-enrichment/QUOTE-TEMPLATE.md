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
6. **Site Information:** every site with its cameras. The delivery address appears only for new sites (see below).

**Terms** contains the Terms and Conditions 1A–7B, word for word from the current order form. Three parts vary by deal:
- billing frequency (3C);
- payment terms (3D);
- auto-renewal (section 4, left out if switched off).


## Who owns what

**The card owns the content; the template is a styled shell.** Don't rebuild Client Details, Notes, Site Information or the Terms from deal fields: print Comments to buyer and Terms, or every quote shows them twice. The card holds the wording, and each quote keeps the exact text it was created with.

### HTML the card writes (style it by element)

The card only uses plain tags, with no classes and no inline styles: `table`, `thead`, `tbody`, `tr`, `th`, `td`, `h3`, `p`, `ul`, `li`, `strong`, `u`. Style them by element inside the template's Comments and Terms wrappers (for example `.comments table`, `.terms td:first-child`).

**Comments to buyer:**
```html
<table>
  <thead><tr><th>Client Details</th><th>Billing Details</th></tr></thead>
  <tbody>
    <tr><td><strong>Legal Entity Name:</strong> …</td><td><strong>Billing Email:</strong> … or TBD</td></tr>
    <tr><td><strong>Legal Entity Address:</strong> …</td><td><strong>Billing Address:</strong> … or As legal entity address</td></tr>
    <tr><td><strong>Attn:</strong> …</td><td>(Billing Contact / VAT Number / Purchase Order when set)</td></tr>
    <tr><td><strong>Contact Email:</strong> …</td><td></td></tr>
  </tbody>
</table>
<h3>Subscription Term</h3><p>12 months from each Site's Deployment Date</p>
<h3>Notes</h3><ul><li>…edge device…</li><li>…15 Camera Integrations per Site…</li><li>…camera limits…</li></ul>
<h3>Site Information</h3>
<table>
  <thead><tr><th>Site</th>(<th>New / Existing</th>)(<th>Delivery Address</th>)<th>Camera Integrations</th>(<th>Expected Go-live</th>)</tr></thead>
  <tbody><tr><td>Site 1: …</td>…<td>15</td></tr>…</tbody>
</table>
```

The Site Information columns vary, so style the table generically rather than by column position:
- **Delivery Address:** only when at least one site is new. New business always has it; a renewal of existing sites doesn't.
- **New / Existing:** only on a renewal or expansion that mixes new and existing sites. Existing sites leave the address cell blank.
- **Expected Go-live:** only for staged rollouts.

**Terms:**
```html
<h3>Terms and Conditions</h3>
<table><tbody>
  <tr><td>1</td><td><p><strong>A.</strong> By signing this Order Form…</p><p><strong>B.</strong> Capitalized terms…</p></td></tr>
  …through section 7 (6 if auto-renewal is off)…
</tbody></table>
```

## Sections to put in the template, top to bottom

1. **Header:** logo, "ORDER FORM", the quote's creation date as the Quote Date, and its expiration date as the Offer Expiry Date. The card sets the expiration to the order form's offer expiry.
2. **Comments to buyer.**
3. **Line items**, with these columns to match the current order form:

   | Order form column | Line item field |
   | --- | --- |
   | Item | Name |
   | Unit # | Quantity |
   | Subscription Term | Term (and billing frequency) |
   | Annual Unit Fee | Unit price |
   | Discount | Unit discount / discount % |
   | Annual Line Total | Net price |

   - **Discount column:** show it, because discounts sit on each line at list price.
   - **Free rows:** print **Free of Charge** in the fee columns when the **unit price** is 0. Use the unit price, not the net price, so a paid line discounted to zero still shows its price and discount.
   - **Description:** leave it out. Product descriptions hold internal notes; the Signal products say "legal + technical review required before quoting".
4. **Totals:** annual subscription and total contract value.
5. **Terms.**
6. **Signatures:** e-signature for the client signer and the Protex countersigner.
7. **Footer:** Protex AI Limited, registered address, VAT # IE3772746SH, "Protex AI Confidential".

Check on the first test quote that HubSpot keeps the tables in Comments to buyer and Terms. If it strips them, tell the card's owner and the card will switch to paragraphs.

## Lines every new business order form has

On a new business deal, the card adds these automatically, once:
- **Protex AI Licence - Intelligence (Free)**, quantity 1;
- **Deployment Services**, one per site;
- **Standard Support Services**, quantity 1.

All three show as Free of Charge. They sit with the paid lines: site licences, camera integrations, and optional products such as Operations or On-site Installation.

## Deal properties, if you want tokens

You don't need deal tokens: everything above is in Comments to buyer, Terms and the line items. If you add tokens anyway, the order form's deal properties are listed in [ORDER-FORM.md](ORDER-FORM.md#field-reference). The useful ones are `of_client_legal_name`, `of_client_legal_address`, `of_client_contact_name`, `of_client_contact_email`, `client_s_email_for_invoicing_`, `of_site_schedule`, `of_pricing_table` and `of_total_contract_value`.
