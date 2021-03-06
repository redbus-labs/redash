import chroma from 'chroma-js';
import _ from 'lodash';
import { createNumberFormatter as createFormatter } from '@/lib/value-format';

export const AdditionalColors = {
  White: '#ffffff',
  Black: '#000000',
  'Light Gray': '#dddddd',
};

export function darkenColor(color) {
  return chroma(color).darken().hex();
}

export function createNumberFormatter(format, placeholder) {
  const formatter = createFormatter(format);
  return (value) => {
    if (_.isNumber(value) && isFinite(value)) {
      return formatter(value);
    }
    return placeholder;
  };
}

export function prepareData(data, countryCodeField, valueField) {
  if (!countryCodeField || !valueField) {
    return {};
  }

  const result = {};
  _.each(data, (item) => {
    if (item[countryCodeField]) {
      const value = parseFloat(item[valueField]);
      result[item[countryCodeField]] = {
        code: item[countryCodeField],
        value: isFinite(value) ? value : undefined,
        item,
      };
    }
  });
  return result;
}

export function prepareFeatureProperties(feature, valueFormatted, data, countryCodeType) {
  const result = {};
  _.each(feature.properties, (value, key) => {
    result['@@' + key] = value;
  });
  result['@@value'] = valueFormatted;
  const datum = data[feature.properties[countryCodeType]] || {};
  return _.extend(result, datum.item);
}

export function getValueForFeature(feature, data, countryCodeType) {
  const code = feature.properties[countryCodeType];
  if (_.isString(code) && _.isObject(data[code])) {
    return data[code].value;
  }
  return undefined;
}

export function getColorByValue(value, limits, colors, defaultColor) {
  if (_.isNumber(value) && isFinite(value)) {
    for (let i = 0; i < limits.length; i += 1) {
      if (value <= limits[i]) {
        return colors[i];
      }
    }
  }
  return defaultColor;
}

export function createScale(features, data, options) {
  // Calculate limits
  const values = _.uniq(_.filter(
    _.map(features, feature => getValueForFeature(feature, data, options.countryCodeType)),
    _.isNumber,
  ));
  if (values.length === 0) {
    return {
      limits: [],
      colors: [],
      legend: [],
    };
  }
  const steps = Math.min(values.length, options.steps);
  if (steps === 1) {
    return {
      limits: values,
      colors: [options.colors.max],
      legend: [{
        color: options.colors.max,
        limit: _.first(values),
      }],
    };
  }
  const limits = chroma.limits(values, options.clusteringMode, steps - 1);

  // Create color buckets
  const colors = chroma.scale([options.colors.min, options.colors.max])
    .colors(limits.length);

  // Group values for legend
  const legend = _.map(colors, (color, index) => ({
    color,
    limit: limits[index],
  })).reverse();

  return { limits, colors, legend };
}

export function inferCountryCodeType(mapType, data, countryCodeField) {
  const regexMap = {
    countries: {
      iso_a2: /^[a-z]{2}$/i,
      iso_a3: /^[a-z]{3}$/i,
      iso_n3: /^[0-9]{3}$/i,
    },
    subdiv_japan: {
      name: /^[a-z]+$/i,
      name_local: /^[\u3400-\u9FFF\uF900-\uFAFF]|[\uD840-\uD87F][\uDC00-\uDFFF]+$/i,
      iso_3166_2: /^JP-[0-9]{2}$/i,
    },
    state_india: {
      name: /^[a-z]+$/i,
      state_id: /^[0-9]{1,2}$/i,
    },
    state_wise_india: {
      name: /^[a-z]+$/i,
      district_id: /^[0-9]{1,2}$/i,
    },
  };

  const regex = regexMap[mapType];

  const initState = _.mapValues(regex, () => 0);

  const result = _.chain(data)
    .reduce((memo, item) => {
      const value = item[countryCodeField];
      if (_.isString(value)) {
        _.each(regex, (r, k) => {
          memo[k] += r.test(value) ? 1 : 0;
        });
      }
      return memo;
    }, initState)
    .toPairs()
    .reduce((memo, item) => (item[1] > memo[1] ? item : memo))
    .value();

  return (result[1] / data.length) >= 0.9 ? result[0] : null;
}
