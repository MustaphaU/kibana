/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  setup,
  getFunctionSignaturesByReturnType,
  getFieldNamesByType,
  createCustomCallbackMocks,
  getLiteralsByType,
  PartialSuggestionWithText,
  getDateLiteralsByFieldType,
  AssertSuggestionsFn,
  fields,
} from './helpers';
import { ESQL_COMMON_NUMERIC_TYPES } from '../../shared/esql_types';
import { scalarFunctionDefinitions } from '../../definitions/generated/scalar_functions';
import { timeUnitsToSuggest } from '../../definitions/literals';
import { FunctionDefinitionTypes, Location } from '../../definitions/types';
import {
  getCompatibleTypesToSuggestNext,
  getValidFunctionSignaturesForPreviousArgs,
  strictlyGetParamAtPosition,
} from '../helper';
import { uniq } from 'lodash';
import {
  FunctionParameter,
  FunctionReturnType,
  SupportedDataType,
  isFieldType,
  isReturnType,
  isSupportedDataType,
} from '../../definitions/types';
import { fieldNameFromType } from '../../validation/validation.test';
import { ESQLAstItem } from '@kbn/esql-ast';
import { roundParameterTypes } from './constants';

const getTypesFromParamDefs = (paramDefs: FunctionParameter[]): SupportedDataType[] =>
  Array.from(new Set(paramDefs.map((p) => p.type))).filter(
    isSupportedDataType
  ) as SupportedDataType[];

