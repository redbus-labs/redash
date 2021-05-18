import React, { useState, useContext, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { forIn, isEqual, includes } from 'lodash';
import { react2angular } from 'react2angular';
import { Query, isDynamicDate, getDynamicDate } from '@/services/query';
import notification from '@/services/notification';
import { getColumnCleanName } from '@/services/query-result';
import useQueryResult from '@/lib/hooks/useQueryResult';
import ParameterValueInput from '@/components/ParameterValueInput';
import { Table, Input, InputNumber, Checkbox, Select, Button, Popconfirm, Form } from 'antd';
import * as Grid from 'antd/lib/grid';

import './EditableTable.less';

import initTextColumn from './columns/text';
import initNumberColumn from './columns/number';
import initDateTimeColumn from './columns/datetime';
import initBooleanColumn from './columns/boolean';
import initLinkColumn from './columns/link';
import initImageColumn from './columns/image';
import initJsonColumn from './columns/json';

const ColumnTypes = {
  string: initTextColumn,
  number: initNumberColumn,
  datetime: initDateTimeColumn,
  boolean: initBooleanColumn,
  link: initLinkColumn,
  image: initImageColumn,
  json: initJsonColumn,
};

function getCurrentTime() {
  return getDynamicDate('d_now').value();
}

function getCurrentTimeString(value) {
  const dateFormatting = initDateTimeColumn({ name: 'a', dateTimeFormat: 'YYYY-MM-DDTHH:mm:ss.sss' });
  if (value) {
    return dateFormatting({ row: { a: value } });
  }
  return dateFormatting({ row: { a: getCurrentTime() } });
}

function getColumnContentAlignment(type) {
  return includes(['integer', 'float', 'boolean', 'date', 'datetime'], type) ? 'right' : 'left';
}

function getDefaultColumnsOptions(columns, isEditing, primaryKey, columnEdit, columnDisplay, params) {
  const displayAs = {
    integer: 'number',
    float: 'number',
    boolean: 'boolean',
    date: 'datetime',
    timestamp: 'datetime',
    datetime: 'datetime',
  };

  function comparator(a, b, type) {
    // Null Handling first
    if (a !== null && b !== null) {
      if (type === 'number') {
        return a - b;
      }
      if (type === 'datetime') {
        const timeDiff = a.diff(b, 'seconds');
        if (timeDiff > 0) {
          return 1;
        }
        if (timeDiff < 0) {
          return -1;
        }
        return 0;
      }
      if (type === 'boolean') {
        if (!a && b) {
          return 1;
        }
        if (a && !b) {
          return -1;
        }
        return 0;
      }
      if (a.toLowerCase() > b.toLowerCase()) {
        return 1;
      }
      if (b.toLowerCase() > a.toLowerCase()) {
        return -1;
      }
      return 0;
    }
    if (a !== null) { return -1; }
    if (b !== null) { return 1; }
  }

  const editColumns = columns.map((col) => {
    const initColumn = ColumnTypes[displayAs[col.type] || 'string'];
    const renderCol = {
      name: col.name,
      type: col.type,
      dateTimeFormat: params && params[col.name] ? params[col.name].formatOptions : 'YYYY-MM-DD',
    };
    const Component = initColumn(renderCol);
    const displayType = displayAs[col.type] || 'string';

    const result = {
      name: col.name,
      type: col.type,
      displayAs: displayType,
      title: getColumnCleanName(col.name),
      dataIndex: getColumnCleanName(col.name),
      alignContent: getColumnContentAlignment(col.type),
      sorter: (a, b) => comparator(a[col.name], b[col.name], displayType),
      render: (value, row) => ({
        children: <Component row={row} />,
        props: { className: `display-as-${displayType}` },
      }),
      onCell: record => ({
        record,
        inputType: displayType,
        dataIndex: getColumnCleanName(col.name),
        title: getColumnCleanName(col.name),
        editing: isEditing(record),
        editable: columnEdit[col.name],
        param: params ? params[col.name] : {},
      }),
    };
    return result;
  });

  return editColumns.filter(col => columnDisplay[col.name]);
}

const EditableContext = React.createContext();

function EditableCell(props) {
  const cellData = useContext(EditableContext);
  const { getFieldDecorator, handleChange } = cellData;

  const getInput = (column, type, data, param) => {
    const paramType = param.type || type;

    if (paramType === 'boolean') {
      return (
        <Checkbox
          defaultChecked={data}
          onChange={e => handleChange(e.target.checked, column, type)}
        />
      );
    } else if (paramType === 'number') {
      return (
        <InputNumber
          onChange={value => handleChange(value, column, type)}
        />
      );
    }
    return (
      <ParameterValueInput
        type={paramType === 'query-enum' ? 'enum' : paramType}
        parameter={param}
        enumOptions={param.enumOptions || ''}
        allowMultipleValues={false}
        onSelect={value => handleChange(value, column, type)}
      />
    );
  };

  const renderCell = () => {
    // eslint-disable-next-line react/prop-types
    const { editing, editable, dataIndex, param, title, inputType, record, index, children, ...restProps } = props;
    if (editing) {
      if (editable) {
        return (
          <td style={{ minWidth: 100 }} {...restProps}>
            <Form.Item style={{ margin: 0 }}>
              {getFieldDecorator(dataIndex, {
                rules: [
                  {
                    required: dataIndex === 'id',
                    message: `Please Input ${title}!`,
                  },
                ],
                initialValue: record[dataIndex],
              })(getInput(dataIndex, inputType, record[dataIndex], param))}
            </Form.Item>
          </td>
        );
      }
      return (
        <td style={{ minWidth: 100, backgroundColor: 'lightgray' }} {...restProps}>
          {children}
        </td>
      );
    }
    return (
      <td style={{ minWidth: 100 }} {...restProps}>
        {children}
      </td>
    );
  };

  return <EditableContext.Consumer>{renderCell}</EditableContext.Consumer>;
}

export function EditableTable(props) {
  const key = props.options.primaryKey;
  const userName = props.currentUserName;
  const { commands, table, isDeletable,
    params, timeKey, isSnapshotting,
    columnEdit, columnDisplay, defaultValues } = props.options;

  const originalData = useQueryResult(props.queryResult);
  const [data, setData] = useState(originalData.rows);
  const [displayData, setDisplayData] = useState(originalData.rows);

  const [editingKey, setEditingKey] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [maxKey, setMaxKey] = useState(Math.max(...originalData.rows.map(r => r.id)));
  const [tempKey, setTempKey] = useState(1);
  const [addedKeys, setAddedKeys] = useState([]);
  const [editingRow, setEditingRow] = useState({});
  const [queriesToRun, setQueriesToRun] = useState({});
  const [updating, setUpdating] = useState(false);
  const [searchCol, setSearchCol] = useState();
  const searchInputRef = useRef();

  function onPageChange(pageNumber) {
    setCurrentPage(pageNumber);
    cancel();
  }

  const isEditing = record => record[key] === editingKey;

  function cancel() {
    setEditingKey('');
    setEditingRow({});
  }

  function edit(row) {
    if (timeKey) {
      if (timeKey.update) {
        row[timeKey.update] = getCurrentTime();
      }
      if (timeKey.start) {
        row[timeKey.start] = getCurrentTime();
        row[timeKey.end] = null;
      }
      if (timeKey.user) {
        row[timeKey.user] = userName;
      }
    }
    setEditingKey(row[key]);
    setEditingRow(row);
  }

  function save(editKey) {
    const newQueries = queriesToRun;
    const editData = data.map((item) => {
      if (editKey === item[key]) {
        return editingRow;
      }
      return item;
    });
    setData(editData);
    if (addedKeys.filter(item => item === editKey).length === 0) {
      newQueries[`add-${editKey}`] = formatCommand(commands.add, '', '', false);
      if (isSnapshotting) {
        newQueries[`update-${editKey}`] = formatCommand(commands.update, editKey, getCurrentTimeString(editingRow[timeKey.start]));
      } else {
        newQueries[`delete-${editKey}`] = formatCommand(commands.delete, editKey);
      }
    } else {
      newQueries[`add-${editKey}`] = formatCommand(commands.add, '', '', true);
    }
    showSubmitMessage();
    setQueriesToRun(newQueries);
    setEditingKey('');
    setEditingRow({});
  }

  function deleteRow(editKey) {
    const editData = data.filter(item => editKey !== item[key]);
    setData(editData);
    const newQueries = queriesToRun;
    delete newQueries[`add-${editKey}`];
    if (addedKeys.filter(item => item === editKey).length > 0) {
      setAddedKeys(addedKeys.filter(item => item !== editKey));
      if (editKey === maxKey) {
        setMaxKey(maxKey - 1);
        setTempKey(tempKey - 1);
      }
    } else {
      if (isSnapshotting) {
        newQueries[`update-${editKey}`] = formatCommand(commands.update, editKey, getCurrentTimeString());
      } else {
        newQueries[`delete-${editKey}`] = formatCommand(commands.delete, editKey);
      }
      setQueriesToRun(newQueries);
    }
    showSubmitMessage();
  }

  function addRow() {
    const editData = data;
    const newRow = { [key]: maxKey + 1 };
    if (timeKey) {
      if (timeKey.update) {
        newRow[timeKey.update] = getCurrentTime();
      }
      if (timeKey.start) {
        newRow[timeKey.start] = getCurrentTime();
        newRow[timeKey.end] = null;
      }
      if (timeKey.user) {
        newRow[timeKey.user] = userName;
      }
    }
    Object.entries(columnEdit).forEach(([col, editable]) => {
      if (!editable && !includes(Object.values(timeKey), col) && col !== key) {
        newRow[col] = defaultValues[col];
      }
    });
    editData.push(newRow);
    setData(editData);
    setCurrentPage(editData.length / 10 + 1);
    setAddedKeys([...addedKeys, maxKey + 1]);
    setEditingKey(maxKey + 1);
    setEditingRow(newRow);
    setMaxKey(maxKey + 1);
  }

  function handleChange(value, column, columnType) {
    if (columnType === 'datetime' && isDynamicDate(value)) {
      setEditingRow({ ...editingRow, [column]: getDynamicDate(value).value() });
    } else {
      setEditingRow({ ...editingRow, [column]: value });
    }
  }

  function showSubmitMessage() {
    notification.warning('Press submit button to make your changes permanent.');
  }

  function submitChanges() {
    const deleteQueries = [];
    const updateQueries = [];
    const insertQueries = [];
    forIn(queriesToRun, (v, k) => {
      if (k.startsWith('delete')) {
        deleteQueries.push(v);
      } else if (k.startsWith('add')) {
        insertQueries.push(v);
      } else if (k.startsWith('update')) {
        updateQueries.push(v);
      } else {
        // ignore for now
      }
    });
    setUpdating(true);
    const queryText = deleteQueries.join(' ') + updateQueries.join(' ') + insertQueries.join(' ') + 'select 1;';
    new Query(props.options.query)
      .getQueryResultByText(0, queryText)
      .toPromise()
      .then(() => {
        notification.success('Table Updated Successfully!');
        setQueriesToRun({});
        setAddedKeys([]);
      })
      .catch(error => notification.error('Update Table failed.', error.errorMessage))
      .finally(() => setUpdating(false));
  }

  const components = {
    body: {
      cell: EditableCell,
    },
  };

  const lastColumn = {
    name: 'actions',
    type: 'string',
    displayAs: 'string',
    title: 'actions',
    dataIndex: 'actions',
    alignContent: 'left',
    render: (unused, row) => {
      const isEdit = isEditing(row);
      return isEdit ? (
        <span>
          <Popconfirm title="Confirm Save?" onConfirm={() => save(row[key])}>
            <a style={{ marginRight: 8 }}>Save</a>
          </Popconfirm>
          <a onClick={cancel}>Cancel</a>
        </span>
      ) : (
        <span>
          <a disabled={editingKey !== ''} onClick={() => edit(row)} style={{ marginRight: 8 }}>
            Edit
          </a>
          {isDeletable ? (
            <Popconfirm title="Sure to delete?" onConfirm={() => deleteRow(row[key])}>
              <a>
                Delete
              </a>
            </Popconfirm>
          ) : null}
        </span>
      );
    },
  };
  const columns = [
    ...getDefaultColumnsOptions(originalData.columns, isEditing, key, columnEdit, columnDisplay, params),
    lastColumn,
  ];

  function filterTable(event) {
    const searchTerm = event.target.value;
    if (searchCol && searchTerm !== '') {
      const filterData = data.filter((item) => {
        if (item[searchCol]) {
          return item[searchCol].toLowerCase().indexOf(searchTerm.toLowerCase()) >= 0;
        }
        return false;
      });
      setDisplayData(filterData);
    } else {
      setDisplayData(data);
    }
  }

  useEffect(() => {
    if (searchInputRef.current) {
      // pass value and fake event-like object
      searchInputRef.current.input.setValue('', { target: { value: '' } });
    }
  }, [data, searchCol, searchInputRef]);

  function formatCommand(command, editKey, currentTime, isNew) {
    let currentRowValues = '';
    const currentColumns = [];
    Object.entries(editingRow).forEach(([k, v]) => {
      currentColumns.push(k);
      const col = originalData.columns.filter(item => k === item.name)[0];
      let value = v;
      if (col.name === key && isNew) {
        value = `(select max(${key}) from ${table}) + ${tempKey}`;
        setTempKey(tempKey + 1);
      } else if (col.type === 'string' && v) {
        value = '\'' + v + '\'';
      } else if (col.type === 'datetime' && v) {
        value = '\'' + getCurrentTimeString(v) + '\'';
      }
      currentRowValues += currentRowValues === '' ? value : ',' + value;
    });
    return command
      .replace('{{table}}', table)
      .replace('{{primaryKey}}', key)
      .replace('{{currentKey}}', editKey)
      .replace('{{currentRowValues}}', currentRowValues)
      .replace('{{currentColumns}}', '"' + currentColumns.join('", "') + '"')
      .replace('{{endtime}}', timeKey.end)
      .replace('{{endtime}}', timeKey.end)
      .replace('{{currentTime}}', currentTime);
  }

  const contextData = props.form;
  contextData.handleChange = handleChange;

  return (
    <React.Fragment>
      <Grid.Row type="flex" align="middle" className="m-b-10">
        <Grid.Col span={3}>
          <label htmlFor="search-col">Search in Column: </label>
        </Grid.Col>
        <Grid.Col span={4} style={{ marginRight: 16 }}>
          <Select
            id="search-col"
            className="form-control flex-fill w-100"
            onSelect={value => setSearchCol(value)}
          >
            {originalData.columns.map((col) => {
              const colName = col.name;
              return col.type === 'string' ? (
                <Select.Option value={colName} key={`col-option-${colName}`}>
                  {colName}
                </Select.Option>
              ) : null;
            })}
          </Select>
        </Grid.Col>
        <Grid.Col span={16}>
          <Input.Search
            ref={searchInputRef}
            placeholder="Search..."
            onChange={filterTable}
            enterButton
          />
        </Grid.Col>
      </Grid.Row>
      <EditableContext.Provider value={contextData}>
        <Table
          components={components}
          bordered
          dataSource={displayData}
          columns={columns}
          rowKey={record => record[key]}
          rowClassName="editable-row"
          pagination={{
            size: 'small',
            position: 'bottom',
            pageSize: 10,
            hideOnSinglePage: true,
            current: currentPage,
            onChange: onPageChange,
          }}
        />
      </EditableContext.Provider>
      <br />
      <Button
        type="primary"
        loading={updating}
        disabled={editingKey !== '' || isEqual(queriesToRun, {}) || updating}
        onClick={submitChanges}
        style={{ marginRight: 8 }}
      >
        Submit Changes
      </Button>
      <Button onClick={addRow} disabled={editingKey !== ''}>
        Add Row
      </Button>
    </React.Fragment>
  );
}

export function TableRenderer(props) {
  const TableForm = Form.create()(EditableTable);

  return <TableForm {...props} />;
}

EditableTable.propTypes = {
  options: PropTypes.object.isRequired, // eslint-disable-line react/forbid-prop-types
  queryResult: PropTypes.object.isRequired, // eslint-disable-line react/forbid-prop-types
  form: PropTypes.object.isRequired, // eslint-disable-line react/forbid-prop-types
  currentUserName: PropTypes.string.isRequired,
};

TableRenderer.propTypes = {
  options: PropTypes.object.isRequired, // eslint-disable-line react/forbid-prop-types
  queryResult: PropTypes.object.isRequired, // eslint-disable-line react/forbid-prop-types
  currentUserName: PropTypes.string.isRequired,
};

export default function init(ngModule) {
  ngModule.component('tableRenderer', react2angular(TableRenderer));
}

init.init = true;
