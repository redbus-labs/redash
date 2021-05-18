import { isNaN, some, find, includes } from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';
import Modal from 'antd/lib/modal';
import Input from 'antd/lib/input';
import Select from 'antd/lib/select';
import Switch from 'antd/lib/switch';
import Divider from 'antd/lib/divider';
import Checkbox from 'antd/lib/checkbox';
import * as Grid from 'antd/lib/grid';
import { wrap as wrapDialog, DialogPropType } from '@/components/DialogWrapper';
import notification from '@/services/notification';
import { DataSource } from '@/services/data-source';
import { Query } from '@/services/query';

import './TableEditDialog.less';

class TableEditDialog extends React.Component {
  static propTypes = {
    dashboard: PropTypes.object.isRequired, // eslint-disable-line react/forbid-prop-types
    dialog: DialogPropType.isRequired,
    onConfirm: PropTypes.func.isRequired,
    text: PropTypes.string,
    options: PropTypes.object, // eslint-disable-line react/forbid-prop-types
  };

  static defaultProps = {
    text: '',
    options: {},
  };

  constructor(props) {
    super(props);
    const { text, options } = props;
    const { query, table, primaryKey, timeKey, dataSourceId,
      commands, filterCondition, isDeletable, columnDisplay, columnEdit, defaultValues,
      params, isVersioning, isSnapshotting, isMarkingUser } = options;
    const columnFormatting = {};
    const formatOptions = {};
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v) {
          columnFormatting[k] = v.type;
          formatOptions[k] = v.formatOptions;
        }
      });
    }
    this.state = {
      saveInProgress: false,
      text,
      query,
      dataSources: [],
      dataSource: null,
      dataSourceId,
      schema: [],
      table,
      columns: [],
      primaryKey,
      timeKey: timeKey || {},
      commands: commands || {},
      filterCondition: filterCondition || '',
      isDeletable: isDeletable || true,
      columnFormatting,
      columnDisplay: columnDisplay || {},
      columnEdit: columnEdit || {},
      defaultValues: defaultValues || {},
      formatOptions,
      isVersioning: isVersioning || false,
      isSnapshotting: isSnapshotting || false,
      isMarkingUser: isMarkingUser || false,
    };
    DataSource.query(ds => this.updateDataSources(ds));
  }

  onCommandChange = (value, type) => {
    this.setState(prevState => ({
      commands: {
        ...prevState.commands,
        [type]: value,
      },
    }));
  };

  onFilterCondition = (event) => {
    this.setState({ filterCondition: event.target.value });
  };

  onDeletableChange = (value) => {
    this.setState({ isDeletable: value });
  };

  onVersioningChange = (value) => {
    this.setState({ isVersioning: value });
  };

  onSnapshottingChange = (value) => {
    this.setState({ isSnapshotting: value });
  };

  onMarkingUserChange = (value) => {
    this.setState({ isMarkingUser: value });
  };

  onColumnFormatting = (value, col) => {
    this.setState(prevState => ({
      columnFormatting: {
        ...prevState.columnFormatting,
        [col]: value,
      },
    }));
  };

  onColumnDisplay = (value, col) => {
    if (!value) {
      this.onColumnEdit(false, col);
    }
    this.setState(prevState => ({
      columnDisplay: {
        ...prevState.columnDisplay,
        [col]: value,
      },
    }));
  };

  onColumnEdit = (value, col) => {
    this.setState(prevState => ({
      columnEdit: {
        ...prevState.columnEdit,
        [col]: value,
      },
    }));
  };

  onDefaultValues = (value, col) => {
    this.setState(prevState => ({
      defaultValues: {
        ...prevState.defaultValues,
        [col]: value,
      },
    }));
  };

  onFormatOptions = (value, col) => {
    this.setState(prevState => ({
      formatOptions: {
        ...prevState.formatOptions,
        [col]: value,
      },
    }));
  };

  onTimeSelected = (selected, type) => {
    if (type === 'user') {
      this.onColumnFormatting('string', selected);
    } else {
      this.onColumnFormatting('datetime-with-seconds', selected);
      this.onFormatOptions('YYYY-MM-DDTHH:mm:ss', selected);
    }
    this.onColumnEdit(false, selected);
    if (type === 'end') {
      this.onColumnDisplay(false, selected);
    }
    this.setState(prevState => ({
      timeKey: {
        ...prevState.timeKey,
        [type]: selected,
      },
    }));
  };

  onKeySelected = (selected) => {
    this.onColumnEdit(false, selected);
    this.setState({ primaryKey: selected });
  };

  onTableSelected = (selected) => {
    const table = selected;
    const columns = find(this.state.schema, t => t.name === table).columns;
    const display = {};
    const edit = {};
    const value = {};
    columns.forEach((col) => {
      display[col] = true;
      edit[col] = true;
      value[col] = null;
    });
    this.setState(prevState => ({
      table,
      columns,
      query: {
        ...prevState.query,
        query: `select * from ${table}`,
      },
      text: table,
      columnDisplay: {
        ...display,
        ...prevState.columnDisplay,
      },
      columnEdit: {
        ...edit,
        ...prevState.columnEdit,
      },
      defaultValues: {
        ...value,
        ...prevState.defaultValues,
      },
    }));
  };

  onDataSourceSelected = (selected) => {
    const dataSourceId = parseInt(selected, 10);
    const query = this.state.query;
    query.data_source_id = dataSourceId;
    this.setState(prevState => ({
      dataSourceId,
      dataSource: find(prevState.dataSources, ds => ds.id === dataSourceId),
      query: {
        ...prevState.query,
        data_source_id: dataSourceId,
      },
    }), () => this.getSchema(true));
  };

  getSchema(refresh = undefined) {
    new DataSource(this.state.dataSource).getSchema(refresh).then((data) => {
      if (data.schema) {
        this.setState({ schema: data.schema }, () => {
          this.onTableSelected(refresh ? data.schema[0].name : this.state.table || data.schema[0].name);
        });
      } else {
        notification.error('Schema refresh failed.', 'Please try again later.');
      }
    });
  }

  updateDataSources(dataSources) {
    const { query } = this.state;
    let dataSourceId = query ? query.data_source_id : undefined;
    if (dataSourceId === undefined) {
      dataSourceId = parseInt(localStorage.lastSelectedDataSourceId, 10);
    }
    const isValidDataSourceId = !isNaN(dataSourceId) && some(dataSources, ds => ds.id === dataSourceId);
    if (!isValidDataSourceId) {
      dataSourceId = dataSources[0].id;
    }
    const dataSource = find(dataSources, ds => ds.id === dataSourceId);
    let q = query;
    if (!query) {
      q = Query.newQuery();
      q.data_source_id = dataSourceId;
    }
    this.setState({ dataSources, dataSourceId, dataSource, query: q }, () => this.getSchema());
  }

  saveWidget() {
    this.setState({ saveInProgress: true });
    const { text, query, dataSource,
      dataSourceId, table, primaryKey, timeKey,
      columns, columnFormatting, columnDisplay, columnEdit, defaultValues, formatOptions,
      filterCondition, isDeletable, commands,
      isVersioning, isSnapshotting, isMarkingUser } = this.state;
    let queryText = query.query;
    if (isSnapshotting) {
      queryText += ` where ${timeKey.end} is null`;
      if (filterCondition !== '') {
        queryText += ` and ${filterCondition}`;
      }
    } else if (filterCondition !== '') {
      queryText += ` where ${filterCondition}`;
    }
    query.query = queryText;
    const params = {};
    columns.forEach((col) => {
      params[col] = {
        name: col,
        type: columnFormatting ? columnFormatting[col] : null,
        formatOptions: formatOptions ? formatOptions[col] : '',
        enumOptions: formatOptions ? formatOptions[col] : '',
        queryOptions: formatOptions ? formatOptions[col] : '',
        dateTimeFormat: formatOptions ? formatOptions[col] : '',
      };
    });

    this.props.onConfirm(text, { query,
      dataSource,
      dataSourceId,
      table,
      primaryKey,
      timeKey,
      commands,
      filterCondition,
      isDeletable,
      params,
      columnFormatting,
      columnEdit,
      columnDisplay,
      defaultValues,
      formatOptions,
      isVersioning,
      isSnapshotting,
      isMarkingUser,
      isTable: true })
      .then(() => {
        this.props.dialog.close();
      })
      .catch(() => {
        notification.error('Widget could not be added');
      })
      .finally(() => {
        this.setState({ saveInProgress: false });
      });
  }

  render() {
    const { dialog } = this.props;
    const isNew = !this.props.text;
    const columnFormats = ['string', 'number', 'boolean', 'enum',
      'datetime-with-seconds', 'query-enum'];

    return (
      <Modal
        {...dialog.props}
        title={isNew ? 'Add Table' : 'Edit Table'}
        onOk={() => this.saveWidget()}
        okButtonProps={{
          loading: this.state.saveInProgress,
          disabled: !this.state.text,
        }}
        okText={isNew ? 'Add to Dashboard' : 'Save'}
        width={500}
        wrapProps={{ 'data-test': 'TableEditDialog' }}
      >
        <div className="tableedit-dialog">

          <Grid.Row type="flex" align="middle" className="m-b-10">
            <Grid.Col span={8}>
              <label htmlFor="choose-data-source">Data Source:</label>
            </Grid.Col>
            <Grid.Col span={16}>
              <Select
                id="choose-data-source"
                className="form-control flex-fill w-100"
                value={this.state.dataSourceId}
                onChange={this.onDataSourceSelected}
                showSearch
                filterOption={(input, option) => option.props.children.toLowerCase().indexOf(input.toLowerCase()) >= 0}
              >
                {this.state.dataSources.map(ds => (
                  <Select.Option label={ds.name} value={ds.id} key={`ds-option-${ds.id}`}>
                    {ds.name}
                  </Select.Option>
                ))}
              </Select>
            </Grid.Col>
          </Grid.Row>
          <Grid.Row type="flex" align="middle" className="m-b-10">
            <Grid.Col span={8}>
              <label htmlFor="choose-table">Table:</label>
            </Grid.Col>
            <Grid.Col span={16}>
              <Select
                id="choose-table"
                className="form-control flex-fill w-100"
                value={this.state.table}
                onChange={this.onTableSelected}
                showSearch
                filterOption={(input, option) => option.props.children.toLowerCase().indexOf(input.toLowerCase()) >= 0}
              >
                {this.state.schema.map(t => (
                  <Select.Option value={t.name} key={`table-option-${t.name}`}>
                    {t.name}
                  </Select.Option>
                ))}
              </Select>
            </Grid.Col>
          </Grid.Row>
          <Grid.Row type="flex" align="middle" className="m-b-10">
            <Grid.Col span={8}>
              <label htmlFor="choose-id">Primary Key:</label>
            </Grid.Col>
            <Grid.Col span={16}>
              <Select
                id="choose-id"
                className="form-control flex-fill w-100"
                value={this.state.primaryKey}
                onChange={this.onKeySelected}
              >
                {this.state.columns.map(col => (
                  <Select.Option value={col} key={`col-option-${col}`}>
                    {col}
                  </Select.Option>
                ))}
              </Select>
            </Grid.Col>
          </Grid.Row>
          <Divider orientation="left">Versioning Options</Divider>
          <Grid.Row type="flex" align="middle" className="m-b-10">
            <Grid.Col span={8}>
              <label className="d-flex align-items-center" htmlFor="is-marking-user">
                <Switch
                  id="is-marking-user"
                  defaultChecked={this.state.isMarkingUser}
                  onChange={this.onMarkingUserChange}
                />
                <span className="m-l-10">Mark User</span>
              </label>
            </Grid.Col>
            <Grid.Col span={8}>
              <label className="d-flex align-items-center" htmlFor="is-versioning">
                <Switch
                  id="is-versioning"
                  defaultChecked={this.state.isVersioning}
                  onChange={this.onVersioningChange}
                />
                <span className="m-l-10">Version Data</span>
              </label>
            </Grid.Col>
            <Grid.Col span={8}>
              <label className="d-flex align-items-center" htmlFor="is-versioning">
                <Switch
                  id="is-versioning"
                  defaultChecked={this.state.isSnapshotting}
                  onChange={this.onSnapshottingChange}
                />
                <span className="m-l-10">Snapshot Data</span>
              </label>
            </Grid.Col>
          </Grid.Row>

          {this.state.isMarkingUser ? (
            <Grid.Row type="flex" align="middle" className="m-b-10">
              <Grid.Col span={8}>
                <label htmlFor="choose-user">Modified By User Column:</label>
              </Grid.Col>
              <Grid.Col span={16}>
                <Select
                  id="choose-user"
                  className="form-control flex-fill w-100"
                  value={this.state.timeKey.user}
                  onChange={s => this.onTimeSelected(s, 'user')}
                >
                  {this.state.columns.map(col => (
                    <Select.Option value={col} key={`col-option-${col}`}>
                      {col}
                    </Select.Option>
                  ))}
                </Select>
              </Grid.Col>
            </Grid.Row>
          ) : null}

          {this.state.isVersioning ? (
            <Grid.Row type="flex" align="middle" className="m-b-10">
              <Grid.Col span={8}>
                <label htmlFor="choose-time">Update Time Column:</label>
              </Grid.Col>
              <Grid.Col span={16}>
                <Select
                  id="choose-time"
                  className="form-control flex-fill w-100"
                  value={this.state.timeKey.update}
                  onChange={s => this.onTimeSelected(s, 'update')}
                >
                  {this.state.columns.map(col => (
                    <Select.Option value={col} key={`col-option-${col}`}>
                      {col}
                    </Select.Option>
                  ))}
                </Select>
              </Grid.Col>
            </Grid.Row>
          ) : null}

          {this.state.isSnapshotting ? (
            <Grid.Row type="flex" align="middle" className="m-b-10">
              <Grid.Col span={11} style={{ marginRight: 10 }}>
                <label htmlFor="choose-start-time">Start Time Column:</label>
                <Select
                  id="choose-start-time"
                  className="form-control flex-fill w-100"
                  value={this.state.timeKey.start}
                  onChange={s => this.onTimeSelected(s, 'start')}
                >
                  {this.state.columns.map(col => (
                    <Select.Option value={col} key={`col-option-${col}`}>
                      {col}
                    </Select.Option>
                  ))}
                </Select>
              </Grid.Col>
              <Grid.Col span={11}>
                <label htmlFor="choose-end-time">End Time Column:</label>
                <Select
                  id="choose-end-time"
                  className="form-control flex-fill w-100"
                  value={this.state.timeKey.end}
                  onChange={s => this.onTimeSelected(s, 'end')}
                >
                  {this.state.columns.map(col => (
                    <Select.Option value={col} key={`col-option-${col}`}>
                      {col}
                    </Select.Option>
                  ))}
                </Select>
              </Grid.Col>
            </Grid.Row>
          ) : null}

          <Divider orientation="left">Columns</Divider>
          <Grid.Row type="flex" align="middle" className="m-b-10">
            <Grid.Col span={2}>
              <h6>Hide</h6>
            </Grid.Col>
            <Grid.Col span={3}>
              <h6>Editable</h6>
            </Grid.Col>
            <Grid.Col span={8}>
              <h6>Column Name</h6>
            </Grid.Col>
            <Grid.Col span={11}>
              <h6>Column Type</h6>
            </Grid.Col>
          </Grid.Row>
          {this.state.columns.map(col => (
            <React.Fragment key={`fragment-${col}`}>
              <Grid.Row key={`format-row-${col}`} type="flex" align="middle" className="m-b-10">
                <Grid.Col key={`hide-col-${col}`} span={2}>
                  <Checkbox
                    key={`hide-checkbox-${col}`}
                    checked={!this.state.columnDisplay[col]}
                    onChange={e => this.onColumnDisplay(!e.target.checked, col)}
                  />
                </Grid.Col>
                <Grid.Col key={`edit-col-${col}`} span={3}>
                  <Checkbox
                    key={`edit-checkbox-${col}`}
                    checked={this.state.columnEdit[col]}
                    onChange={e => this.onColumnEdit(e.target.checked, col)}
                  />
                </Grid.Col>
                <Grid.Col key={`format-col-${col}`} span={8}>
                  <label key={`format-label-${col}`} htmlFor={`choose-${col}-format`}>{col}:</label>
                </Grid.Col>
                <Grid.Col key={`format-select-col-${col}`} span={11}>
                  <Select
                    id={`choose-${col}-format`}
                    key={`format-select-${col}`}
                    className="form-control flex-fill w-100"
                    value={this.state.columnFormatting[col]}
                    onSelect={value => this.onColumnFormatting(value, col)}
                  >
                    {columnFormats.map(format => (
                      <Select.Option value={format} key={`${col}-option-${format}`}>
                        {format}
                      </Select.Option>
                    ))}
                  </Select>
                </Grid.Col>
              </Grid.Row>

              {!this.state.columnEdit[col] &&
              !includes(Object.values(this.state.timeKey), col) &&
              col !== this.state.primaryKey ? (
                <Grid.Row key={`default-column-${col}`} type="flex" align="middle" className="m-b-10">
                  <Grid.Col key={`default-col-${col}`} span={8}>
                    <label key={`default-label-${col}`} htmlFor={`choose-${col}-default`}>Default Value:</label>
                  </Grid.Col>
                  <Grid.Col key={`default-select-col-${col}`} span={16}>
                    <Input
                      key={`default-data-${col}`}
                      placeholder="Default Value..."
                      value={this.state.defaultValues[col]}
                      onChange={event => this.onDefaultValues(event.target.value, col)}
                    />
                  </Grid.Col>
                </Grid.Row>
                ) : null}

              {this.state.columnFormatting[col] === 'enum' ? (
                <Grid.Row key={`format-column-${col}`} type="flex" align="middle" className="m-b-10">
                  <Input.TextArea
                    key={`format-data-${col}`}
                    rows={3}
                    placeholder="Dropdown Options..."
                    value={this.state.formatOptions[col]}
                    onChange={event => this.onFormatOptions(event.target.value, col)}
                  />
                </Grid.Row>
              ) : null}

              {this.state.columnFormatting[col] === 'query-enum' ? (
                <Grid.Row key={`format-column-${col}`} type="flex" align="middle" className="m-b-10">
                  <Input
                    key={`format-data-${col}`}
                    placeholder="Query for Dropdown Options..."
                    value={this.state.formatOptions[col]}
                    onChange={event => this.onFormatOptions(event.target.value, col)}
                  />
                </Grid.Row>
              ) : null}

              {includes(['date', 'datetime-local', 'datetime-with-seconds'], this.state.columnFormatting[col]) ? (
                <Grid.Row key={`format-column-${col}`} type="flex" align="middle" className="m-b-10">
                  <Input
                    key={`format-data-${col}`}
                    placeholder="Date Format..."
                    value={this.state.formatOptions[col]}
                    onChange={event => this.onFormatOptions(event.target.value, col)}
                  />
                </Grid.Row>
              ) : null}
            </React.Fragment>
          ))}
          <Divider />
          <label htmlFor="data-query">{this.state.query ? this.state.query.query : ''} where</label>
          <Input
            id="data-query"
            className="form-control flex-fill w-100"
            placeholder="Filter Condition ..."
            value={this.state.filterCondition}
            onChange={this.onFilterCondition}
          />
          <br />
          <br />
          <Input
            className="form-control flex-fill w-100"
            placeholder="insert into {{table}} ({{currentColumns}}) values ({{currentRowValues}});"
            value={this.state.commands.add}
            onChange={e => this.onCommandChange(e.target.value, 'add')}
          />
          {this.state.isSnapshotting ? (
            <Input
              className="form-control flex-fill w-100"
              placeholder="update {{table}} set {{endtime}}='{{currentTime}}' where {{primaryKey}} = {{currentKey}} and {{endtime}} is null;"
              value={this.state.commands.update}
              onChange={e => this.onCommandChange(e.target.value, 'update')}
            />
          ) : (
            <Input
              className="form-control flex-fill w-100"
              placeholder="delete from {{table}} where {{primaryKey}} = {{currentKey}};"
              value={this.state.commands.delete}
              onChange={e => this.onCommandChange(e.target.value, 'delete')}
            />
          )}
          <br />
          <br />
          <label className="d-flex align-items-center" htmlFor="is-deletable">
            <Switch
              id="is-deletable"
              defaultChecked={this.state.isDeletable}
              onChange={this.onDeletableChange}
            />
            <span className="m-l-10">Delete Button</span>
          </label>
        </div>
      </Modal>
    );
  }
}

export default wrapDialog(TableEditDialog);
