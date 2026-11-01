OUTPUT_LIMIT_BASE = 2048
OUTPUT_LIMIT_PER_ACHIEVEMENT = 60
OUTPUT_LIMIT_MAX = 60000
MAX_NAME_CHARS = 40

ROUTE_SYSTEM = (
    'You plan the order a player should earn a game\'s achievements in. Return JSON only.\n\n'
    'Set "shape" to "story" when achievements mostly follow a fixed story order, otherwise "themed". '
    'A story route has exactly one branch with "kind" "main", holding the story in order; everything optional goes in '
    '"side" branches, with "branches_from" set to the api_name of the main step after which that branch opens, or null. '
    'A themed route has short-named "side" branches such as Money or Fishing, with "branches_from" null.\n\n'
    'Within a branch, order steps from first or easiest to last or hardest. Where one achievement naturally leads to '
    'another, keep them in sequence on the same branch. Use every api_name once and never invent one.\n\n'
    'Each branch\'s "steps" is a list of api_name strings. '
    'List an achievement in the top-level "missable" only when your sources or strong knowledge of this game support '
    'that it can be permanently lost during a playthrough, with where it can be lost in "note", in one short sentence.\n\n'
    '"message" is 2-3 plain sentences on how to approach this game, for this player, mentioning anything missable.\n'
    'Keep branch names under 30 characters. Keep each branch to about 40 steps at most: split large games into more '
    'named branches rather than one long list. Use at most 8 branches.'
)

ROUTE_SCHEMA = {
    'type': 'OBJECT',
    'required': ['message', 'shape', 'branches'],
    'properties': {
        'message': {'type': 'STRING'},
        'shape': {'type': 'STRING', 'enum': ['story', 'themed']},
        'branches': {
            'type': 'ARRAY',
            'items': {
                'type': 'OBJECT',
                'required': ['name', 'kind', 'steps'],
                'properties': {
                    'name': {'type': 'STRING'},
                    'kind': {'type': 'STRING', 'enum': ['main', 'side']},
                    'branches_from': {'type': 'STRING', 'nullable': True},
                    'steps': {'type': 'ARRAY', 'items': {'type': 'STRING'}},
                },
            },
        },
        'missable': {
            'type': 'ARRAY',
            'items': {
                'type': 'OBJECT',
                'required': ['api_name', 'note'],
                'properties': {'api_name': {'type': 'STRING'}, 'note': {'type': 'STRING'}},
            },
        },
    },
}


def output_limit(achievement_count):
    return min(OUTPUT_LIMIT_MAX, OUTPUT_LIMIT_BASE + OUTPUT_LIMIT_PER_ACHIEVEMENT * achievement_count)


def build_route_prompt(game, achievements, unlocked_ids, guide_text):
    lines = [
        f'{a.api_name} | {a.display_name or ""} | {a.description or "Hidden"} | {a.global_percent or 0}% of players'
        f' | {"unlocked" if a.id in unlocked_ids else "locked"}'
        for a in achievements
    ]
    return (
        f'# Game: {game.name}\n\n'
        f'{guide_text}'
        '## Achievements (api_name | name | description | how common | this player)\n'
        + '\n'.join(lines)
    )


def _clean_steps(raw_steps, known, seen, missable_notes):
    steps = []
    for raw in raw_steps:
        # Gemini sends plain api_names to keep large routes inside the output limit
        name = raw if isinstance(raw, str) else raw.get('api_name') if isinstance(raw, dict) else None
        if name not in known or name in seen:
            continue
        seen.add(name)
        if isinstance(raw, dict):
            missable = raw.get('missable') is True
            note = raw.get('missable_note')
        else:
            missable = name in missable_notes
            note = missable_notes.get(name)
        steps.append({
            'api_name': name,
            'missable': missable,
            'missable_note': note if missable and isinstance(note, str) else None,
        })
    return steps


def validate_route(raw, achievements):
    """Reduce Gemini's answer to a route that only uses this game's real achievements, each exactly once."""
    if not isinstance(raw, dict) or not isinstance(raw.get('branches'), list):
        raise ValueError('Route must be an object with a list of branches')

    known = {a.api_name for a in achievements}
    seen = set()
    branches = []
    raw_missable = raw.get('missable') if isinstance(raw.get('missable'), list) else []
    missable_notes = {m.get('api_name'): m.get('note') for m in raw_missable if isinstance(m, dict)}
    for raw_branch in raw['branches']:
        if not isinstance(raw_branch, dict) or not isinstance(raw_branch.get('steps'), list):
            continue
        steps = _clean_steps(raw_branch['steps'], known, seen, missable_notes)
        if not steps:
            continue
        name = raw_branch.get('name')
        branches.append({
            'name': (name.strip() if isinstance(name, str) else '')[:MAX_NAME_CHARS] or f'Branch {len(branches) + 1}',
            'kind': 'main' if raw_branch.get('kind') == 'main' else 'side',
            'branches_from': raw_branch.get('branches_from'),
            'steps': steps,
        })

    shape = raw.get('shape') if raw.get('shape') in ('story', 'themed') else 'themed'
    if shape == 'story' and branches:
        main = next((b for b in branches if b['kind'] == 'main'), branches[0])
        for b in branches:
            b['kind'] = 'main' if b is main else 'side'
    main_steps = {s['api_name'] for b in branches if b['kind'] == 'main' for s in b['steps']}
    for b in branches:
        if b['kind'] == 'main' or b['branches_from'] not in main_steps:
            b['branches_from'] = None

    missing = [a for a in achievements if a.api_name not in seen]
    if missing:
        missing.sort(key=lambda a: float(a.global_percent or 0), reverse=True)
        branches.append({
            'name': 'Other',
            'kind': 'side',
            'branches_from': None,
            'steps': [{'api_name': a.api_name, 'missable': False, 'missable_note': None} for a in missing],
        })

    message = raw.get('message')
    return {'message': message if isinstance(message, str) else '', 'shape': shape, 'branches': branches}
