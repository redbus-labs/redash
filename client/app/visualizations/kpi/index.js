import { registerVisualization } from '@/visualizations';

import Renderer from './Renderer';
import Editor from './Editor';

const DEFAULT_OPTIONS = {
  kpiLabel: '',
  kpiColName: 'KPI',
  rowNumber: 1,
  targetRowNumber: 1,
  stringDecimal: 0,
  stringDecChar: '.',
  stringThouSep: ',',
  stringDeltaDecimal: '.',
  kpiDeltaValuePrefixLabel: '',
  kpiDeltaValueSuffixLabel: '',
  // formatDeltaValue:
  tooltipFormat: '0,0.000', // TODO: Show in editor
};

export default function init() {
  registerVisualization({
    type: 'KPI',
    name: 'KPI',
    getOptions: options => ({ ...DEFAULT_OPTIONS, ...options }),
    Renderer,
    Editor,

    defaultColumns: 2,
    defaultRows: 5,
  });
}

init.init = true;
