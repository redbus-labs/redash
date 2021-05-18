import { isNumber, isFinite, toString } from 'lodash';
import numeral from 'numeral';

// TODO: allow user to specify number format string instead of delimiters only
// It will allow to remove this function (move all that weird formatting logic to a migration
// that will set number format for all existing counter visualization)
function numberFormat(value, decimalPoints, decimalDelimiter, thousandsDelimiter) {
  // Temporarily update locale data (restore defaults after formatting)
  const locale = numeral.localeData();
  const savedDelimiters = locale.delimiters;

  // Mimic old behavior - AngularJS `number` filter defaults:
  // - `,` as thousands delimiter
  // - `.` as decimal delimiter
  // - three decimal points
  locale.delimiters = {
    thousands: ',',
    decimal: '.',
  };
  let formatString = '0,0.000';
  if (
    (Number.isFinite(decimalPoints) && (decimalPoints >= 0)) ||
    decimalDelimiter ||
    thousandsDelimiter
  ) {
    locale.delimiters = {
      thousands: thousandsDelimiter,
      decimal: decimalDelimiter || '.',
    };

    formatString = '0,0';
    if (decimalPoints > 0) {
      formatString += '.';
      while (decimalPoints > 0) {
        formatString += '0';
        decimalPoints -= 1;
      }
    }
  }
  const result = numeral(value).format(formatString);

  locale.delimiters = savedDelimiters;
  return result;
}

// 0 - special case, use first record
// 1..N - 1-based record number from beginning (wraps if greater than dataset size)
// -1..-N - 1-based record number from end (wraps if greater than dataset size)
function getRowNumber(index, rowsCount) {
  index = parseInt(index, 10) || 0;
  if (index === 0) {
    return index;
  }
  const wrappedIndex = (Math.abs(index) - 1) % rowsCount;
  return index > 0 ? wrappedIndex : rowsCount - wrappedIndex - 1;
}

function formatValue(value, { stringPrefix, stringSuffix, stringDecimal, stringDecChar, stringThouSep }) {
  if (isNumber(value)) {
    value = numberFormat(value, stringDecimal, stringDecChar, stringThouSep);
    return toString(stringPrefix) + value + toString(stringSuffix);
  }
  return toString(value);
}

function formatDeltaValue(value, { kpiDeltaValuePrefixLabel, kpiDeltaValueSuffixLabel,
  stringDeltaDecimal, stringThouSep, formatDeltaPercentage }) {
  if (isNumber(value)) {
    value = numberFormat(value, stringDeltaDecimal, '.', stringThouSep);
    if (formatDeltaPercentage) {
      value += '%';
    }
    return toString(kpiDeltaValuePrefixLabel) + value + toString(kpiDeltaValueSuffixLabel);
  }
  return toString(value);
}

function formatTooltip(value, formatString) {
  if (isNumber(value)) {
    return numeral(value).format(formatString);
  }
  return toString(value);
}

export function getKpiData(rows, options, visualizationName) {
  const result = {};

  const rowsCount = rows.length;
  if (rowsCount > 0) {
    const rowNumber = getRowNumber(options.rowNumber, rowsCount);
    const targetRowNumber = getRowNumber(options.targetRowNumber, rowsCount);
    const kpiColName = options.kpiColName;
    const targetColName = options.targetColName;
    const kpiLabel = options.kpiLabel;

    if (kpiLabel) {
      result.kpiLabel = kpiLabel;
    } else {
      result.kpiLabel = visualizationName;
    }

    if (options.countRow) {
      result.kpiValue = rowsCount;
    } else if (kpiColName) {
      result.kpiValue = rows[rowNumber][kpiColName];
    }

    result.showTargetValue = options.showTargetValue;
    result.showTrend = false;
    let delta = 0;
    let deltaPercentage = 0;
    if (targetColName) {
      result.targetValue = rows[targetRowNumber][targetColName];

      if (Number.isFinite(result.kpiValue) && isFinite(result.targetValue)) {
        delta = result.kpiValue - result.targetValue;
        deltaPercentage = ((result.kpiValue - result.targetValue) / result.targetValue) * 100.0;
        result.showTrend = true;
        result.showTrendColor = options.showTrendColor;
        result.showTrendIcon = options.showTrendIcon;
        result.trendPositive = delta >= 0;
      }
    } else {
      result.targetValue = null;
    }

    result.kpiValueTooltip = formatTooltip(result.kpiValue, options.tooltipFormat);
    result.targetValueTooltip = formatTooltip(result.targetValue, options.tooltipFormat);
    result.deltaValueTooltip = formatTooltip(delta, options.tooltipFormat);

    result.kpiValue = formatValue(result.kpiValue, options);
    if (options.formatDeltaPercentage) {
      result.deltaValue = formatDeltaValue(deltaPercentage, options);
    } else {
      result.deltaValue = formatDeltaValue(delta, options);
    }

    if (options.formatTargetValue) {
      result.targetValue = formatValue(result.targetValue, options);
    } else {
      if (isFinite(result.targetValue)) {
        result.targetValue = numeral(result.targetValue).format('0[.]00[0]');
      }
    }
  }

  return result;
}

export function isValueNumber(rows, options) {
  if (options.countRow) {
    return true; // array length is always a number
  }

  const rowsCount = rows.length;
  if (rowsCount > 0) {
    const rowNumber = getRowNumber(options.rowNumber, rowsCount);
    const kpiColName = options.kpiColName;
    if (kpiColName) {
      return isNumber(rows[rowNumber][kpiColName]);
    }
  }

  return false;
}