describe('autocomplete.suggest', () => {
  describe(Location.EVAL, () => {
    let assertSuggestions: AssertSuggestionsFn;

    beforeEach(async () => {
      const setupResult = await setup();
      assertSuggestions = setupResult.assertSuggestions;
    });

    test('empty expression', async () => {
      await assertSuggestions('from a | eval /', [
        'col0 = ',
        ...getFieldNamesByType('any').map((v) => `${v} `),
        ...getFunctionSignaturesByReturnType(Location.EVAL, 'any', { scalar: true }),
      ]);

      await assertSuggestions('from a | eval col0 = /', [
        ...getFieldNamesByType('any').map((v) => `${v} `),
        ...getFunctionSignaturesByReturnType(Location.EVAL, 'any', { scalar: true }),
      ]);

      await assertSuggestions('from a | eval col0 = 1, /', [
        'col1 = ',
        ...getFieldNamesByType('any').map((v) => `${v} `),
        ...getFunctionSignaturesByReturnType(Location.EVAL, 'any', { scalar: true }),
      ]);

      await assertSuggestions('from a | eval col0 = 1, col1 = /', [
        ...getFieldNamesByType('any').map((v) => `${v} `),
        ...getFunctionSignaturesByReturnType(Location.EVAL, 'any', { scalar: true }),
      ]);

      // Re-enable with https://github.com/elastic/kibana/issues/210639
      // await assertSuggestions('from a | eval a=doubleField, /', [
      //   'col0 = ',
      //   ...getFieldNamesByType('any').map((v) => `${v} `),
      //   'a',
      //   ...getFunctionSignaturesByReturnType(Location.EVAL, 'any', { scalar: true }),
      // ]);

      await assertSuggestions(
        'from b | stats avg(doubleField) by keywordField | eval /',
        [
          'col0 = ',
          '`avg(doubleField)` ',
          ...getFunctionSignaturesByReturnType(Location.EVAL, 'any', { scalar: true }),
        ],
        {
          triggerCharacter: ' ',
          // make aware EVAL of the previous STATS command
          callbacks: createCustomCallbackMocks(
            [{ name: 'avg(doubleField)', type: 'double' }],
            undefined,
            undefined
          ),
        }
      );
      await assertSuggestions(
        'from c | eval abs(doubleField) + 1 | eval /',
        [
          'col0 = ',
          ...getFieldNamesByType('any').map((v) => `${v} `),
          '`abs(doubleField) + 1` ',
          ...getFunctionSignaturesByReturnType(Location.EVAL, 'any', { scalar: true }),
        ],
        {
          triggerCharacter: ' ',
          callbacks: createCustomCallbackMocks(
            [...fields, { name: 'abs(doubleField) + 1', type: 'double' }],
            undefined,
            undefined
          ),
        }
      );
      await assertSuggestions(
        'from d | stats avg(doubleField) by keywordField | eval /',
        [
          'col0 = ',
          '`avg(doubleField)` ',
          ...getFunctionSignaturesByReturnType(Location.EVAL, 'any', { scalar: true }),
        ],
        {
          triggerCharacter: ' ',
          callbacks: createCustomCallbackMocks(
            [{ name: 'avg(doubleField)', type: 'double' }],
            undefined,
            undefined
          ),
        }
      );
    });

    test('after column', async () => {
      await assertSuggestions('from a | eval doubleField /', [
        ...getFunctionSignaturesByReturnType(
          Location.EVAL,
          'any',
          { operators: true, skipAssign: true },
          ['double']
        ),
      ]);
    });

    test('after column after assignment', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('from a | eval col = doubleField /');
      expect(suggestions.map((s) => s.text)).toContain('| ');
    });

    test('after NOT', async () => {
      await assertSuggestions('from index | EVAL keywordField not /', [
        'LIKE $0',
        'RLIKE $0',
        'IN $0',
      ]);

      await assertSuggestions('from index | EVAL keywordField NOT /', [
        'LIKE $0',
        'RLIKE $0',
        'IN $0',
      ]);

      await assertSuggestions('from index | EVAL not /', [
        ...getFieldNamesByType('boolean').map((v) => `${v} `),
        ...getFunctionSignaturesByReturnType(Location.EVAL, 'boolean', { scalar: true }),
      ]);
    });

    test('with lists', async () => {
      await assertSuggestions('from index | EVAL doubleField in /', ['( $0 )']);
      await assertSuggestions(
        'from index | EVAL doubleField in (/)',
        [
          ...getFieldNamesByType('double').filter((name) => name !== 'doubleField'),
          ...getFunctionSignaturesByReturnType(Location.EVAL, 'double', { scalar: true }),
        ],
        { triggerCharacter: '(' }
      );
      await assertSuggestions('from index | EVAL doubleField not in /', ['( $0 )']);
    });

    test('after assignment', async () => {
      await assertSuggestions(
        'from a | eval a=/',
        [
          ...getFieldNamesByType('any').map((v) => `${v} `),
          ...getFunctionSignaturesByReturnType(Location.EVAL, 'any', { scalar: true }),
        ],
        { triggerCharacter: '=' }
      );
      await assertSuggestions(
        'from a | eval a=abs(doubleField), b= /',
        [
          ...getFieldNamesByType('any').map((v) => `${v} `),
          ...getFunctionSignaturesByReturnType(Location.EVAL, 'any', { scalar: true }),
        ],
        { triggerCharacter: '=' }
      );
    });

    test('in and around functions', async () => {
      await assertSuggestions(
        'from a | eval a=round(/)',
        [
          ...getFieldNamesByType(roundParameterTypes),
          ...getFunctionSignaturesByReturnType(
            Location.EVAL,
            roundParameterTypes,
            { scalar: true },
            undefined,
            ['round']
          ),
        ],
        { triggerCharacter: '(' }
      );
      await assertSuggestions(
        'from a | eval a=raund(/)', // note the typo in round
        [],
        { triggerCharacter: '(' }
      );
      await assertSuggestions(
        'from a | eval a=raund(/', // note the typo in round
        []
      );
      await assertSuggestions(
        'from a | eval raund(/', // note the typo in round
        []
      );
      await assertSuggestions(
        'from a | eval raund(5, /', // note the typo in round
        [],
        { triggerCharacter: '(' }
      );
      await assertSuggestions(
        'from a | eval col0 = raund(5, /', // note the typo in round
        [],
        { triggerCharacter: '(' }
      );
      await assertSuggestions('from a | eval a=round(doubleField) /', [
        ', ',
        '| ',
        ...getFunctionSignaturesByReturnType(
          Location.EVAL,
          'any',
          { operators: true, skipAssign: true },
          ['double', 'long']
        ),
        'IN $0',
        'IS NOT NULL',
        'IS NULL',
      ]);
      await assertSuggestions(
        'from a | eval a=round(doubleField, /',
        [
          ...getFieldNamesByType(['integer', 'long']),
          ...getFunctionSignaturesByReturnType(
            Location.EVAL,
            ['integer', 'long'],
            { scalar: true },
            undefined,
            ['round']
          ),
        ],
        { triggerCharacter: '(' }
      );
      await assertSuggestions(
        'from a | eval round(doubleField, /',
        [
          ...getFieldNamesByType(['integer', 'long']),
          ...getFunctionSignaturesByReturnType(
            Location.EVAL,
            ['integer', 'long'],
            { scalar: true },
            undefined,
            ['round']
          ),
        ],
        { triggerCharacter: '(' }
      );
      await assertSuggestions('from a | eval a=round(doubleField),/', [
        'col0 = ',
        ...getFieldNamesByType('any').map((v) => `${v} `),
        // Re-enable with https://github.com/elastic/kibana/issues/210639
        // 'a',
        ...getFunctionSignaturesByReturnType(Location.EVAL, 'any', { scalar: true }),
      ]);
      await assertSuggestions('from a | eval a=round(doubleField) + /', [
        ...getFieldNamesByType(ESQL_COMMON_NUMERIC_TYPES),
        ...getFunctionSignaturesByReturnType(Location.EVAL, ESQL_COMMON_NUMERIC_TYPES, {
          scalar: true,
        }),
      ]);
      await assertSuggestions('from a | eval a=round(doubleField)+ /', [
        ...getFieldNamesByType(ESQL_COMMON_NUMERIC_TYPES),
        ...getFunctionSignaturesByReturnType(Location.EVAL, ESQL_COMMON_NUMERIC_TYPES, {
          scalar: true,
        }),
      ]);
      await assertSuggestions('from a | eval a=doubleField+ /', [
        ...getFieldNamesByType(ESQL_COMMON_NUMERIC_TYPES),
        ...getFunctionSignaturesByReturnType(Location.EVAL, ESQL_COMMON_NUMERIC_TYPES, {
          scalar: true,
        }),
      ]);
      await assertSuggestions('from a | eval a=`any#Char$Field`+ /', [
        ...getFieldNamesByType(ESQL_COMMON_NUMERIC_TYPES),
        ...getFunctionSignaturesByReturnType(Location.EVAL, ESQL_COMMON_NUMERIC_TYPES, {
          scalar: true,
        }),
      ]);

      await assertSuggestions(
        'from a | eval a=round(doubleField), b=round(/)',
        [
          ...getFieldNamesByType(roundParameterTypes),
          ...getFunctionSignaturesByReturnType(
            Location.EVAL,
            roundParameterTypes,
            { scalar: true },
            undefined,
            ['round']
          ),
        ],
        { triggerCharacter: '(' }
      );
      // test that comma is correctly added to the suggestions if minParams is not reached yet
      await assertSuggestions('from a | eval a=concat( /', [
        ...getFieldNamesByType(['text', 'keyword']).map((v) => `${v}, `),
        ...getFunctionSignaturesByReturnType(
          Location.EVAL,
          ['text', 'keyword'],
          { scalar: true },
          undefined,
          ['concat']
        ).map((v) => ({ ...v, text: `${v.text},` })),
      ]);
      await assertSuggestions(
        'from a | eval a=concat(textField, /',
        [
          ...getFieldNamesByType(['text', 'keyword']),
          ...getFunctionSignaturesByReturnType(
            Location.EVAL,
            ['text', 'keyword'],
            { scalar: true },
            undefined,
            ['concat']
          ),
        ],
        { triggerCharacter: ' ' }
      );
      // test that the arg type is correct after minParams
      await assertSuggestions('from a | eval a=cidr_match(ipField, textField, /', [], {
        triggerCharacter: ' ',
      });
      // test that comma is correctly added to the suggestions if minParams is not reached yet
      await assertSuggestions('from a | eval a=cidr_match(/', [
        ...getFieldNamesByType('ip').map((v) => `${v}, `),
        ...getFunctionSignaturesByReturnType(Location.EVAL, 'ip', { scalar: true }, undefined, [
          'cidr_match',
        ]).map((v) => ({ ...v, text: `${v.text},` })),
      ]);
      await assertSuggestions(
        'from a | eval a=cidr_match(ipField, /',
        [
          ...getFieldNamesByType(['text', 'keyword']),
          ...getFunctionSignaturesByReturnType(
            Location.EVAL,
            ['text', 'keyword'],
            { scalar: true },
            undefined,
            ['cidr_match']
          ),
        ],
        { triggerCharacter: ' ' }
      );
    });

    test('deep function nesting', async () => {
      for (const nesting of [1, 2, 3, 4]) {
        await assertSuggestions(
          `from a | eval a=${Array(nesting).fill('round(/').join('')}`,
          [
            ...getFieldNamesByType(roundParameterTypes),
            ...getFunctionSignaturesByReturnType(
              Location.EVAL,
              roundParameterTypes,
              { scalar: true },
              undefined,
              ['round']
            ),
          ],
          { triggerCharacter: '(' }
        );
      }
    });

    test('discards query after cursor', async () => {
      const absParameterTypes = ['double', 'integer', 'long', 'unsigned_long'] as const;

      // Smoke testing for suggestions in previous position than the end of the statement
      await assertSuggestions('from a | eval col0 = abs(doubleField) / | eval abs(col0)', [
        ...getFunctionSignaturesByReturnType(
          Location.EVAL,
          'any',
          { operators: true, skipAssign: true },
          ['double']
        ),
        ', ',
        '| ',
      ]);
      await assertSuggestions('from a | eval col0 = abs(b/) | eval abs(col0)', [
        ...getFieldNamesByType(absParameterTypes),
        ...getFunctionSignaturesByReturnType(
          Location.EVAL,
          absParameterTypes,
          { scalar: true },
          undefined,
          ['abs']
        ),
      ]);
    });

    describe('eval functions', () => {
      // // Test suggestions for each possible param, within each signature variation, for each function
      for (const fn of scalarFunctionDefinitions) {
        // skip this fn for the moment as it's quite hard to test
        // Add match in the test when the autocomplete is ready https://github.com/elastic/kibana/issues/196995
        if (
          ![
            'bucket',
            'date_extract',
            'date_diff',
            'case',
            'match',
            'qstr',
            'kql',
            'date_trunc',
          ].includes(fn.name)
        ) {
          test(`${fn.name}`, async () => {
            const testedCases = new Set<string>();
            for (const signature of fn.signatures) {
              // @ts-expect-error Partial type
              const enrichedArgs: Array<
                ESQLAstItem & {
                  dataType: string;
                }
              > = signature.params.map(({ type }) => ({
                type: 'column',
                dataType: type,
              }));

              // Starting at -1 to include empty case e.g. to_string( / )
              for (let i = -1; i < signature.params.length; i++) {
                const param = signature.params[i];
                if (param?.type === 'time_duration') {
                  continue;
                }
                const testCase = `${fn.name}(${signature.params
                  .slice(0, i + 1)
                  .map((p) =>
                    p.type === 'time_literal'
                      ? '1 year,'
                      : `${
                          typeof p.type === 'string' && isFieldType(p.type)
                            ? fieldNameFromType(p.type)
                            : 'field'
                        }, `
                  )
                  .join('')} / )`;

                // Avoid duplicate test cases that might start with first params that are exactly the same
                if (testedCases.has(testCase)) {
                  continue;
                }
                testedCases.add(testCase);

                const validSignatures = getValidFunctionSignaturesForPreviousArgs(
                  fn,
                  enrichedArgs,
                  i + 1
                );
                // Retrieve unique of types that are compatiable for the current arg
                const typesToSuggestNext = getCompatibleTypesToSuggestNext(fn, enrichedArgs, i + 1);

                const hasMoreMandatoryArgs = !validSignatures
                  // Types available to suggest next after this argument is completed
                  .map((sig) => strictlyGetParamAtPosition(sig, i + 2))
                  // when a param is null, it means param is optional
                  // If there's at least one param that is optional, then
                  // no need to suggest comma
                  .some((p) => p === null || p?.optional === true);

                // Wehther to prepend comma to suggestion string
                // E.g. if true, "fieldName" -> "fieldName, "
                const shouldAddComma =
                  hasMoreMandatoryArgs && fn.type !== FunctionDefinitionTypes.OPERATOR;

                const constantOnlyParamDefs = typesToSuggestNext.filter(
                  (p) => p.constantOnly || /_literal/.test(p.type as string)
                );

                const suggestedConstants = uniq(
                  typesToSuggestNext
                    .map((d) => d.literalSuggestions || d.acceptedValues)
                    .filter((d) => d)
                    .flat()
                );

                const addCommaIfRequired = (s: string | PartialSuggestionWithText) => {
                  if (!shouldAddComma || s === '' || (typeof s === 'object' && s.text === '')) {
                    return s;
                  }
                  return typeof s === 'string' ? `${s}, ` : { ...s, text: `${s.text},` };
                };

                const expected = suggestedConstants?.length
                  ? suggestedConstants.map(
                      (option) => `"${option}"${hasMoreMandatoryArgs ? ', ' : ''}`
                    )
                  : [
                      ...getDateLiteralsByFieldType(
                        getTypesFromParamDefs(typesToSuggestNext).filter(isFieldType)
                      ),
                      ...getFieldNamesByType(
                        getTypesFromParamDefs(typesToSuggestNext).filter(isFieldType)
                      ),
                      ...getFunctionSignaturesByReturnType(
                        Location.EVAL,
                        getTypesFromParamDefs(typesToSuggestNext).filter(
                          isReturnType
                        ) as FunctionReturnType[],
                        { scalar: true },
                        undefined,
                        [fn.name]
                      ),
                      ...getLiteralsByType(getTypesFromParamDefs(constantOnlyParamDefs)),
                    ].map(addCommaIfRequired);

                await assertSuggestions(`from a | eval ${testCase}`, expected, {
                  triggerCharacter: ' ',
                });

                await assertSuggestions(`from a | eval col0 = ${testCase}`, expected, {
                  triggerCharacter: ' ',
                });
              }
            }
          });
        }

        // The above test fails cause it expects nested functions like
        // DATE_EXTRACT(concat("aligned_day_","of_week_in_month"), date) to also be suggested
        // which is actually valid according to func signature
        // but currently, our autocomplete only suggests the literal suggestions
        if (['date_extract', 'date_diff'].includes(fn.name)) {
          test(`${fn.name}`, async () => {
            const firstParam = fn.signatures[0].params[0];
            const suggestedConstants = firstParam?.literalSuggestions || firstParam?.acceptedValues;
            const requiresMoreArgs = true;

            await assertSuggestions(
              `from a | eval ${fn.name}(/`,
              suggestedConstants?.length
                ? [
                    ...suggestedConstants.map(
                      (option) => `"${option}"${requiresMoreArgs ? ', ' : ''}`
                    ),
                  ]
                : []
            );
          });
        }
      }
    });

    test('date math', async () => {
      const dateSuggestions = timeUnitsToSuggest.map(({ name }) => name);

      // Eval bucket is not a valid expression
      await assertSuggestions('from a | eval col0 = bucket(@timestamp, /', [], {
        triggerCharacter: ' ',
      });

      await assertSuggestions(
        'from a | eval a = 1 /',
        [
          ', ',
          '| ',
          ...getFunctionSignaturesByReturnType(
            Location.EVAL,
            'any',
            { operators: true, skipAssign: true },
            ['integer']
          ),
        ],
        { triggerCharacter: ' ' }
      );
      await assertSuggestions('from a | eval a = 1 year /', [', ', '| ', '+ $0', '- $0']);
      await assertSuggestions(
        'from a | eval col0=date_trunc(/)',
        [
          ...getLiteralsByType('time_literal').map((t) => `${t}, `),
          ...getFunctionSignaturesByReturnType(Location.EVAL, ['time_duration', 'date_period'], {
            scalar: true,
          }).map((t) => `${t.text},`),
        ],
        { triggerCharacter: '(' }
      );
      await assertSuggestions(
        'from a | eval col0=date_trunc(2 /)',
        [...dateSuggestions.map((t) => `${t}, `), ','],
        { triggerCharacter: ' ' }
      );
    });
  });
});
