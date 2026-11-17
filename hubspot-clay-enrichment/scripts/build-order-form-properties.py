import json, re, sys
out = sys.argv[1]
P = []
def slug(s): return re.sub(r'[^a-z0-9]+', '_', s.lower()).strip('_')
def add(group, name, label, kind, desc='', options=None):
    t = {'text': ('string', 'text'), 'textarea': ('string', 'textarea'), 'number': ('number', 'number'),
         'date': ('date', 'date'), 'datetime': ('datetime', 'date'), 'select': ('enumeration', 'select'),
         'radio': ('enumeration', 'radio'), 'bool': ('bool', 'booleancheckbox')}[kind]
    p = {'groupLabel': f'Order form — {group}', 'name': name, 'label': label, 'type': t[0], 'fieldType': t[1], 'description': desc}
    if kind == 'bool':
        p['options'] = [{'label': 'Yes', 'value': 'true'}, {'label': 'No', 'value': 'false'}]
    elif options:
        p['options'] = [{'label': o, 'value': slug(o)} for o in options]
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

# Pricing
G = 'Pricing'
lines = [('safety', 'Protex AI Platform Site License (Safety Pack)'), ('cameras', 'Camera integrations'),
         ('ops', 'Operations License'), ('intel', 'Protex Intelligence')]
add(G, 'of_ops_included', 'Includes an Operations License', 'bool')
add(G, 'of_intel_included', 'Includes Protex Intelligence', 'bool')
add(G, 'of_safety_units_manual', 'Site license units typed by hand', 'bool', 'No: the units follow the number of sites. Yes: a rep typed them.')
add(G, 'of_cameras_units_manual', 'Camera integration units typed by hand', 'bool', 'No: the units follow the cameras per site. Yes: a rep typed them.')
for key, label in lines:
    add(G, f'of_{key}_units', f'{label} — units', 'number')
    add(G, f'of_{key}_unit_fee', f'{label} — annual fee per unit', 'number')
    add(G, f'of_{key}_total', f'{label} — annual total', 'number', 'Units × fee per unit. Calculated by the order form card.')
add(G, 'of_hardware_included', 'Includes hardware / edge devices', 'bool')
add(G, 'of_hardware_units', 'Hardware / edge devices — units', 'number')
add(G, 'of_hardware_unit_fee', 'Hardware / edge devices — fee per unit', 'number')
add(G, 'of_hardware_billing', 'Hardware / edge devices — billed', 'select', '', ['One-off', 'Annually'])
add(G, 'of_hardware_total', 'Hardware / edge devices — total', 'number', 'Units × fee per unit. Calculated by the order form card.')
add(G, 'of_implementation_fee', 'Implementation / onboarding fee (one-off)', 'number', 'In the order currency.')
add(G, 'of_discount_applied', 'Is a discount being applied?', 'bool')
add(G, 'of_discount_type', 'Discount type', 'select', '', ['Percentage', 'Fixed amount per year'])
add(G, 'of_discount_value', 'Discount', 'number', 'A percentage, or an amount per year in the order currency.')
add(G, 'of_discount_reason', 'Reason for the discount', 'textarea')
add(G, 'of_discount_amount', 'Discount per year', 'number', 'Calculated by the order form card.')
add(G, 'of_annual_list_fee', 'Annual subscription before discount', 'number', 'Calculated by the order form card.')
add(G, 'of_annual_subscription_fee', 'Total annual subscription fee', 'number', 'After discount. Calculated by the order form card.')
add(G, 'of_one_off_fees', 'One-off fees', 'number', 'Implementation plus one-off hardware. Calculated by the order form card.')
add(G, 'of_total_contract_value', 'Total contract value', 'number', 'Annual subscription × term in years, plus one-off fees. Calculated by the order form card.')

# Sites
G = 'Sites'
add(G, 'of_rollout', 'Rollout', 'select', 'All sites going live together, or a staged rollout with a go-live date per site.', ['All sites together', 'Staged rollout'])
add(G, 'of_site_schedule', 'Site schedule', 'textarea', 'One line per site: name, cameras, go-live. Written by the order form card for Juro.')
for i in range(1, 21):
    add(G, f'of_site_{i}_name', f'Site {i} — name', 'text')
    add(G, f'of_site_{i}_cameras', f'Site {i} — camera integrations', 'number')
    add(G, f'of_site_{i}_go_live', f'Site {i} — go-live date', 'date')

# Legal and MSA
G = 'Legal & MSA'
add(G, 'of_existing_msa', 'Is there an existing MSA?', 'select', '', ['Yes', 'No', 'Not sure'])
add(G, 'of_msa_details', 'MSA details or link', 'textarea')
add(G, 'of_msa_date', 'Existing MSA date', 'date')
add(G, 'of_legal_notes', 'Notes for legal', 'textarea')
add(G, 'of_counterparty_signer_name', 'Counterparty signer name', 'text')
add(G, 'of_counterparty_signer_email', 'Counterparty signer email', 'text')
add(G, 'of_counterparty_signer_title', 'Counterparty signer job title', 'text')
add(G, 'of_counterparty_signer_contact_id', 'Counterparty signer contact ID', 'text', 'The HubSpot contact the signer details came from.')
add(G, 'of_protex_signer_user_id', 'Protex signatory (user ID)', 'text', 'The HubSpot user who signs for Protex.')
add(G, 'of_protex_signer_name', 'Protex signatory name', 'text')
add(G, 'of_protex_signer_email', 'Protex signatory email', 'text')
add(G, 'of_protex_signer_title', 'Protex signatory job title', 'text')

# Status
G = 'Status'
add(G, 'of_status', 'Order form status', 'select', '', ['Draft', 'Ready for Juro', 'Sent to Juro', 'Signed'])
add(G, 'of_ready_at', 'Marked ready for Juro at', 'datetime')
add(G, 'of_ready_by', 'Marked ready for Juro by', 'text')

json.dump(P, open(out, 'w'), indent=2, ensure_ascii=False)
open(out, 'a').write('\n')
from collections import Counter
print(len(P), 'properties', Counter(p['groupLabel'] for p in P))
