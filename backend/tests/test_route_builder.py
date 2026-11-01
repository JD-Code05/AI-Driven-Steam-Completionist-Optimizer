import unittest
from types import SimpleNamespace

from app.services.route_builder import validate_route


def ach(name, percent=10):
    return SimpleNamespace(api_name=name, global_percent=percent)


ALL = [ach('A', 50), ach('B', 20), ach('C', 80), ach('D', 5)]


def step(name, **extra):
    return {'api_name': name, 'missable': False, 'missable_note': None, **extra}


def branch(name, *names, kind='side', branches_from=None):
    return {'name': name, 'kind': kind, 'branches_from': branches_from, 'steps': [step(n) for n in names]}


def route(*branches, shape='themed', message='Hi'):
    return {'message': message, 'shape': shape, 'branches': list(branches)}


def names(result, index=0):
    return [s['api_name'] for s in result['branches'][index]['steps']]


class ValidateRouteTests(unittest.TestCase):
    def test_keeps_a_valid_route(self):
        result = validate_route(route(branch('One', 'A', 'B', 'C', 'D')), ALL)
        self.assertEqual(result['message'], 'Hi')
        self.assertEqual(result['shape'], 'themed')
        self.assertEqual(len(result['branches']), 1)
        self.assertEqual(names(result), ['A', 'B', 'C', 'D'])

    def test_drops_unknown_api_names(self):
        self.assertEqual(names(validate_route(route(branch('One', 'A', 'INVENTED', 'B', 'C', 'D')), ALL)), ['A', 'B', 'C', 'D'])

    def test_duplicates_keep_first_position(self):
        result = validate_route(route(branch('One', 'A', 'B'), branch('Two', 'B', 'A', 'C', 'D')), ALL)
        self.assertEqual(names(result, 0), ['A', 'B'])
        self.assertEqual(names(result, 1), ['C', 'D'])

    def test_missing_go_to_other_most_common_first(self):
        result = validate_route(route(branch('One', 'B')), ALL)
        other = result['branches'][-1]
        self.assertEqual(other['name'], 'Other')
        self.assertEqual(other['kind'], 'side')
        self.assertEqual([s['api_name'] for s in other['steps']], ['C', 'A', 'D'])

    def test_no_other_branch_when_nothing_is_missing(self):
        result = validate_route(route(branch('One', 'A', 'B', 'C', 'D')), ALL)
        self.assertNotIn('Other', [b['name'] for b in result['branches']])

    def test_invalid_branches_from_becomes_null(self):
        result = validate_route(route(branch('Main', 'A', 'B', kind='main'), branch('Side', 'C', 'D', branches_from='NOPE'), shape='story'), ALL)
        self.assertIsNone(result['branches'][1]['branches_from'])

    def test_branches_from_must_be_a_main_step(self):
        result = validate_route(route(branch('Main', 'A', 'B', kind='main'), branch('S1', 'C', branches_from='B'), branch('S2', 'D', branches_from='C'), shape='story'), ALL)
        self.assertEqual(result['branches'][1]['branches_from'], 'B')
        self.assertIsNone(result['branches'][2]['branches_from'])

    def test_story_without_main_promotes_first_branch(self):
        result = validate_route(route(branch('First', 'A', 'B'), branch('Second', 'C', 'D'), shape='story'), ALL)
        self.assertEqual([b['kind'] for b in result['branches']], ['main', 'side'])

    def test_story_keeps_one_main(self):
        result = validate_route(route(branch('M1', 'A', 'B', kind='main'), branch('M2', 'C', 'D', kind='main'), shape='story'), ALL)
        self.assertEqual([b['kind'] for b in result['branches']], ['main', 'side'])

    def test_empty_branches_removed(self):
        result = validate_route(route(branch('Empty', 'INVENTED'), branch('One', 'A', 'B', 'C', 'D')), ALL)
        self.assertEqual([b['name'] for b in result['branches']], ['One'])

    def test_unknown_shape_becomes_themed(self):
        self.assertEqual(validate_route(route(branch('One', 'A', 'B', 'C', 'D'), shape='spiral'), ALL)['shape'], 'themed')

    def test_long_branch_name_capped_at_40_chars(self):
        result = validate_route(route(branch('x' * 90, 'A', 'B', 'C', 'D')), ALL)
        self.assertEqual(result['branches'][0]['name'], 'x' * 40)

    def test_blank_branch_name_gets_a_label(self):
        result = validate_route(route(branch('   ', 'A', 'B', 'C', 'D')), ALL)
        self.assertTrue(result['branches'][0]['name'])

    def test_missable_note_only_kept_when_missable(self):
        raw = route({'name': 'One', 'kind': 'side', 'steps': [
            {'api_name': 'A', 'missable': True, 'missable_note': 'Before chapter 3'},
            {'api_name': 'B', 'missable': False, 'missable_note': 'Ignored'},
            {'api_name': 'C', 'missable': 'yes', 'missable_note': 'Ignored'},
            {'api_name': 'D'},
        ]})
        steps = validate_route(raw, ALL)['branches'][0]['steps']
        self.assertEqual(steps[0], {'api_name': 'A', 'missable': True, 'missable_note': 'Before chapter 3'})
        for s in steps[1:]:
            self.assertFalse(s['missable'])
            self.assertIsNone(s['missable_note'])

    def test_compact_form_expands_to_full_steps(self):
        raw = {'message': 'Hi', 'shape': 'themed',
               'branches': [{'name': 'One', 'kind': 'side', 'steps': ['A', 'B', 'C', 'D']}],
               'missable': [{'api_name': 'B', 'note': 'Before the end'}, {'api_name': 'INVENTED', 'note': 'x'}, 'junk']}
        steps = validate_route(raw, ALL)['branches'][0]['steps']
        self.assertEqual(steps[0], {'api_name': 'A', 'missable': False, 'missable_note': None})
        self.assertEqual(steps[1], {'api_name': 'B', 'missable': True, 'missable_note': 'Before the end'})

    def test_rejects_wrong_top_level_shapes(self):
        for raw in [[], 'x', {'branches': 'nope'}, {}]:
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                validate_route(raw, ALL)

    def test_ignores_malformed_branches_and_steps(self):
        raw = route('nope', {'name': 'One', 'steps': ['bad', 7, step('A'), step('B'), step('C'), step('D')]}, {'name': 'Bad', 'steps': 'x'})
        result = validate_route(raw, ALL)
        self.assertEqual([b['name'] for b in result['branches']], ['One'])
