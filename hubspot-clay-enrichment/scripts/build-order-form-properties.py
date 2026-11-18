import json, re, sys
out = sys.argv[1]
P = []
def slug(s): return re.sub(r'[^a-z0-9]+', '_', s.lower()).strip('_')
def add(group, name, label, kind, desc='', options=None, hidden=()):
    t = {'text': ('string', 'text'), 'textarea': ('string', 'textarea'), 'number': ('number', 'number'),
         'date': ('date', 'date'), 'datetime': ('datetime', 'date'), 'select': ('enumeration', 'select'),
         'radio': ('enumeration', 'radio'), 'bool': ('bool', 'booleancheckbox')}[kind]
    p = {'groupLabel': f'Order form — {group}', 'name': name, 'label': label, 'type': t[0], 'fieldType': t[1], 'description': desc}
    if kind == 'bool':
        p['options'] = [{'label': 'Yes', 'value': 'true'}, {'label': 'No', 'value': 'false'}]
    elif options:
        p['options'] = [{'label': o, 'value': slug(o)} for o in options]
        # Old values kept as hidden options so deals that still hold them read correctly.
        p['options'] += [{'label': o, 'value': slug(o), 'hidden': True} for o in hidden]
    P.append(p)

# Order and term
G = 'Order'
add(G, 'of_order_type', 'Order type', 'select', 'New business, renewal or expansion. Set from the pipeline; change it if needed.', ['New business', 'Renewal', 'Expansion'])
add(G, 'of_quote_date', 'Date of this quote', 'date')
add(G, 'of_offer_expiry_date', 'Offer expires on', 'date', 'The order form must be signed by this date.')
add(G, 'of_target_signature_date', 'Target signature date', 'date')
add(G, 'of_contract_end_date', 'Contract end date', 'date', 'Contract start date plus the contract term. Calculated by the order form card.')
add(G, 'of_billing_frequency', 'Billing frequency', 'select', '', ['Annually in advance', 'Quarterly in advance', 'Monthly in advance', 'Upfront for the full term'])
add(G, 'of_payment_terms', 'Payment terms', 'select', '', ['Net 30', 'Net 45', 'Net 60', 'Net 90', 'Due on receipt'])
add(G, 'of_po_required', 'Client needs a PO before invoicing', 'bool')
add(G, 'of_auto_renew', 'Auto-renews at the end of the term', 'bool')

# Client
G = 'Client'
add(G, 'of_client_legal_name', "Client's legal entity name", 'text', 'Also the counterparty on the MSA.')
add(G, 'of_client_legal_address', "Client's legal entity address", 'textarea')
add(G, 'of_client_company_number', 'Company registration number', 'text')
add(G, 'of_client_tax_id', 'VAT / tax ID', 'text')
add(G, 'of_client_contact_name', 'Client contact name', 'text', 'First and last name of the main contact on the order form.')
add(G, 'of_client_contact_email', 'Client contact email', 'text')
add(G, 'of_client_contact_title', 'Client contact job title', 'text')
add(G, 'of_billing_contact_name', 'Billing contact name', 'text')
add(G, 'of_billing_address', 'Billing address (if different)', 'textarea')

# Pricing. Products, quantities, prices and per-line discounts live on the deal's line items;
# these are the roll-ups the card writes so Juro and reports get them as plain deal fields.
G = 'Pricing'
add(G, 'of_pricing_table', 'Pricing table', 'textarea', 'One line per product: name, quantity × unit price, discount, net. Written by the order form card from the line items, for Juro.')
add(G, 'of_discount_reason', 'Reason for the discounts', 'textarea', 'Required when any line item is discounted.')
add(G, 'of_annual_list_fee', 'Annual subscription before discount', 'number', 'Recurring line items at list, per year. Calculated by the order form card.')
add(G, 'of_discount_amount', 'Discount per year', 'number', 'Across the recurring line items. Calculated by the order form card.')
add(G, 'of_discount_pct', 'Overall discount %', 'number', 'All discounts as a share of list. Calculated by the order form card.')
add(G, 'of_annual_subscription_fee', 'Total annual subscription fee', 'number', 'Recurring line items after discount, per year. Calculated by the order form card.')
add(G, 'of_one_off_fees', 'One-off fees', 'number', 'One-time line items after discount. Calculated by the order form card.')
add(G, 'of_total_contract_value', 'Total contract value (order form)', 'number', 'Annual subscription × term in years, plus one-off fees. Calculated by the order form card.')

# Sites
G = 'Sites'
add(G, 'of_rollout', 'Rollout', 'select', 'All sites going live together, or a staged rollout with a go-live date per site.', ['All sites together', 'Staged rollout'])
add(G, 'of_site_schedule', 'Site schedule', 'textarea', 'Every site, one line each: name, cameras, go-live. Written by the order form card for Juro.')
add(G, 'of_sites', 'Site list (card data)', 'textarea', 'The full site list the order form card edits, as JSON. No limit on the number of sites; Sites 1–20 are also copied to the numbered fields.')
for i in range(1, 21):
    add(G, f'of_site_{i}_name', f'Site {i} — name', 'text')
    add(G, f'of_site_{i}_cameras', f'Site {i} — camera integrations', 'number')
    add(G, f'of_site_{i}_go_live', f'Site {i} — go-live date', 'date')

