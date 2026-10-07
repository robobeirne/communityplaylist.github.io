#!/usr/bin/env python3
"""Builds the discovery card's data from the Protex Discovery Assessment sheet.

    python3 scripts/build-discovery.py Protex_Discovery_Assessment.xlsx

Download the sheet as .xlsx (File > Download > Microsoft Excel) and run this
from the project folder. It writes:

  src/app/cards/discovery/data.ts   questions, guidance, weights and stage bars
  scripts/deal-properties.json      the deal properties to create in HubSpot

Re-run it whenever the sheet changes, then `hs project upload`.
"""
import json
import re
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
STATUS_OPTIONS = ['Not discussed', 'Touched on', 'Answered', 'Confirmed']
STAGES = ['Discovery', 'Deep Dive', 'Vendor Selection', 'Vendor of Choice', 'Legal & Procurement']
STYLE_COLUMNS = [
    ('open', 'Open question', 'Open question (what / how)'),
    ('label', 'Label', 'Label ("It sounds like…")'),
    ('noOriented', 'No-oriented', 'No-oriented question'),
    ('mirror', 'Mirror', 'Mirror'),
    ('accusationAudit', 'Accusation audit', 'Accusation audit'),
    ('summary', "That's right", 'Summary for "that\'s right"'),
]
# Checklist items that are counted elsewhere, so they aren't ticked by hand.
# "Number of people engaged" comes from the deal's associated contacts.
DROP_DETAILS = {'da_who_details': ('Number of people engaged',)}

INDUSTRY_CODES = {'All': 'All', 'Logistics': 'L', 'Manufacturing': 'M', 'Retail': 'R', 'L': 'L', 'M': 'M', 'R': 'R'}

# One extra property the sheet's Deal scorer needs as an input ("Something
# should stop us, no fix") but the HubSpot properties tab doesn't list.
EXTRA_PROPERTIES = [{
    'groupLabel': 'Discovery — Momentum',
    'label': 'Is there anything that should stop us? — ticked with no known fix',
    'name': 'da_stop_unresolved',
    'type': 'bool',
    'fieldType': 'booleancheckbox',
    'options': [{'label': 'Yes', 'value': 'true'}, {'label': 'No', 'value': 'false'}],
    'description': 'Tick if any blocker above has no known fix. Sets the close band to At risk.',
    'question': 36,
}, {
    'groupLabel': 'Discovery — Summary',
    'label': 'Discovery — AI assessment record',
    'name': 'da_ai_assessment',
    'type': 'string',
    'fieldType': 'textarea',
    'description': 'The latest AI assessment of the deal against the discovery questions.',
    'question': None,
}, {
    'groupLabel': 'Discovery — Summary',
    'label': 'Discovery — last call assessed',
    'name': 'da_ai_last_meeting',
    'type': 'string',
    'fieldType': 'text',
    'description': 'The call the latest AI assessment was based on.',
    'question': None,
}, {
    'groupLabel': 'Discovery — Summary',
    'label': 'Discovery — last assessed at',
    'name': 'da_ai_last_run',
    'type': 'datetime',
    'fieldType': 'date',
    'description': 'When the AI assessment last ran.',
    'question': None,
}, {
    'groupLabel': 'Discovery — Summary',
    'label': 'Discovery health %',
    'name': 'da_discovery_health',
    'type': 'number',
    'fieldType': 'number',
    'description': 'Weighted share of questions due by this stage that are answered well enough.',
    'question': None,
}, {
    'groupLabel': 'Discovery — Summary',
    'label': 'Likelihood to close (points)',
    'name': 'da_close_points',
    'type': 'number',
    'fieldType': 'number',
    'description': 'Points from the Win-Loss signals.',
    'question': None,
}, {
    'groupLabel': 'Discovery — Summary',
    'label': 'Close band',
    'name': 'da_close_band',
    'type': 'enumeration',
    'fieldType': 'select',
    'options': [{'label': l, 'value': v} for l, v in
                [('High', 'high'), ('Medium', 'medium'), ('Low', 'low'), ('At risk', 'at_risk')]],
    'description': 'At risk if something should stop us with no fix.',
    'question': None,
}]


def text(v):
    if v is None:
        return ''
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


def bullets(v):
    """Splits '• a\n• b' cells into ['a', 'b']."""
    out = []
    for line in text(v).splitlines():
        line = re.sub(r'^\s*[•\-*]\s*', '', line).strip()
        if line:
            out.append(line)
    return out


def slug(label, taken, limit=80):
    s = re.sub(r'[^a-z0-9]+', '_', label.lower()).strip('_')[:limit].rstrip('_') or 'option'
    base, n = s, 2
    while s in taken:
        s = f'{base[:limit - 3]}_{n}'
        n += 1
    taken.add(s)
    return s


