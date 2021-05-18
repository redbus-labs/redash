import { isFinite } from 'lodash';
import React, { useState, useEffect } from 'react';
import cx from 'classnames';
import resizeObserver from '@/services/resizeObserver';
import { RendererPropTypes } from '@/visualizations';

import { getKpiData } from './utils';

import './render.less';

function getCounterStyles(scale) {
  return {
    msTransform: `scale(${scale})`,
    MozTransform: `scale(${scale})`,
    WebkitTransform: `scale(${scale})`,
    transform: `scale(${scale})`,
  };
}

function getCounterScale(container) {
  const inner = container.firstChild;
  const scale = Math.min(container.offsetWidth / inner.offsetWidth, container.offsetHeight / inner.offsetHeight);
  return Number(isFinite(scale) ? scale : 1).toFixed(2); // keep only two decimal places
}

export default function Renderer({ data, options, visualizationName }) {
  const [scale, setScale] = useState('1.00');
  const [container, setContainer] = useState(null);

  useEffect(() => {
    if (container) {
      const unwatch = resizeObserver(container, () => {
        setScale(getCounterScale(container));
      });
      return unwatch;
    }
  }, [container]);

  useEffect(() => {
    if (container) {
      // update scaling when options or data change (new formatting, values, etc.
      // may change inner container dimensions which will not be tracked by `resizeObserver`);
      setScale(getCounterScale(container));
    }
  }, [data, options, container]);

  const {
    showTrend, trendPositive,
    kpiValue, kpiValueTooltip,
    deltaValue, deltaValueTooltip,
    targetValue, targetValueTooltip,
    kpiLabel, showTargetValue,
    showTrendColor,
  } = getKpiData(data.rows, options, visualizationName);
  return (
    <div
      className={cx(
        'kpi-visualization-container',
        {
          'trend-positive': showTrend && showTrendColor && trendPositive,
          'trend-negative': showTrend && showTrendColor && !trendPositive,
        },
      )}
    >
      <div className="kpi-visualization-content" ref={setContainer}>
        <div style={getCounterStyles(scale)}>
          {targetValue && (
            <div className="kpi-visualization-delta" title={deltaValueTooltip}>{deltaValue}</div>
          )}
          <div className="kpi-visualization-value" title={kpiValueTooltip}>{kpiValue}</div>
          {targetValue && showTargetValue && (
            <div className="kpi-visualization-target" title={targetValueTooltip}>({targetValue})</div>
          )}
          <div className="kpi-visualization-label">{kpiLabel}</div>
        </div>
      </div>
    </div>
  );
}

Renderer.propTypes = RendererPropTypes;
