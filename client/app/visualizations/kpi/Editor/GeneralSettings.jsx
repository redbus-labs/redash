import { map } from 'lodash';
import React from 'react';
import * as Grid from 'antd/lib/grid';
import Select from 'antd/lib/select';
import Input from 'antd/lib/input';
import InputNumber from 'antd/lib/input-number';
import Switch from 'antd/lib/switch';
import { EditorPropTypes } from '@/visualizations';

export default function GeneralSettings({ options, data, visualizationName, onOptionsChange }) {
  return (
    <React.Fragment>
      <Grid.Row type="flex" align="middle" className="m-b-10">
        <Grid.Col span={12}>
          <label htmlFor="kpi-label">Kpi Label</label>
        </Grid.Col>
        <Grid.Col span={12}>
          <Input
            id="kpi-label"
            className="w-100"
            data-test="Kpi.General.Label"
            defaultValue={options.kpiLabel}
            placeholder={visualizationName}
            onChange={e => onOptionsChange({ kpiLabel: e.target.value })}
          />
        </Grid.Col>
      </Grid.Row>

      <Grid.Row type="flex" align="middle" className="m-b-10">
        <Grid.Col span={12}>
          <label htmlFor="kpi-value-column">Kpi Value Column Name</label>
        </Grid.Col>
        <Grid.Col span={12}>
          <Select
            id="kpi-value-column"
            className="w-100"
            data-test="Kpi.General.ValueColumn"
            defaultValue={options.kpiColName}
            disabled={options.countRow}
            onChange={kpiColName => onOptionsChange({ kpiColName })}
          >
            {map(data.columns, col => (
              <Select.Option key={col.name} data-test={'Kpi.General.ValueColumn.' + col.name}>{col.name}</Select.Option>
            ))}
          </Select>
        </Grid.Col>
      </Grid.Row>

      <Grid.Row type="flex" align="middle" className="m-b-10">
        <Grid.Col span={12}>
          <label htmlFor="kpi-value-row-number">Kpi Value Row Number</label>
        </Grid.Col>
        <Grid.Col span={12}>
          <InputNumber
            id="kpi-value-row-number"
            className="w-100"
            data-test="Kpi.General.ValueRowNumber"
            defaultValue={options.rowNumber}
            disabled={options.countRow}
            onChange={rowNumber => onOptionsChange({ rowNumber })}
          />
        </Grid.Col>
      </Grid.Row>

      <Grid.Row type="flex" align="middle" className="m-b-10">
        <Grid.Col span={12}>
          <label htmlFor="kpi-target-value-column">Target Value Column Name</label>
        </Grid.Col>
        <Grid.Col span={12}>
          <Select
            id="kpi-target-value-column"
            className="w-100"
            data-test="Kpi.General.TargetValueColumn"
            defaultValue={options.targetColName}
            onChange={targetColName => onOptionsChange({ targetColName })}
          >
            <Select.Option value="">No target value</Select.Option>
            {map(data.columns, col => (
              <Select.Option key={col.name} data-test={'Kpi.General.TargetValueColumn.' + col.name}>{col.name}</Select.Option>
            ))}
          </Select>
        </Grid.Col>
      </Grid.Row>

      <Grid.Row type="flex" align="middle" className="m-b-10">
        <Grid.Col span={12}>
          <label htmlFor="kpi-target-row-number">Target Value Row Number</label>
        </Grid.Col>
        <Grid.Col span={12}>
          <InputNumber
            id="kpi-target-row-number"
            className="w-100"
            data-test="Kpi.General.TargetValueRowNumber"
            defaultValue={options.targetRowNumber}
            onChange={targetRowNumber => onOptionsChange({ targetRowNumber })}
          />
        </Grid.Col>
      </Grid.Row>

      <Grid.Row type="flex" align="middle" className="m-b-10">
        <Grid.Col span={12}>
          <label htmlFor="kpi-delta-value-prefix-label">Delta Value Prefix Label</label>
        </Grid.Col>
        <Grid.Col span={12}>
          <Input
            id="kpi-delta-value-prefix-label"
            className="w-100"
            data-test="Kpi.General.KpiDeltaValuePrefixLabel"
            defaultValue={options.kpiDeltaValuePrefixLabel}
            placeholder=""
            onChange={e => onOptionsChange({ kpiDeltaValuePrefixLabel: e.target.value })}
          />
        </Grid.Col>
      </Grid.Row>

      <Grid.Row type="flex" align="middle" className="m-b-10">
        <Grid.Col span={12}>
          <label htmlFor="kpi-delta-value-suffix-label">Delta Value Suffix Label</label>
        </Grid.Col>
        <Grid.Col span={12}>
          <Input
            id="kpi-delta-value-suffix-label"
            className="w-100"
            data-test="Kpi.General.KpiDeltaValueSuffixLabel"
            defaultValue={options.kpiDeltaValueSuffixLabel}
            placeholder=""
            onChange={e => onOptionsChange({ kpiDeltaValueSuffixLabel: e.target.value })}
          />
        </Grid.Col>
      </Grid.Row>

      <label className="d-flex align-items-center" htmlFor="kpi-show-trend-color">
        <Switch
          id="kpi-show-trend-color"
          data-test="Kpi.Formatting.ShowTrendColor"
          defaultChecked={options.showTrendColor}
          onChange={showTrendColor => onOptionsChange({ showTrendColor })}
        />
        <span className="m-l-10">Show Trend with Color</span>
      </label>

      <label className="d-flex align-items-center" htmlFor="kpi-show-trend-icon">
        <Switch
          id="kpi-show-trend-icon"
          data-test="Kpi.Formatting.ShowTrendIcon"
          defaultChecked={options.showTrendIcon}
          onChange={showTrendIcon => onOptionsChange({ showTrendIcon })}
        />
        <span className="m-l-10">Show Trend Icon</span>
      </label>

      <label className="d-flex align-items-center" htmlFor="kpi-show-target-value">
        <Switch
          id="kpi-show-target-value"
          data-test="Kpi.Formatting.ShowTargetValue"
          defaultChecked={options.showTargetValue}
          onChange={showTargetValue => onOptionsChange({ showTargetValue })}
        />
        <span className="m-l-10">Show Target Value</span>
      </label>

      <label className="d-flex align-items-center" htmlFor="kpi-count-rows">
        <Switch
          id="kpi-count-rows"
          data-test="Kpi.General.CountRows"
          defaultChecked={options.countRow}
          onChange={countRow => onOptionsChange({ countRow })}
        />
        <span className="m-l-10">Count Rows</span>
      </label>
    </React.Fragment>
  );
}

GeneralSettings.propTypes = EditorPropTypes;