def rows(ws):
    data = [[c for c in r] for r in ws.iter_rows(values_only=True)]
    return data


def table(ws, header_row_index):
    data = rows(ws)
    header = [text(h) for h in data[header_row_index]]
    out = []
    for r in data[header_row_index + 1:]:
        if all(v is None or text(v) == '' for v in r):
            continue
        out.append({h: r[i] if i < len(r) else None for i, h in enumerate(header) if h})
    return out


def main(xlsx):
    wb = openpyxl.load_workbook(xlsx, data_only=True)

    # Weights and stage bars come from the Deal scorer (numbers 0-3).
    scorer = rows(wb['Deal scorer'])
    hdr = next(i for i, r in enumerate(scorer) if text(r[0]) == '#')
    scoring = {}
    for r in scorer[hdr + 1:]:
        if text(r[0]) == '':
            continue
        q = int(float(r[0]))
        scoring[q] = {
            'weight': float(r[3] or 0),
            'needed': [int(float(v)) if text(v) != '' else 0 for v in r[4:9]],
        }

    # Properties, grouped by question.
    props = table(wb['HubSpot properties'], 0)
    by_question = {}
    deal_properties = []
    for p in props:
        name = text(p.get('Internal name'))
        if not name:
            continue
        qcell = text(p.get('Question #'))
        q = int(float(qcell)) if re.match(r'^\d', qcell) else None
        action = text(p.get('Action'))
        ftype = text(p.get('Field type'))
        if q is not None and not ftype.startswith('Calculation'):
            by_question.setdefault(q, []).append({'name': name, 'ftype': ftype, 'options': text(p.get('Options'))})
        if action != 'Create' or ftype.startswith('Calculation'):
            continue  # existing properties are reused; scores are calculated by the card
        deal_properties.append({
            'groupLabel': text(p.get('Property group')),
            'label': text(p.get('Label')),
            'name': name,
            'fieldTypeLabel': ftype,
            'options': text(p.get('Options')),
            'description': text(p.get('Help text on the card')),
            'question': q,
        })

    # Personas.
    personas = []
    for r in table(wb['By who to ask'], 0):
        who = text(r.get('Who to ask'))
        if not who:
            continue
        personas.append({
            'who': who,
            'leads': bullets(r.get('Questions they lead on')),
            'also': bullets(r.get('Also asked')),
            'titles': {
                'L': text(r.get('Titles · Logistics')),
                'M': text(r.get('Titles · Manufacturing')),
                'R': text(r.get('Titles · Retail')),
            },
            'dontAsk': text(r.get("Don't ask them about")),
        })

    persona_names = sorted((p['who'] for p in personas), key=len, reverse=True)

    def split_who(cell):
        found, rest = [], cell
        for name in persona_names:
            i = rest.find(name)
            if i >= 0:
                found.append((cell.find(name), name))
                rest = rest.replace(name, '')
        leftovers = [w.strip() for w in re.split(r',', rest) if w.strip()]
        return [n for _, n in sorted(found)] + leftovers

    # Questions and guidance.
    assessment = table(wb['Assessment'], 0)
    questions = []
    checklists = {}
    for a in assessment:
        if text(a.get('#')) == '':
            continue
        n = int(float(a['#']))
        qprops = [p['name'] for p in by_question.get(n, [])]
        status = next((p for p in qprops if p.endswith('_status')), None)
        prefix = status[: -len('_status')] if status else None
        details_prop = f'{prefix}_details' if prefix else None
        detail_labels = [d for d in bullets(a.get('Details to capture'))
                         if not d.startswith(DROP_DETAILS.get(details_prop or '', ()) or ('\0',))]
        questions.append({
            'n': n,
            'topic': text(a.get('Topic')),
            'question': text(a.get('Question')),
            'why': text(a.get('Why it matters (what it surfaces)')),
            'whoToAsk': split_who(text(a.get('Who to ask'))),
            'industry': INDUSTRY_CODES.get(text(a.get('Industry')), 'All'),
            'key': text(a.get('Key question')).lower() == 'yes',
            'theirWords': text(a.get('Their words needed')).lower() == 'yes',
            'weight': scoring[n]['weight'],
            'needed': scoring[n]['needed'],
            'statusProperty': status,
            'detailsProperty': details_prop if details_prop in qprops else None,
            'properties': qprops,
            'details': detail_labels,
            'ways': {key: bullets(a.get(col)) or ([text(a.get(col))] if text(a.get(col)) else []) for key, _, col in STYLE_COLUMNS},
            'listenFor': text(a.get('Listen for')),
            'redFlag': text(a.get('Red flag')),
            'whyClose': text(a.get('Why it matters to the close')),
        })
        if details_prop:
            checklists[details_prop] = detail_labels

    # Checkbox and dropdown options, with stable internal values.
    for p in deal_properties:
        ft = p.pop('fieldTypeLabel')
        raw = p.pop('options')
        labels = [o.strip() for o in raw.split(';') if o.strip() and o.strip() != '—']
        if ft.startswith('Dropdown (per industry'):
            q17 = next(q for q in questions if q['n'] == p['question'])
            labels = []
            for part in q17['details'][0].split('·'):
                m = re.search(r'\[(M|L|R)\]\s*(.+)', part)
                if m:
                    ind = {'M': 'Manufacturing', 'L': 'Logistics', 'R': 'Retail'}[m.group(1)]
                    labels += [f'{ind}: {x.strip()}' for x in m.group(2).split(',') if x.strip()]
            ft = 'Dropdown'
        if ft in ('Dropdown select', 'Dropdown'):
            p['type'], p['fieldType'] = 'enumeration', 'select'
        elif ft == 'Multiple checkboxes':
            p['type'], p['fieldType'] = 'enumeration', 'checkbox'
        elif ft == 'Multi-line text':
            p['type'], p['fieldType'] = 'string', 'textarea'
        elif ft == 'Single-line text':
            p['type'], p['fieldType'] = 'string', 'text'
        elif ft == 'Number':
            p['type'], p['fieldType'] = 'number', 'number'
        elif ft == 'Date picker':
            p['type'], p['fieldType'] = 'date', 'date'
        else:
            raise SystemExit(f'Unknown field type {ft!r} for {p["name"]}')
        if p['type'] == 'enumeration':
            taken = set()
            if p['name'].endswith('_status'):
                p['options'] = [{'label': l, 'value': slug(l, taken)} for l in STATUS_OPTIONS]
            elif p['name'] in checklists:
                # Checklist options come from the Assessment bullets, not the
                # properties tab: its option list is split on ';', which breaks
                # items that contain a semicolon.
                p['options'] = [{'label': l, 'value': slug(l, taken)} for l in checklists[p['name']]]
            else:
                p['options'] = [{'label': l, 'value': slug(l, taken)} for l in labels]
    deal_properties += EXTRA_PROPERTIES
    for q in questions:
        if q['n'] == 36 and 'da_stop_unresolved' not in q['properties']:
            q['properties'].append('da_stop_unresolved')

    option_values = {p['name']: {o['label']: o['value'] for o in p.get('options', [])} for p in deal_properties}
    for q in questions:
        dp = q['detailsProperty']
        q['details'] = [{'label': l, 'value': option_values.get(dp, {}).get(l, slug(l, set()))} for l in q['details']]

    # Close model evidence, by signal.
    close = []
    for r in table(wb['Close model'], 0):
        sig = text(r.get('Signal'))
        pts = r.get('Points')
        if sig and isinstance(pts, (int, float)) and text(r.get('Taken from')):
            close.append({'signal': sig, 'from': text(r.get('Taken from')), 'points': int(pts),
                          'evidence': text(r.get('Win-Loss evidence (new business, Jul 2026)'))})

    who = next(q for q in questions if q['n'] == 24)
    who_values = {d['label']: d['value'] for d in who['details']}

    def pick(prefix):
        return next(v for l, v in who_values.items() if l.lower().startswith(prefix))

    out = ROOT / 'src/app/cards/discovery/data.ts'
    payload = {
        'STAGES': STAGES,
        'STATUS_OPTIONS': [{'label': l, 'value': slug(l, set())} for l in STATUS_OPTIONS],
        'WHO_DETAIL_VALUES': {
            'ops': pick('an operations'),
            'it': pick('it or ot'),
            'vp': pick('someone vp'),
        },
        'QUESTIONS': questions,
        'PERSONAS': personas,
        'CLOSE_EVIDENCE': close,
    }
    lines = ['// Generated by scripts/build-discovery.py from the Protex Discovery Assessment sheet.',
             '// Do not edit by hand: change the sheet and re-run the script.', '',
             "import type { Persona, Question, CloseEvidence } from './types.ts';", '']
    types = {'QUESTIONS': ': Question[]', 'PERSONAS': ': Persona[]', 'CLOSE_EVIDENCE': ': CloseEvidence[]'}
    for k, v in payload.items():
        lines.append(f'export const {k}{types.get(k, "")} = {json.dumps(v, indent=2, ensure_ascii=False)}{" as const" if k not in types else ""};')
        lines.append('')
    out.write_text('\n'.join(lines))
    (ROOT / 'scripts/deal-properties.json').write_text(json.dumps(deal_properties, indent=2, ensure_ascii=False) + '\n')
    print(f'{len(questions)} questions, {len(deal_properties)} properties to create, {len(personas)} personas, {len(close)} close signals')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'Protex_Discovery_Assessment.xlsx')
