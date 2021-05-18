/* eslint-disable react/prop-types */
import React from 'react';
import { createTextFormatter } from '@/lib/value-format';
import { $sce } from '@/services/ng';

export default function initTextColumn(column) {
  const format = createTextFormatter(column.allowHTML && column.highlightLinks);

  function prepareData(row) {
    return {
      text: format(row[column.name]),
    };
  }

  function TextColumn({ row }) {
    const { text } = prepareData(row);
    let value = text;
    if (column.allowHTML) {
      value = (
        <div
          dangerouslySetInnerHTML={{ __html: $sce.trustAsHtml(text) }} // eslint-disable-line react/no-danger
        />
      );
    }
    return value;
  }

  TextColumn.prepareData = prepareData;

  return TextColumn;
}

initTextColumn.friendlyName = 'Text';
