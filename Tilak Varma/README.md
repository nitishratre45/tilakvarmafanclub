# Tilak Varma — Hyderabad (Cricsheet)

This folder contains a Python builder for extracting Tilak Varma's Hyderabad-team matches from Cricsheet's ball-by-ball JSON archive.

## Generate the JSON

From the repository root:

\`\`\`bash
python "Tilak Varma/build_hyderabad_json.py"
\`\`\`

The script downloads Cricsheet's all-men JSON archive, scans every JSON match, filters for Tilak Varma appearing for Hyderabad, and writes \`Tilak Varma/matches.json\`. You can also pass an existing archive:

\`\`\`bash
python "Tilak Varma/build_hyderabad_json.py" --zip all_male_json.zip
\`\`\`

Or point it at extracted JSON files:

\`\`\`bash
python "Tilak Varma/build_hyderabad_json.py" --source-dir ./cricsheet-json
\`\`\`

## Important coverage note

Cricsheet offers ball-by-ball data for selected competitions, not a complete archive of every Hyderabad domestic match. The generated JSON therefore contains only matches actually found in the selected archive. It must not be treated as a complete list of every Hyderabad match Tilak played. Check the \`audit\` and \`source.coverageWarning\` fields in the output.
