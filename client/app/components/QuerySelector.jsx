import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import cx from 'classnames';
import { react2angular } from 'react2angular';
import { debounce, find } from 'lodash';
import Input from 'antd/lib/input';
import Select from 'antd/lib/select';
import { Query } from '@/services/query';
import notification from '@/services/notification';
import { QueryTagsControl } from '@/components/tags-control/TagsControl';

const SEARCH_DEBOUNCE_DURATION = 200;
const { Option } = Select;

class StaleSearchError extends Error {
  constructor() {
    super('stale search');
  }
}

function search(term) {
  // get recent
  if (!term) {
    return Query.recent().$promise
      .then((results) => {
        const filteredResults = results.filter(item => !item.is_draft); // filter out draft
        return Promise.resolve(filteredResults);
      });
  }

  // search by query
  return Query.query({ q: term }).$promise
    .then(({ results }) => Promise.resolve(results));
}

export function QuerySelector(props) {
  const [searchTerm, setSearchTerm] = useState();
  const [searching, setSearching] = useState();
  const [searchResults, setSearchResults] = useState([]);
  const [selectedQuery, setSelectedQuery] = useState();

  let isStaleSearch = false;
  const debouncedSearch = debounce(_search, SEARCH_DEBOUNCE_DURATION);
  const placeholder = 'Search a query by name';
  const clearIcon = <i className="fa fa-times" onClick={() => selectQuery(null)} />;
  const spinIcon = <i className={cx('fa fa-spinner fa-pulse', { hidden: !searching })} />;

  // set selected from prop
  useEffect(() => {
    if (props.selectedQuery) {
      setSelectedQuery(props.selectedQuery);
    }
  }, [props.selectedQuery]);

  // on search term changed, debounced
  useEffect(() => {
    // clear results, no search
    if (searchTerm === null) {
      setSearchResults(null);
      return () => {};
    }

    // search
    debouncedSearch(searchTerm);
    return () => {
      debouncedSearch.cancel();
      isStaleSearch = true;
    };
  }, [searchTerm]);

  function _search(term) {
    setSearching(true);
    search(term)
      .then(rejectStale)
      .then((results) => {
        setSearchResults(results);
        setSearching(false);
      })
      .catch((err) => {
        if (!(err instanceof StaleSearchError)) {
          setSearching(false);
        }
      });
  }

  function rejectStale(results) {
    return isStaleSearch
      ? Promise.reject(new StaleSearchError())
      : Promise.resolve(results);
  }

  function selectQuery(queryId) {
    let query = null;
    if (queryId) {
      query = find(searchResults, { id: queryId });
      if (!query) { // shouldn't happen
        notification.error('Something went wrong...', 'Couldn\'t select query');
      }
    }

    setSearchTerm(query ? null : ''); // empty string triggers recent fetch
    setSelectedQuery(query);
    props.onChange(query);
  }

  function renderResults() {
    if (!searchResults.length) {
      return <div className="text-muted">No results matching search term.</div>;
    }

    return (
      <div className="list-group">
        {searchResults.map(q => (
          <a
            className={cx('query-selector-result', 'list-group-item', { inactive: q.is_draft })}
            key={q.id}
            onClick={() => selectQuery(q.id)}
            data-test={`QueryId${q.id}`}
          >
            {q.name}
            {' '}
            <QueryTagsControl isDraft={q.is_draft} tags={q.tags} className="inline-tags-control" />
          </a>
        ))}
      </div>
    );
  }

  if (props.disabled) {
    return <Input value={selectedQuery && selectedQuery.name} placeholder={placeholder} disabled />;
  }

  if (props.type === 'select') {
    const suffixIcon = selectedQuery ? clearIcon : null;
    const value = selectedQuery ? selectedQuery.name : searchTerm;

    return (
      <Select
        showSearch
        dropdownMatchSelectWidth={false}
        placeholder={placeholder}
        value={value || undefined} // undefined for the placeholder to show
        onSearch={setSearchTerm}
        onChange={selectQuery}
        suffixIcon={searching ? spinIcon : suffixIcon}
        notFoundContent={null}
        filterOption={false}
        defaultActiveFirstOption={false}
      >
        {searchResults && searchResults.map((q) => {
          const disabled = q.is_draft;
          return (
            <Option value={q.id} key={q.id} disabled={disabled}>
              {q.name}{' '}
              <QueryTagsControl isDraft={q.is_draft} tags={q.tags} className={cx('inline-tags-control', { disabled })} />
            </Option>
          );
        })}
      </Select>
    );
  }

  return (
    <React.Fragment>
      {selectedQuery ? (
        <Input value={selectedQuery.name} suffix={clearIcon} readOnly />
      ) : (
        <Input
          placeholder={placeholder}
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          suffix={spinIcon}
        />
      )}
      <div className="scrollbox" style={{ maxHeight: '50vh', marginTop: 15 }}>
        {searchResults && renderResults()}
      </div>
    </React.Fragment>
  );
}

QuerySelector.propTypes = {
  onChange: PropTypes.func.isRequired,
  selectedQuery: PropTypes.object, // eslint-disable-line react/forbid-prop-types
  type: PropTypes.oneOf(['select', 'default']),
  disabled: PropTypes.bool,
};

QuerySelector.defaultProps = {
  selectedQuery: null,
  type: 'default',
  disabled: false,
};

export default function init(ngModule) {
  ngModule.component('querySelector', react2angular(QuerySelector));
}

init.init = true;
