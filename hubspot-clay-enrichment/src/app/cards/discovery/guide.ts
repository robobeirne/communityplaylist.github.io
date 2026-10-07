/** Generated from the Opportunity Workbench (v3 merge). What each answer level means for each question,
 *  keyed by question text. Regenerate rather than edit by hand. */
export type Guide = { levels: string[]; levelNames?: string[]; shared: boolean; area: string; test: string; counts: string[]; doesntCount: string[]; trap: string; recheck: string };

export const GUIDE: Record<string, Guide> = {
  "Which sites are in scope, and what happens on them?": {
    "levels": [
      "Fewer than 2 elements, or no named source",
      "2–4 elements, a numeric present as an adjective, or the observation programme without its actual completion rate",
      "All 5 universal elements and the industry element, attributed, numerics numeric",
      "Answered plus a supporting artefact — site list, injury log export, layout drawing — and two elements confirmed by a second persona"
    ],
    "shared": true,
    "area": "Operations (core)",
    "test": "Could someone else walk the site and confirm this number?",
    "counts": [
      "\"Three sites in scope; Amesbury is the pilot.\"",
      "\"Supervisors are meant to log 8 observations a month. We manage about 2.\""
    ],
    "doesntCount": [
      "\"Safety culture is poor.\" — An opinion. Not a fact of any kind, and not usable.",
      "\"They need better visibility.\" — A future state — “Desired future state”.",
      "\"Injuries cost them a fortune.\" — Impact — “Quantified impact”, and it needs a number."
    ],
    "trap": "\"Multi-site\" without the count. Group-level injury rate with no site breakdown. Observation cadence without actual completion.",
    "recheck": "12 months"
  },
  "Where is the risk, and how much of it can they actually see today?": {
    "levels": [
      "Fewer than 2 elements, or no named source",
      "2–4 elements, a numeric present as an adjective, or the observation programme without its actual completion rate",
      "All 5 universal elements and the industry element, attributed, numerics numeric",
      "Answered plus a supporting artefact — site list, injury log export, layout drawing — and two elements confirmed by a second persona"
    ],
    "shared": true,
    "area": "Operations (core)",
    "test": "Could someone else walk the site and confirm this number?",
    "counts": [
      "\"Three sites in scope; Amesbury is the pilot.\"",
      "\"Supervisors are meant to log 8 observations a month. We manage about 2.\""
    ],
    "doesntCount": [
      "\"Safety culture is poor.\" — An opinion. Not a fact of any kind, and not usable.",
      "\"They need better visibility.\" — A future state — “Desired future state”.",
      "\"Injuries cost them a fortune.\" — Impact — “Quantified impact”, and it needs a number."
    ],
    "trap": "\"Multi-site\" without the count. Group-level injury rate with no site breakdown. Observation cadence without actual completion.",
    "recheck": "12 months"
  },
  "What do they measure and report today?": {
    "levels": [
      "Fewer than 2 elements, or no named source",
      "2–4 elements, a numeric present as an adjective, or the observation programme without its actual completion rate",
      "All 5 universal elements and the industry element, attributed, numerics numeric",
      "Answered plus a supporting artefact — site list, injury log export, layout drawing — and two elements confirmed by a second persona"
    ],
    "shared": true,
    "area": "Operations (core)",
    "test": "Could someone else walk the site and confirm this number?",
    "counts": [
      "\"Three sites in scope; Amesbury is the pilot.\"",
      "\"Supervisors are meant to log 8 observations a month. We manage about 2.\""
    ],
    "doesntCount": [
      "\"Safety culture is poor.\" — An opinion. Not a fact of any kind, and not usable.",
      "\"They need better visibility.\" — A future state — “Desired future state”.",
      "\"Injuries cost them a fortune.\" — Impact — “Quantified impact”, and it needs a number."
    ],
    "trap": "\"Multi-site\" without the count. Group-level injury rate with no site breakdown. Observation cadence without actual completion.",
    "recheck": "12 months"
  },
  "What happens after something is found?": {
    "levels": [
      "None recorded, or only outcomes recorded as problems",
      "One problem, entries without “Frequency or volume of the failure” or “Coverage gap quantified”, or wording lifted from the PIC library",
      "Two or more distinct problems, all elements each, at least one with a quantified coverage gap",
      "Answered with three or more problems, one confirmed by a persona other than the Site EHS manager, each linked to a root cause and a business problem"
    ],
    "shared": true,
    "area": "Technical problem",
    "test": "Can you name the thing that is broken, how often it fails, and what proportion of the time it works?",
    "counts": [
      "\"Our only source of forklift-pedestrian data is voluntary near-miss cards. Six a month across 400 staff.\"",
      "\"Manual inspections cover 19% of the observations we're supposed to be doing.\""
    ],
    "doesntCount": [
      "\"We had four forklift incidents last quarter.\" — An outcome, not a mechanism. It belongs in “Business problem” and “Quantified impact”.",
      "\"Safety culture is weak.\" — Too vague to measure, so it cannot be shown to have improved.",
      "\"They have no leading indicators.\" — True, but it describes the absence of our product. Say which mechanism produces that absence."
    ],
    "trap": "",
    "recheck": "6 months"
  },
  "What does an incident cost the line?": {
    "levels": [
      "No figures, or industry benchmarks only",
      "Some denominators, or figures we modelled rather than they stated",
      "All three industry denominators present and attributed",
      "Answered plus at least one sourced directly from Finance or Risk"
    ],
    "shared": false,
    "area": "Anchor denominators",
    "test": "Is this a rate or a price that they themselves use internally?",
    "counts": [
      "\"A recordable costs us about $40,000 direct, and our risk team applies a 2× indirect multiplier.\"",
      "\"A 5.66% productivity uplift is worth $644,000 to us.\""
    ],
    "doesntCount": [
      "\"Industry average is $42,000 per recordable.\" — A benchmark. It is not their number and it will not survive their CFO.",
      "\"Downtime costs us a lot.\" — No unit, so nothing can be multiplied by it."
    ],
    "trap": "",
    "recheck": "6 months"
  },
  "What's riding on client contracts?": {
    "levels": [
      "No figures, or industry benchmarks only",
      "Some denominators, or figures we modelled rather than they stated",
      "All three industry denominators present and attributed",
      "Answered plus at least one sourced directly from Finance or Risk"
    ],
    "shared": false,
    "area": "Anchor denominators",
    "test": "Is this a rate or a price that they themselves use internally?",
    "counts": [
      "\"A recordable costs us about $40,000 direct, and our risk team applies a 2× indirect multiplier.\"",
      "\"A 5.66% productivity uplift is worth $644,000 to us.\""
    ],
    "doesntCount": [
      "\"Industry average is $42,000 per recordable.\" — A benchmark. It is not their number and it will not survive their CFO.",
      "\"Downtime costs us a lot.\" — No unit, so nothing can be multiplied by it."
    ],
    "trap": "",
    "recheck": "6 months"
  },
  "What do claims and turnover cost?": {
    "levels": [
      "No figures, or industry benchmarks only",
      "Some denominators, or figures we modelled rather than they stated",
      "All three industry denominators present and attributed",
      "Answered plus at least one sourced directly from Finance or Risk"
    ],
    "shared": false,
    "area": "Anchor denominators",
    "test": "Is this a rate or a price that they themselves use internally?",
    "counts": [
      "\"A recordable costs us about $40,000 direct, and our risk team applies a 2× indirect multiplier.\"",
      "\"A 5.66% productivity uplift is worth $644,000 to us.\""
    ],
    "doesntCount": [
      "\"Industry average is $42,000 per recordable.\" — A benchmark. It is not their number and it will not survive their CFO.",
      "\"Downtime costs us a lot.\" — No unit, so nothing can be multiplied by it."
    ],
    "trap": "",
    "recheck": "6 months"
  },
  "Do their cameras see the risk?": {
    "levels": [
      "Not captured, or camera count only",
      "Sourced via EHS or Ops rather than IT/Security, or “Coverage of the named high-risk areas, gaps,…”, “Whether RTSP or an API is exposed” or “Camera ownership” missing",
      "Elements 1–14 plus industry, sourced directly from IT/OT and Camera owner",
      "Answered plus an artefact — camera schedule, VMS export, network diagram, site photos — and a feasibility verdict per site"
    ],
    "shared": true,
    "area": "Cameras & network",
    "test": "Could you write the install order today without asking another question?",
    "counts": [
      "\"Milestone 2023 R2, RTSP exposed, cameras on their own VLAN.\"",
      "\"1080p IP throughout the pick aisles; the dock is analogue and would need replacing.\""
    ],
    "doesntCount": [
      "\"They've got cameras everywhere.\" — A count with no capability. Resolution, RTSP and ownership are the questions.",
      "\"IT will be fine with it.\" — An assumption, and not sourced from IT — which caps this field at Touched on."
    ],
    "trap": "A camera count with no coverage map. \"They have cameras everywhere\" without resolution or ownership.",
    "recheck": "12 months"
  },
  "Who owns the cameras and the network?": {
    "levels": [
      "Not captured, or camera count only",
      "Sourced via EHS or Ops rather than IT/Security, or “Coverage of the named high-risk areas, gaps,…”, “Whether RTSP or an API is exposed” or “Camera ownership” missing",
      "Elements 1–14 plus industry, sourced directly from IT/OT and Camera owner",
      "Answered plus an artefact — camera schedule, VMS export, network diagram, site photos — and a feasibility verdict per site"
    ],
    "shared": true,
    "area": "Cameras & network",
    "test": "Could you write the install order today without asking another question?",
    "counts": [
      "\"Milestone 2023 R2, RTSP exposed, cameras on their own VLAN.\"",
      "\"1080p IP throughout the pick aisles; the dock is analogue and would need replacing.\""
    ],
    "doesntCount": [
      "\"They've got cameras everywhere.\" — A count with no capability. Resolution, RTSP and ownership are the questions.",
      "\"IT will be fine with it.\" — An assumption, and not sourced from IT — which caps this field at Touched on."
    ],
    "trap": "A camera count with no coverage map. \"They have cameras everywhere\" without resolution or ownership.",
    "recheck": "12 months"
  },
  "What will IT, security and data rules require?": {
    "levels": [
      "Not captured, or camera count only",
      "Sourced via EHS or Ops rather than IT/Security, or “Coverage of the named high-risk areas, gaps,…”, “Whether RTSP or an API is exposed” or “Camera ownership” missing",
      "Elements 1–14 plus industry, sourced directly from IT/OT and Camera owner",
      "Answered plus an artefact — camera schedule, VMS export, network diagram, site photos — and a feasibility verdict per site"
    ],
    "shared": true,
    "area": "Cameras & network",
    "test": "Could you write the install order today without asking another question?",
    "counts": [
      "\"Milestone 2023 R2, RTSP exposed, cameras on their own VLAN.\"",
      "\"1080p IP throughout the pick aisles; the dock is analogue and would need replacing.\""
    ],
    "doesntCount": [
      "\"They've got cameras everywhere.\" — A count with no capability. Resolution, RTSP and ownership are the questions.",
      "\"IT will be fine with it.\" — An assumption, and not sourced from IT — which caps this field at Touched on."
    ],
    "trap": "A camera count with no coverage map. \"They have cameras everywhere\" without resolution or ownership.",
    "recheck": "12 months"
  },
  "What is actually going wrong, in their words?": {
    "levels": [
      "None recorded, or only outcomes recorded as problems",
      "One problem, entries without “Frequency or volume of the failure” or “Coverage gap quantified”, or wording lifted from the PIC library",
      "Two or more distinct problems, all elements each, at least one with a quantified coverage gap",
      "Answered with three or more problems, one confirmed by a persona other than the Site EHS manager, each linked to a root cause and a business problem"
    ],
    "shared": true,
    "area": "Technical problem",
    "test": "Can you name the thing that is broken, how often it fails, and what proportion of the time it works?",
    "counts": [
      "\"Our only source of forklift-pedestrian data is voluntary near-miss cards. Six a month across 400 staff.\"",
      "\"Manual inspections cover 19% of the observations we're supposed to be doing.\""
    ],
    "doesntCount": [
      "\"We had four forklift incidents last quarter.\" — An outcome, not a mechanism. It belongs in “Business problem” and “Quantified impact”.",
      "\"Safety culture is weak.\" — Too vague to measure, so it cannot be shown to have improved.",
      "\"They have no leading indicators.\" — True, but it describes the absence of our product. Say which mechanism produces that absence."
    ],
    "trap": "",
    "recheck": "6 months"
  },
  "Why does it keep happening?": {
    "levels": [
      "Absent, or a restatement of the Technical Problem (auto-fail)",
      "A mechanism named but no ruled-out alternative and no headcount test",
      "All five elements, sourced from the Group EHS lead or IT/OT",
      "Answered plus confirmation from a persona other than the champion, and a statement of which specific capability closes it"
    ],
    "shared": true,
    "area": "Root cause",
    "test": "Two questions. If this were fixed, would the technical problem disappear? And would ten more safety officers fix it? If yes to the second, it is a resourcing problem and we are the expensive answer.",
    "counts": [
      "\"Human observation can't cover 24/7. Supervisors have production duties first, and there's no verification layer over what they log.\"",
      "\"The cameras were specified for shrink and asset protection, so there's no analytics layer and the VMS has no API.\""
    ],
    "doesntCount": [
      "\"Observation completion is low.\" — The technical problem restated in different words. This is the single most common failure in the whole model.",
      "\"They don't take safety seriously.\" — A judgement about people, not a mechanism.",
      "\"They need Protex.\" — The solution, not the cause."
    ],
    "trap": "",
    "recheck": "12 months"
  },
  "Would more people fix it, and would they pay for them?": {
    "levels": [
      "Absent, or a restatement of the Technical Problem (auto-fail)",
      "A mechanism named but no ruled-out alternative and no headcount test",
      "All five elements, sourced from the Group EHS lead or IT/OT",
      "Answered plus confirmation from a persona other than the champion, and a statement of which specific capability closes it"
    ],
    "shared": true,
    "area": "Root cause",
    "test": "Two questions. If this were fixed, would the technical problem disappear? And would ten more safety officers fix it? If yes to the second, it is a resourcing problem and we are the expensive answer.",
    "counts": [
      "\"Human observation can't cover 24/7. Supervisors have production duties first, and there's no verification layer over what they log.\"",
      "\"The cameras were specified for shrink and asset protection, so there's no analytics layer and the VMS has no API.\""
    ],
    "doesntCount": [
      "\"Observation completion is low.\" — The technical problem restated in different words. This is the single most common failure in the whole model.",
      "\"They don't take safety seriously.\" — A judgement about people, not a mechanism.",
      "\"They need Protex.\" — The solution, not the cause."
    ],
    "trap": "",
    "recheck": "12 months"
  },
  "What have they already tried, and why didn't it stick?": {
    "levels": [
      "None recorded, or only outcomes recorded as problems",
      "One problem, entries without “Frequency or volume of the failure” or “Coverage gap quantified”, or wording lifted from the PIC library",
      "Two or more distinct problems, all elements each, at least one with a quantified coverage gap",
      "Answered with three or more problems, one confirmed by a persona other than the Site EHS manager, each linked to a root cause and a business problem"
    ],
    "shared": true,
    "area": "Technical problem",
    "test": "Can you name the thing that is broken, how often it fails, and what proportion of the time it works?",
    "counts": [
      "\"Our only source of forklift-pedestrian data is voluntary near-miss cards. Six a month across 400 staff.\"",
      "\"Manual inspections cover 19% of the observations we're supposed to be doing.\""
    ],
    "doesntCount": [
      "\"We had four forklift incidents last quarter.\" — An outcome, not a mechanism. It belongs in “Business problem” and “Quantified impact”.",
      "\"Safety culture is weak.\" — Too vague to measure, so it cannot be shown to have improved.",
      "\"They have no leading indicators.\" — True, but it describes the absence of our product. Say which mechanism produces that absence."
    ],
    "trap": "",
    "recheck": "6 months"
  },
  "How aware are they, and who agrees there's a problem?": {
    "levels": [
      "Unaware: Problem exists in our analysis, absent from their account",
      "Told and nodded: We described it, they agreed. The words in the record are ours",
      "Agreed when asked: Open question, buyer confirmed and added detail",
      "Volunteered and quantified: Buyer raised it unprompted with a number attached"
    ],
    "levelNames": [
      "Unaware",
      "Told and nodded",
      "Agreed when asked",
      "Volunteered and quantified"
    ],
    "shared": false,
    "area": "Qualification Q2: do they agree they have the problem?",
    "test": "Did the buyer say it first, with a number, and does the owner of the number agree?",
    "counts": [
      "\"Our near-miss number is fiction. Probably half go unreported.\" (volunteered, with a number)"
    ],
    "doesntCount": [
      "Assent to a rep-introduced framing — only buyer-stated provenance counts",
      "Agreement whose wording matches the pre-call library, because the record then holds our sentence",
      "Agreement from anyone with no stake in the anchor"
    ],
    "trap": "",
    "recheck": ""
  },
  "Which number does it hurt, and whose number is it?": {
    "levels": [
      "None, or a restatement of the technical problem",
      "One problem, entries missing “Current value and target”, or any entry with no named anchor",
      "Two or more problems, each laddered, owned by two different named stakeholders",
      "Answered plus one problem stated directly by the Exec who owns that anchor"
    ],
    "shared": false,
    "area": "Business problem",
    "test": "Would this appear on an operating review slide with safety never being mentioned?",
    "counts": [
      "\"Our TRIR is the number clients see at QBR. It's been flat two years and we got scored down in a tender because of it.\"",
      "\"Premium is up 18% and the broker says our loss record is the reason.\""
    ],
    "doesntCount": [
      "\"Near-miss reporting is low.\" — A technical problem wearing a suit. Trace it to the anchor it damages and it becomes valid.",
      "\"Observation completion is poor.\" — Same. It is “Technical problem”.",
      "\"They want to be safer.\" — Not a consequence and not a metric."
    ],
    "trap": "",
    "recheck": "3 months"
  },
  "Which business priority does it ladder to?": {
    "levels": [
      "No anchor named, or no Exec identified",
      "Anchor and Exec named but relayed second-hand, “The anchor metric's current value and target” or “Capital threshold” missing",
      "All six elements, with 1–4 sourced from the Exec directly",
      "Answered plus the Exec stating the anchor problem in their own words, and their threshold tested against the “The gap” total"
    ],
    "shared": true,
    "area": "Exec anchor alignment",
    "test": "Have you heard their threshold from them, in their words?",
    "counts": [
      "\"The COO owns downtime, is held to 96% OEE, and needs 12-month payback.\"",
      "\"She's already got $400k earmarked for extra supervision, which is what we're really competing with.\""
    ],
    "doesntCount": [
      "\"The VP of EHS is our champion.\" — That is “Champion”. A champion sells internally; an Exec owns the number.",
      "\"The CFO will approve it.\" — Have you met them? Relayed exec intent caps this field at Touched on."
    ],
    "trap": "",
    "recheck": "3 months"
  },
  "What does it cost them, on their own numbers?": {
    "levels": [
      "No figures, or industry benchmarks only",
      "A total with no inputs listed, or every input rep-modelled (auto-fail)",
      "Industry primary metric present, all inputs tagged, ≥60% buyer-stated, total sent back in writing",
      "Answered plus one input from the Finance/risk directly, and evidence the buyer has reused the number internally"
    ],
    "shared": false,
    "area": "Quantified impact",
    "test": "Could their CFO re-run this from the inputs and get the same number?",
    "counts": [
      "\"12.5 recordables a year × $40,000 direct × 2× indirect = $1m annually, on our own claim data.\"",
      "\"Eight investigations a year, 20 hours each, at a loaded rate of $65 — plus 40 hours a quarter building the board pack.\""
    ],
    "doesntCount": [
      "\"Significant cost.\" — No number.",
      "\"Industry data suggests $42,000 per recordable.\" — Our arithmetic, not theirs. Fails the 60% provenance floor.",
      "\"$1m of exposure.\" — A total with no inputs cannot be re-run when one variable changes, and it will change."
    ],
    "trap": "",
    "recheck": "3 months"
  },
  "Why now?": {
    "levels": [
      "Fewer than 3 elements",
      "3–6 elements, or a compelling date asserted without a reason it binds",
      "All 8 elements plus the industry element, attributed",
      "Answered plus the compelling date corroborated by a second persona and prior-attempt outcomes in the buyer's words"
    ],
    "shared": true,
    "area": "Commercial & governance",
    "test": "Is this date theirs, and can they say what happens if it slips?",
    "counts": [
      "\"Board safety review is in November and I present at it.\"",
      "\"Sign by mid-April or we don't go live for June, and June is when the line changes over.\""
    ],
    "doesntCount": [
      "\"We're aiming to close in Q3.\" — Our date wearing their clothes.",
      "\"There's budget for this.\" — Whose? “Commercial & governance” element 2 asks who controls it, not whether it exists."
    ],
    "trap": "",
    "recheck": "3 months"
  },
  "What does good look like, and by when?": {
    "levels": [
      "Nothing, or unfalsifiable statements only",
      "Targets undated, unnumbered, unpaired to a baseline, or stated as our deployment",
      "All 10 universal and both industry elements, each with a unit and a date, each paired to its baseline",
      "Answered plus confirmation this is the target set they are actually held to, and one target that could not be another account's"
    ],
    "shared": true,
    "area": "Desired future state",
    "test": "Could this statement be false in twelve months? If nothing could disprove it, it is not a future state.",
    "counts": [
      "\"Every forklift-pedestrian interaction in the north aisle seen within the shift it happens, by March.\"",
      "\"20% fewer unsafe behaviours on the pilot line within six months, measured the same way we measure them now.\""
    ],
    "doesntCount": [
      "\"Better visibility.\" — Unfalsifiable, so it cannot be the far end of a gap.",
      "\"A proactive safety culture.\" — Same.",
      "\"Analytics running on 40 zones across three sites.\" — Our deployment described as their future. It has no unit they are measured on."
    ],
    "trap": "\"Better visibility.\" \"A proactive safety culture.\" \"Getting ahead of incidents.\" If nothing could disprove it in twelve months, it is not a future state.",
    "recheck": "3 months"
  },
  "How will they know it worked, and who says so?": {
    "levels": [
      "Unknown, or a pilot assumed rather than established",
      "Validation expected but pass conditions undefined, or “Success criteria” not matching “Desired future state”",
      "All eight elements, pass conditions written as conditions, judge named",
      "Answered plus “What specifically happens if it passes” committed in writing by the judge, and the cost acknowledged by the Ops leader whose people carry it"
    ],
    "shared": false,
    "area": "Validation",
    "test": "Is the pass condition written as a condition, and does it match the definition of success in “Desired future state”?",
    "counts": [
      "\"10 cameras on one line for six months. 20% behaviour reduction and 90% accuracy, judged by Tim and Jacob. Pass means 25 cameras site-wide.\""
    ],
    "doesntCount": [
      "\"They want a pilot.\" — Scope, criteria, judge and duration all missing."
    ],
    "trap": "",
    "recheck": "6 weeks"
  },
  "How much can their team actually act on?": {
    "levels": [
      "Nothing, or unfalsifiable statements only",
      "Targets undated, unnumbered, unpaired to a baseline, or stated as our deployment",
      "All 10 universal and both industry elements, each with a unit and a date, each paired to its baseline",
      "Answered plus confirmation this is the target set they are actually held to, and one target that could not be another account's"
    ],
    "shared": true,
    "area": "Desired future state",
    "test": "Could this statement be false in twelve months? If nothing could disprove it, it is not a future state.",
    "counts": [
      "\"Every forklift-pedestrian interaction in the north aisle seen within the shift it happens, by March.\"",
      "\"20% fewer unsafe behaviours on the pilot line within six months, measured the same way we measure them now.\""
    ],
    "doesntCount": [
      "\"Better visibility.\" — Unfalsifiable, so it cannot be the far end of a gap.",
      "\"A proactive safety culture.\" — Same.",
      "\"Analytics running on 40 zones across three sites.\" — Our deployment described as their future. It has no unit they are measured on."
    ],
    "trap": "\"Better visibility.\" \"A proactive safety culture.\" \"Getting ahead of incidents.\" If nothing could disprove it in twelve months, it is not a future state.",
    "recheck": "3 months"
  },
  "Is it worth it on their maths?": {
    "levels": [
      "No gap computed, or a benefit claim with no arithmetic",
      "Delta on one side only, endpoints not matching their source fields, cost of change absent, or ratio uncomputed",
      "Primary gap line present, endpoints identical to source, ≥60% buyer-stated, cost of change complete, ratio above 1:1",
      "Answered plus the ratio tested against the Exec's threshold, the buyer restating the delta, and a per-persona ratio with no negative value"
    ],
    "shared": false,
    "area": "The gap",
    "test": "Are both endpoints the same figures already recorded in “Operations (core)”, “Quantified impact”, “Desired future state” and “Future business impact” — unchanged?",
    "counts": [
      "\"$644k productivity plus $500k avoided injury cost, against $175k first-year cost including install and our people's time. 6.5:1.\""
    ],
    "doesntCount": [
      "A benefit claim with no cost side. — Half a gap, and the half that flatters us.",
      "An ROI built from industry benchmarks. — Our confidence, not their incentive. Treated as below 1:1.",
      "A current value that improved since the last call. — Endpoint drift. The most common way a business case is manufactured rather than discovered."
    ],
    "trap": "Ratio above 3:1 on rep-modelled inputs is treated as below 1:1. Below 1:1 disqualifies; 1:1 to 3:1 means either under-sized or genuinely small, and anyone can fill a small gap.",
    "recheck": "2 weeks"
  },
  "Who's involved, and how wide is the deal?": {
    "levels": [
      "Single contact",
      "Roster partial, or the three-population comparison not run",
      "Eight personas named or ruled out, elements 3–7 per buyer, gap counts computed, contradictions flagged",
      "Answered plus zero unengaged decision-makers, zero B.I.D. sources not deciding, and the map confirmed by a buyer rather than inferred"
    ],
    "shared": true,
    "area": "The buyers",
    "test": "Can you point at the person who signs, and separately at the person whose reality your business case is built on?",
    "counts": [
      "\"Tim owns the programme and is measured on TRIR. Per approves capital and has never spoken to us. Jack runs procurement.\"",
      "\"Josh in IT holds a veto and his condition is the firewall review.\""
    ],
    "doesntCount": [
      "A list of names and job titles. — That is a contact list. The buyer map needs role in the decision, influence, and what each one told us.",
      "\"We're multi-threaded.\" — How many, at what level, and did they contribute anything to the record?"
    ],
    "trap": "",
    "recheck": "6 weeks"
  },
  "Who signs, and have we met them?": {
    "levels": [
      "No anchor named, or no Exec identified",
      "Anchor and Exec named but relayed second-hand, “The anchor metric's current value and target” or “Capital threshold” missing",
      "All six elements, with 1–4 sourced from the Exec directly",
      "Answered plus the Exec stating the anchor problem in their own words, and their threshold tested against the “The gap” total"
    ],
    "shared": true,
    "area": "Exec anchor alignment",
    "test": "Have you heard their threshold from them, in their words?",
    "counts": [
      "\"The COO owns downtime, is held to 96% OEE, and needs 12-month payback.\"",
      "\"She's already got $400k earmarked for extra supervision, which is what we're really competing with.\""
    ],
    "doesntCount": [
      "\"The VP of EHS is our champion.\" — That is “Champion”. A champion sells internally; an Exec owns the number.",
      "\"The CFO will approve it.\" — Have you met them? Relayed exec intent caps this field at Touched on."
    ],
    "trap": "",
    "recheck": "3 months"
  },
  "Who is selling for us when we're not in the room?": {
    "levels": [
      "Nobody identified, or a friendly contact labelled a champion",
      "Named with a personal stake but never tested — classified as coach",
      "Tested at least once and delivered, all elements complete",
      "Answered plus tested twice including an Exec introduction that happened, and they have told us one unwelcome thing"
    ],
    "shared": false,
    "area": "Champion",
    "test": "What did you ask them to do, and did they do it?",
    "counts": [
      "\"Tim organised the internal sessions, brought his VP in, wrote half the business case himself, and told us our ergonomics support was too weak to include.\""
    ],
    "doesntCount": [
      "\"Our main contact is really keen.\" — A coach at best. Enthusiasm is not authority.",
      "\"He's on our side.\" — Untested, so recorded as coach."
    ],
    "trap": "",
    "recheck": "6 weeks"
  },
  "What does this mean for them personally?": {
    "levels": [
      "None, or the champion's view only, second-hand",
      "One or two personas, or entries missing “Their stated concern or objection, verbatim”",
      "Three personas with all four elements each, from direct conversations",
      "Five or more including the budget holder and the consent gate, objections verbatim"
    ],
    "shared": false,
    "area": "Emotional state",
    "test": "Does the sentence contain the word I or my?",
    "counts": [
      "\"If we have a fatality on my watch, my career is over.\"",
      "\"I'm tired of chasing paperwork nobody trusts.\""
    ],
    "doesntCount": [
      "\"They're frustrated.\" — Whose frustration, and about what specifically?",
      "\"They're excited about the technology.\" — Interest, not stake. Interest does not fund anything."
    ],
    "trap": "",
    "recheck": "3 months"
  },
  "Who could say no, and what would change their mind?": {
    "levels": [
      "Single contact",
      "Roster partial, or the three-population comparison not run",
      "Eight personas named or ruled out, elements 3–7 per buyer, gap counts computed, contradictions flagged",
      "Answered plus zero unengaged decision-makers, zero B.I.D. sources not deciding, and the map confirmed by a buyer rather than inferred"
    ],
    "shared": true,
    "area": "The buyers",
    "test": "Can you point at the person who signs, and separately at the person whose reality your business case is built on?",
    "counts": [
      "\"Tim owns the programme and is measured on TRIR. Per approves capital and has never spoken to us. Jack runs procurement.\"",
      "\"Josh in IT holds a veto and his condition is the firewall review.\""
    ],
    "doesntCount": [
      "A list of names and job titles. — That is a contact list. The buyer map needs role in the decision, influence, and what each one told us.",
      "\"We're multi-threaded.\" — How many, at what level, and did they contribute anything to the record?"
    ],
    "trap": "",
    "recheck": "6 weeks"
  },
  "How will they decide?": {
    "levels": [
      "Unknown, or \"they're evaluating a few options\"",
      "Register partial, no weighting, quality unassessed, or criteria we asserted and never confirmed",
      "Every criterion tagged, weighted, owner named, our position recorded, quality assessed",
      "Answered plus one criterion we recommended and they adopted, with the buyer able to explain why it matters, and the register stable across two calls"
    ],
    "shared": false,
    "area": "Decision criteria",
    "test": "Could you predict how they would score a competitor?",
    "counts": [
      "\"90% detection accuracy, a self-service rule builder, open API to our EHS system, and 12-month payback — in that order of weight.\""
    ],
    "doesntCount": [
      "\"They're evaluating a few options.\" — No criteria captured.",
      "Criteria we listed for them and they never confirmed. — Us talking to ourselves. Recommended-and-adopted is influence; asserted-and-unconfirmed is not."
    ],
    "trap": "",
    "recheck": "6 weeks"
  },
  "What happens between 'yes' and a signature?": {
    "levels": [
      "Unknown, or \"it'll go to procurement\"",
      "Steps partially known, any type left unknown, no durations, path uncomputed",
      "Every type resolved, owners and durations attached, path computed, preferred vendor and MSA both established",
      "Answered plus the register confirmed by someone who has run it here before, every can-start-now step actually started, and the path fitting with slack"
    ],
    "shared": false,
    "area": "Buying process",
    "test": "Can you sum the durations and compare against the compelling date?",
    "counts": [
      "\"MSA negotiation two weeks, InfoSec review three, works council six, board sign-off on the 14th. Legal and InfoSec can run in parallel.\""
    ],
    "doesntCount": [
      "\"It'll go to procurement.\" — One word standing in for the whole path.",
      "\"Legal is reviewing it.\" — A status, not a returned redline. The canon is explicit on that distinction."
    ],
    "trap": "",
    "recheck": "12 months"
  },
  "Where does it start, and where does it go?": {
    "levels": [
      "No scope defined, or a pilot assumed rather than agreed",
      "Pilot site named but scope, success criteria or expansion direction missing",
      "All eight elements, success criteria matching “Desired future state” and “Validation”, expansion authority confirmed at the Exec's signing level",
      "Answered plus the expansion path stated by the person who owns that decision, and the pilot site's representativeness assessed against the estate"
    ],
    "shared": false,
    "area": "Pilot & expansion scope",
    "test": "Could the Exec sign the expansion, not just the pilot?",
    "counts": [
      "\"10 cameras on the highest-risk line because that's where the recordables are, then 25 site-wide, then the two European plants — Per can authorise up to €250k.\""
    ],
    "doesntCount": [
      "\"Start with one site and see how it goes.\" — No success criteria, no expansion trigger, no authority tested.",
      "A pilot at the site with the best cameras and the friendliest manager. — The site whose result generalises least, and the usual default."
    ],
    "trap": "",
    "recheck": ""
  },
  "How will the workforce, unions and privacy be handled?": {
    "levels": [
      "Fewer than 3 elements",
      "3–6 elements, or a compelling date asserted without a reason it binds",
      "All 8 elements plus the industry element, attributed",
      "Answered plus the compelling date corroborated by a second persona and prior-attempt outcomes in the buyer's words"
    ],
    "shared": true,
    "area": "Commercial & governance",
    "test": "Is this date theirs, and can they say what happens if it slips?",
    "counts": [
      "\"Board safety review is in November and I present at it.\"",
      "\"Sign by mid-April or we don't go live for June, and June is when the line changes over.\""
    ],
    "doesntCount": [
      "\"We're aiming to close in Q3.\" — Our date wearing their clothes.",
      "\"There's budget for this.\" — Whose? “Commercial & governance” element 2 asks who controls it, not whether it exists."
    ],
    "trap": "",
    "recheck": "3 months"
  },
  "What else are they considering?": {
    "levels": [
      "No alternatives named, or \"no competition\" recorded",
      "External rivals named but do-nothing and internal build unassessed",
      "All elements, with do-nothing and internal build explicitly assessed and rival-to-persona mapping done",
      "Answered plus our position stated against every criteria dimension, and every landmine countered with something the buyer acknowledged"
    ],
    "shared": false,
    "area": "Competition & alternatives",
    "test": "Have you assessed the status quo as a named competitor?",
    "counts": [
      "\"Two CV vendors, plus the option of hiring three more safety officers, plus doing nothing until renewal.\""
    ],
    "doesntCount": [
      "\"No competition.\" — An auto-fail. Doing nothing always exists and wins by not being evaluated."
    ],
    "trap": "",
    "recheck": "6 weeks"
  },
  "What would make them sure?": {
    "levels": [
      "No risks captured, or risk treated as an objection to handle rather than data",
      "Risks named without the proof that resolves them, or sourced only from the champion",
      "All seven elements, each risk paired to a specific proof requirement, from the person who holds the risk",
      "Answered plus the Exec's own how-sure answer verbatim, and every risk matched to a proof asset that exists rather than one we would create"
    ],
    "shared": false,
    "area": "Proof & risk",
    "test": "Does each stated risk have a specific proof paired to it?",
    "counts": [
      "\"They bought a rule-based PPE system that flagged everything and got switched off. They need to see contextual filtering working on their own floor.\""
    ],
    "doesntCount": [
      "\"They had some concerns but I handled them.\" — Risk treated as an objection rather than recorded as data. It will come back at signature."
    ],
    "trap": "",
    "recheck": "6 months"
  },
  "What will they do next, and by when?": {
    "levels": [
      "No next yes identified, or rep activity recorded as a next yes",
      "A next yes named without “Why this buyer values giving it”, or a map covering only people we have already met",
      "All eight elements, map covering every consent-holder, at least one yes given in the last review period",
      "Answered plus a plan for the two yeses after this one, and every refusal diagnosed and acted on"
    ],
    "shared": false,
    "area": "The next yes",
    "test": "Who does the work — them or us?",
    "counts": [
      "\"He's introducing me to the COO on Thursday.\"",
      "\"She's pulling the claims breakdown by injury type — that's a couple of hours of someone's time.\""
    ],
    "doesntCount": [
      "\"I'll follow up next week.\" — Our activity. The buyer's effort line stays flat while ours climbs.",
      "\"We've got a meeting Thursday.\" — Ours, unless they had to do something to make it happen.",
      "\"They said send a proposal.\" — Costs them nothing."
    ],
    "trap": "",
    "recheck": "2 weeks"
  },
  "Is there anything that should stop us?": {
    "levels": [
      "Not checked",
      "Checked with one person; something may be there",
      "Checked with the champion: nothing found, or each one has a fix",
      "Checked with the signer, fixes agreed in writing"
    ],
    "shared": false,
    "area": "Overrides: what stops a deal whatever the score",
    "test": "Would the signer agree none of these applies?",
    "counts": [],
    "doesntCount": [
      "Qualification verdict = fail (does a problem exist we can fix / do they agree / do they want to fix it / will they journey with us)",
      "Gap ratio below 1:1 — the change costs more than it returns on their own numbers",
      "Inverted gap: a consent-holding persona faces a new liability that doesn't exist today"
    ],
    "trap": "",
    "recheck": ""
  }
};
