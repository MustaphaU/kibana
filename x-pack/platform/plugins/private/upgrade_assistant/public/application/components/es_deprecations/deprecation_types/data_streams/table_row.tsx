/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { EuiTableRowCell, EuiTableRow } from '@elastic/eui';
import { METRIC_TYPE } from '@kbn/analytics';
import { DataStreamsAction, EnrichedDeprecationInfo } from '../../../../../../common/types';
import { GlobalFlyout } from '../../../../../shared_imports';
import { useAppContext } from '../../../../app_context';
import {
  uiMetricService,
  UIM_DATA_STREAM_REINDEX_CLOSE_FLYOUT_CLICK,
  UIM_DATA_STREAM_REINDEX_OPEN_FLYOUT_CLICK,
} from '../../../../lib/ui_metric';
import { DeprecationTableColumns } from '../../../types';
import { EsDeprecationsTableCells } from '../../es_deprecations_table_cells';
import { DataStreamReindexResolutionCell } from './resolution_table_cell';
import { DataStreamReindexFlyout } from './flyout';
import { DataStreamMigrationStatusProvider, useDataStreamMigrationContext } from './context';

const { useGlobalFlyout } = GlobalFlyout;

interface TableRowProps {
  deprecation: EnrichedDeprecationInfo;
  rowFieldNames: DeprecationTableColumns[];
  index: number;
}

const DataStreamTableRowCells: React.FunctionComponent<TableRowProps> = ({
  rowFieldNames,
  deprecation,
  index,
}) => {
  const [showFlyout, setShowFlyout] = useState(false);
  const dataStreamContext = useDataStreamMigrationContext();
  const { addContent: addContentToGlobalFlyout, removeContent: removeContentFromGlobalFlyout } =
    useGlobalFlyout();

  const closeFlyout = useCallback(async () => {
    removeContentFromGlobalFlyout('dataStreamReindexFlyout');
    setShowFlyout(false);
    uiMetricService.trackUiMetric(METRIC_TYPE.CLICK, UIM_DATA_STREAM_REINDEX_CLOSE_FLYOUT_CLICK);
  }, [removeContentFromGlobalFlyout]);

  useEffect(() => {
    if (showFlyout) {
      addContentToGlobalFlyout({
        id: 'dataStreamReindexFlyout',
        Component: DataStreamReindexFlyout,
        props: {
          ...dataStreamContext,
          deprecation,
          closeFlyout,
        },
        flyoutProps: {
          onClose: closeFlyout,
          className: 'eui-textBreakWord',
          'data-test-subj': 'reindexDataStreamDetails',
          'aria-labelledby': 'reindexDataStreamDetailsFlyoutTitle',
        },
      });
    }
  }, [addContentToGlobalFlyout, deprecation, dataStreamContext, showFlyout, closeFlyout]);

  useEffect(() => {
    if (showFlyout) {
      uiMetricService.trackUiMetric(METRIC_TYPE.CLICK, UIM_DATA_STREAM_REINDEX_OPEN_FLYOUT_CLICK);
    }
  }, [showFlyout]);

  return (
    <EuiTableRow
      data-test-subj="deprecationTableRow"
      key={`deprecation-row-${index}`}
      onClick={() => setShowFlyout(true)}
    >
      {rowFieldNames.map((field: DeprecationTableColumns) => {
        return (
          <EuiTableRowCell
            key={field}
            truncateText={false}
            data-test-subj={`dataStreamReindexTableCell-${field}`}
          >
            <EsDeprecationsTableCells
              fieldName={field}
              deprecation={deprecation}
              resolutionTableCell={
                <DataStreamReindexResolutionCell
                  correctiveAction={deprecation.correctiveAction as DataStreamsAction}
                />
              }
            />
          </EuiTableRowCell>
        );
      })}
    </EuiTableRow>
  );
};

export const DataStreamTableRow: React.FunctionComponent<TableRowProps> = (props) => {
  const {
    services: { api },
  } = useAppContext();

  return (
    <DataStreamMigrationStatusProvider dataStreamName={props.deprecation.index!} api={api}>
      <DataStreamTableRowCells {...props} />
    </DataStreamMigrationStatusProvider>
  );
};