# Legal and MSA
G = 'Legal & MSA'
add(G, 'of_msa_status', 'MSA status', 'select', 'Which MSA this order form is governed by. Negotiated MSAs are redlined in Juro; the order form goes out once it is signed.',
    ['Existing MSA', 'Standard MSA', 'Negotiating in Juro', 'Signed in Juro'])
add(G, 'of_existing_msa', 'Is there an existing MSA? (old)', 'select', 'Replaced by MSA status.', ['Yes', 'No', 'Not sure'])
add(G, 'of_msa_details', 'MSA details or link', 'textarea')
add(G, 'of_msa_date', 'MSA date', 'date', 'The date of the MSA this order form refers to: the existing one, or the one signed in Juro.')
add(G, 'of_legal_notes', 'Notes for legal', 'textarea', 'Internal. Not shown on the order form.')
add(G, 'of_counterparty_signer_name', 'Counterparty signer name', 'text')
add(G, 'of_counterparty_signer_email', 'Counterparty signer email', 'text')
add(G, 'of_counterparty_signer_title', 'Counterparty signer job title', 'text')
add(G, 'of_counterparty_signer_contact_id', 'Counterparty signer contact ID', 'text', 'The HubSpot contact who e-signs the order form quote.')
add(G, 'of_protex_signer_user_id', 'Protex signatory (user ID)', 'text', 'The HubSpot user who countersigns for Protex.')
add(G, 'of_protex_signer_name', 'Protex signatory name', 'text')
add(G, 'of_protex_signer_email', 'Protex signatory email', 'text')
add(G, 'of_protex_signer_title', 'Protex signatory job title', 'text')

# Status
G = 'Status'
add(G, 'of_status', 'Order form status', 'select', 'Draft, then Ready to send once the order form quote is created, Sent once it is published, Signed once fully signed.',
    ['Draft', 'Ready to send', 'Sent', 'Signed'], hidden=['Ready for Juro', 'Sent to Juro'])
add(G, 'of_ready_at', 'Order form created at', 'datetime', 'When the order form quote was created from the card.')
add(G, 'of_ready_by', 'Order form created by', 'text')
add(G, 'of_quote_id', 'Order form quote ID', 'text', 'The HubSpot quote that is this deal\'s order form.')
add(G, 'of_quote_status', 'Order form quote status', 'select', 'Kept in step with the quote by the order form card.',
    ['Draft', 'Awaiting approval', 'Sent', 'Signed', 'Expired', 'Rejected'])
add(G, 'of_standard_inclusions_added', 'Standard inclusions added', 'bool', 'Set once the card has added the free standard rows (Intelligence, Deployment Services, Standard Support) to a new business deal, so removing one sticks.')
add(G, 'of_changed_after_quote', 'Order form changed after the quote was created', 'bool', 'Set when the card saves changes after the order form quote exists; cleared when a new quote is created.')
add(G, 'of_sent_at', 'Order form sent at', 'datetime', 'When the order form quote was first published for signature.')
add(G, 'of_locked', 'Order form locked', 'bool', 'Locked while the quote is out for signature or signed. Unlock on the card, with a reason, to change it.')
add(G, 'of_lock_log', 'Order form lock log (card data)', 'textarea', 'Who unlocked the order form, when and why, as JSON.')
add(G, 'of_signed_snapshot', 'Order form signed snapshot (card data)', 'textarea', 'What was signed, frozen at signature: quote, pricing lines, wording, approvals and amendments, as JSON.')
add(G, 'of_signed_at', 'Order form signed at', 'datetime', 'When the order form quote was fully signed (including countersignature).')

# Special terms and approval
G = 'Approval'
add(G, 'of_special_terms', 'Special terms (card data)', 'textarea', 'The optional special terms ticked on the order form card, as JSON. Printed on the quote after the Terms and Conditions.')
add(G, 'of_approval_status', 'Order form approval status', 'select', 'Whether non-standard price or terms need approval, and where that stands. Kept up to date by the order form card.',
    ['Not needed', 'Needed', 'Pending', 'Approved', 'Rejected'])
add(G, 'of_approval', 'Order form approval record (card data)', 'textarea', 'What was put up for approval, to whom, and each decision with who and when, as JSON.')
add(G, 'of_approved_at', 'Order form approved at', 'datetime', 'When the last approval needed was given.')
add(G, 'of_approved_by', 'Order form approved by', 'text', 'Who approved, by type (e.g. Finance: Jane Doe; Legal: …).')

add(G, 'of_amendments', 'Contract amendments (card data)', 'textarea', "This deal's changes to the order form wording, the change history and the client's redline rounds, as JSON.")
add(G, 'of_amendment_summary', 'Contract amendments', 'textarea', "One line per clause amended or removed for this deal, with who, why and whether it's approved. Written by the order form card.")

json.dump(P, open(out, 'w'), indent=2, ensure_ascii=False)
open(out, 'a').write('\n')
from collections import Counter
print(len(P), 'properties', Counter(p['groupLabel'] for p in P))
