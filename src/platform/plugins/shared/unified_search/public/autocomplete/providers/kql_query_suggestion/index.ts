/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CoreSetup } from '@kbn/core/public';
import type { $Keys } from 'utility-types';
import { flatten, uniqBy } from 'lodash';
import type { UnifiedSearchPublicPluginStart } from '../../../types';

import type {
  QuerySuggestion,
  QuerySuggestionGetFnArgs,
  QuerySuggestionGetFn,
} from '../query_suggestion_provider';

const cursorSymbol = '@kuery-cursor@';

const dedup = (suggestions: QuerySuggestion[]): QuerySuggestion[] =>
  uniqBy(suggestions, ({ type, text, start, end }) => [type, text, start, end].join('|'));

export const KUERY_LANGUAGE_NAME = 'kuery';

export const setupKqlQuerySuggestionProvider = (
  core: CoreSetup<object, UnifiedSearchPublicPluginStart>
): QuerySuggestionGetFn => {
  let getSuggestionsByType:
    | ((
        cursoredQuery: string,
        querySuggestionsArgs: QuerySuggestionGetFnArgs
      ) => Promise<Array<Promise<QuerySuggestion[]>> | []>)
    | undefined;

  const asyncGetSuggestionsByTypeFn = async () => {
    if (getSuggestionsByType) {
      return getSuggestionsByType;
    }

    const {
      fromKueryExpression,
      setupGetFieldSuggestions,
      setupGetValueSuggestions,
      setupGetOperatorSuggestions,
      setupGetConjunctionSuggestions,
    } = await import('./kql_module');

    const providers = {
      field: setupGetFieldSuggestions(core),
      value: setupGetValueSuggestions(core),
      operator: setupGetOperatorSuggestions(core),
      conjunction: setupGetConjunctionSuggestions(core),
    };

    return (getSuggestionsByType = async (
      cursoredQuery: string,
      querySuggestionsArgs: QuerySuggestionGetFnArgs
    ): Promise<Array<Promise<QuerySuggestion[]>> | []> => {
      try {
        const { suggestionsAbstraction } = querySuggestionsArgs;
        let cursorNode = fromKueryExpression(cursoredQuery, {
          cursorSymbol,
          parseCursor: true,
        });
        const isNested = cursorNode.nestedPath && cursorNode.nestedPath.length > 0;
        const fieldName = isNested
          ? `${cursorNode.nestedPath}.${cursorNode.fieldName}`
          : cursorNode.fieldName;
        if (suggestionsAbstraction && suggestionsAbstraction?.fields[fieldName]) {
          if (isNested) {
            cursorNode = {
              ...cursorNode,
              fieldName: suggestionsAbstraction?.fields[fieldName]?.nestedField ?? fieldName,
              nestedPath: suggestionsAbstraction?.fields[fieldName]?.nestedPath ?? fieldName,
            };
          } else {
            cursorNode = {
              ...cursorNode,
              fieldName: suggestionsAbstraction?.fields[fieldName]?.field ?? fieldName,
            };
          }
        }
        return cursorNode.suggestionTypes.map((type: $Keys<typeof providers>) =>
          providers[type](querySuggestionsArgs, cursorNode)
        );
      } catch (e) {
        return [];
      }
    });
  };

  return async (querySuggestionsArgs): Promise<QuerySuggestion[]> => {
    const { query, selectionStart, selectionEnd } = querySuggestionsArgs;
    const cursoredQuery = `${query.substr(0, selectionStart)}${cursorSymbol}${query.substr(
      selectionEnd
    )}`;
    const fn = await asyncGetSuggestionsByTypeFn();
    return Promise.all(await fn(cursoredQuery, querySuggestionsArgs)).then((suggestionsByType) =>
      dedup(flatten(suggestionsByType))
    );
  };
};
