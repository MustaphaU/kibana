/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { FC } from 'react';
import PropTypes from 'prop-types';
import { EuiIcon, EuiLink } from '@elastic/eui';
import chroma from 'chroma-js';
import { readableColor } from '../../lib/readable_color';
import { ColorDot } from '../color_dot';
import { ItemGrid } from '../item_grid';

interface Props {
  /**
   * An array of hexadecimal color values. Non-hex will be ignored.
   * @default []
   */
  colors?: string[];
  /**
   * The number of colors to display before wrapping to a new row.
   * @default 6
   */
  colorsPerRow?: number;
  /** The function to call when the color is changed. */
  onChange: (value: string) => void;
  /**
   * The value of the color in the selector. If not in the colors array, it will be ignored.
   * @default ''
   */
  value?: string;
}

export const ColorPalette: FC<Props> = ({
  colors = [],
  colorsPerRow = 6,
  onChange,
  value = '',
}) => {
  if (colors.length === 0) {
    return null;
  }

  colors = colors.filter((color) => {
    return chroma.valid(color);
  });

  return (
    <div className="canvasColorPalette">
      <ItemGrid items={colors} itemsPerRow={colorsPerRow}>
        {(color) => {
          const match = chroma(color).hex() === chroma(value).hex();
          const icon = match ? (
            <EuiIcon type="check" className="selected-color" color={readableColor(value)} />
          ) : null;

          return (
            <EuiLink
              css={{ fontSize: 0 }}
              key={color}
              onClick={() => !match && onChange(color)}
              className="canvasColorPalette__dot"
              aria-label={chroma(color).name() || color}
            >
              <ColorDot value={color}>{icon}</ColorDot>
            </EuiLink>
          );
        }}
      </ItemGrid>
    </div>
  );
};

ColorPalette.propTypes = {
  colors: PropTypes.array,
  colorsPerRow: PropTypes.number,
  onChange: PropTypes.func.isRequired,
  value: PropTypes.string,
};
