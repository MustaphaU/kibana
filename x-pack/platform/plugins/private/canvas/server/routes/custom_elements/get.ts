/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { RouteInitializerDeps } from '..';
import { CUSTOM_ELEMENT_TYPE, API_ROUTE_CUSTOM_ELEMENT } from '../../../common/lib/constants';
import { CustomElementAttributes } from './custom_element_attributes';
import { catchErrorHandler } from '../catch_error_handler';

export function initializeGetCustomElementRoute(deps: RouteInitializerDeps) {
  const { router } = deps;
  router.versioned
    .get({
      path: `${API_ROUTE_CUSTOM_ELEMENT}/{id}`,
      access: 'internal',
      security: {
        authz: {
          enabled: false,
          reason:
            'This route is opted out from authorization because authorization is provided by saved objects client.',
        },
      },
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            params: schema.object({
              id: schema.string(),
            }),
          },
        },
      },
      catchErrorHandler(async (context, request, response) => {
        const soClient = (await context.core).savedObjects.client;
        const customElement = await soClient.get<CustomElementAttributes>(
          CUSTOM_ELEMENT_TYPE,
          request.params.id
        );

        return response.ok({
          body: {
            id: customElement.id,
            ...customElement.attributes,
          },
        });
      })
    );
}
