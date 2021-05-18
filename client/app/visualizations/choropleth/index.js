import _ from 'lodash';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { formatSimpleTemplate } from '@/lib/value-format';
import 'leaflet-fullscreen';
import 'leaflet-fullscreen/dist/leaflet.fullscreen.css';
import { angular2react } from 'angular2react';
import { registerVisualization } from '@/visualizations';
import ColorPalette from '@/visualizations/ColorPalette';

import {
  AdditionalColors,
  darkenColor,
  createNumberFormatter,
  prepareData,
  getValueForFeature,
  createScale,
  prepareFeatureProperties,
  getColorByValue,
  inferCountryCodeType,
} from './utils';

import template from './choropleth.html';
import editorTemplate from './choropleth-editor.html';

import countriesDataUrl from './countries.geo.json';
import subdivJapanDataUrl from './japan.prefectures.geo.json';
import stateIndiaDataUrl from './india.state.geo.json';

import andamanNicobarIndiaDataUrl from './india.andaman_and_nicobar.geo.json';
import andhraPradeshIndiaDataUrl from './india.andhra_pradesh.geo.json';
import arunachalPradeshIndiaDataUrl from './india.arunachal_pradesh.geo.json';
import assamIndiaDataUrl from './india.assam.geo.json';
import biharIndiaDataUrl from './india.bihar.geo.json';
import chandigarhIndiaDataUrl from './india.chandigarh.geo.json';
import chhattisgarhIndiaDataUrl from './india.chhattisgarh.geo.json';
import dadraNagarIndiaDataUrl from './india.dadra_and_nagar_have.geo.json';
import damanDiuIndiaDataUrl from './india.daman_and_diu.geo.json';
import delhiIndiaDataUrl from './india.delhi.geo.json';
import goaIndiaDataUrl from './india.goa.geo.json';
import gujaratIndiaDataUrl from './india.gujarat.geo.json';
import haryanaIndiaDataUrl from './india.haryana.geo.json';
import himachalPradeshIndiaDataUrl from './india.himachal_pradesh.geo.json';
import jammuKashmirIndiaDataUrl from './india.jammu_and_kashmir.geo.json';
import jharkhandIndiaDataUrl from './india.jharkhand.geo.json';
import karnatakaIndiaDataUrl from './india.karnataka.geo.json';
import keralaIndiaDataUrl from './india.kerala.geo.json';
import lakshadweepIndiaDataUrl from './india.lakshadweep.geo.json';
import madhyaPradeshIndiaDataUrl from './india.madhya_pradesh.geo.json';
import maharashtraIndiaDataUrl from './india.maharashtra.geo.json';
import manipurIndiaDataUrl from './india.manipur.geo.json';
import meghalayaIndiaDataUrl from './india.meghalaya.geo.json';
import mizoramIndiaDataUrl from './india.mizoram.geo.json';
import nagalandIndiaDataUrl from './india.nagaland.geo.json';
import odishaIndiaDataUrl from './india.odisha.geo.json';
import puducherryIndiaDataUrl from './india.puducherry.geo.json';
import punjabIndiaDataUrl from './india.punjab.geo.json';
import rajasthanIndiaDataUrl from './india.rajasthan.geo.json';
import sikkimIndiaDataUrl from './india.sikkim.geo.json';
import tamilNaduIndiaDataUrl from './india.tamil_nadu.geo.json';
import telanganaIndiaDataUrl from './india.telangana.geo.json';
import tripuraIndiaDataUrl from './india.tripura.geo.json';
import uttarakhandIndiaDataUrl from './india.uttarakhand.geo.json';
import uttarPradeshIndiaDataUrl from './india.uttar_pradesh.geo.json';
import westBengalIndiaDataUrl from './india.west_bengal.geo.json';

export const ChoroplethPalette = _.extend({}, AdditionalColors, ColorPalette);

const DEFAULT_OPTIONS = {
  mapType: 'countries',
  countryCodeColumn: '',
  indiaStateColumn: '',
  countryCodeType: 'iso_a3',
  valueColumn: '',
  clusteringMode: 'e',
  steps: 5,
  valueFormat: '0,0.00',
  noValuePlaceholder: 'N/A',
  colors: {
    min: ChoroplethPalette['Light Blue'],
    max: ChoroplethPalette['Dark Blue'],
    background: ChoroplethPalette.White,
    borders: ChoroplethPalette.White,
    noValue: ChoroplethPalette['Light Gray'],
  },
  legend: {
    visible: true,
    position: 'bottom-left',
    alignText: 'right',
  },
  tooltip: {
    enabled: true,
    template: '<b>{{ @@name }}</b>: {{ @@value }}',
  },
  popup: {
    enabled: true,
    template: 'Country: <b>{{ @@name_long }}</b>\n<br>\nValue: <b>{{ @@value }}</b>',
  },
};

const loadCountriesData = _.bind(function loadCountriesData($http, url) {
  if (!this[url]) {
    this[url] = $http.get(url).then(response => response.data);
  }
  return this[url];
}, {});

const ChoroplethRenderer = {
  template,
  bindings: {
    data: '<',
    options: '<',
    onOptionsChange: '<',
  },
  controller($scope, $element, $sanitize, $http) {
    let countriesData = null;
    let map = null;
    let choropleth = null;
    let mapMoveLock = false;

    const onMapMoveStart = () => {
      mapMoveLock = true;
    };

    const onMapMoveEnd = () => {
      const bounds = map.getBounds();
      this.options.bounds = [
        [bounds._southWest.lat, bounds._southWest.lng],
        [bounds._northEast.lat, bounds._northEast.lng],
      ];
      if (this.onOptionsChange) {
        this.onOptionsChange(this.options);
      }
      $scope.$applyAsync(() => {
        mapMoveLock = false;
      });
    };

    const updateBounds = ({ disableAnimation = false } = {}) => {
      if (mapMoveLock) {
        return;
      }
      if (map && choropleth) {
        const bounds = this.options.bounds || choropleth.getBounds();
        const options = disableAnimation ? {
          animate: false,
          duration: 0,
        } : null;
        map.fitBounds(bounds, options);
      }
    };

    const getIndiaState = (column) => {
      if (_.isString(this.data.rows[0][column])) {
        return this.data.rows[0][column].toUpperCase();
      }
    };

    const getDataUrl = (type, indiaStateName) => {
      switch (type) {
        case 'countries': return countriesDataUrl;
        case 'subdiv_japan': return subdivJapanDataUrl;
        case 'state_india': return stateIndiaDataUrl;
        case 'state_wise_india': {
          switch (indiaStateName) {
            case 'ANDAMAN & NICOBAR': return andamanNicobarIndiaDataUrl;
            case 'ANDHRA PRADESH': return andhraPradeshIndiaDataUrl;
            case 'ARUNACHAL PRADESH': return arunachalPradeshIndiaDataUrl;
            case 'ASSAM': return assamIndiaDataUrl;
            case 'BIHAR': return biharIndiaDataUrl;
            case 'CHANDIGARH': return chandigarhIndiaDataUrl;
            case 'CHHATTISGARH': return chhattisgarhIndiaDataUrl;
            case 'DADRA & NAGAR HAVE': return dadraNagarIndiaDataUrl;
            case 'DAMAN & DIU': return damanDiuIndiaDataUrl;
            case 'DELHI': return delhiIndiaDataUrl;
            case 'GOA': return goaIndiaDataUrl;
            case 'GUJARAT': return gujaratIndiaDataUrl;
            case 'HARYANA': return haryanaIndiaDataUrl;
            case 'HIMACHAL PRADESH': return himachalPradeshIndiaDataUrl;
            case 'JAMMU & KASHMIR': return jammuKashmirIndiaDataUrl;
            case 'JHARKHAND': return jharkhandIndiaDataUrl;
            case 'KARNATAKA': return karnatakaIndiaDataUrl;
            case 'KERALA': return keralaIndiaDataUrl;
            case 'LAKSHADWEEP': return lakshadweepIndiaDataUrl;
            case 'MADHYA PRADESH': return madhyaPradeshIndiaDataUrl;
            case 'MAHARASHTRA': return maharashtraIndiaDataUrl;
            case 'MANIPUR': return manipurIndiaDataUrl;
            case 'MEGHALAYA': return meghalayaIndiaDataUrl;
            case 'MIZORAM': return mizoramIndiaDataUrl;
            case 'NAGALAND': return nagalandIndiaDataUrl;
            case 'ODISHA': return odishaIndiaDataUrl;
            case 'PUDUCHERRY': return puducherryIndiaDataUrl;
            case 'PUNJAB': return punjabIndiaDataUrl;
            case 'RAJASTHAN': return rajasthanIndiaDataUrl;
            case 'SIKKIM': return sikkimIndiaDataUrl;
            case 'TAMIL NADU': return tamilNaduIndiaDataUrl;
            case 'TELANGANA': return telanganaIndiaDataUrl;
            case 'TRIPURA': return tripuraIndiaDataUrl;
            case 'UTTARAKHAND': return uttarakhandIndiaDataUrl;
            case 'UTTAR PRADESH': return uttarPradeshIndiaDataUrl;
            case 'WEST BENGAL': return westBengalIndiaDataUrl;
            default: return delhiIndiaDataUrl;
          }
        }
        default: return '';
      }
    };

    let indiaStateName = getIndiaState(this.options.indiaStateColumn);

    let dataUrl = getDataUrl(this.options.mapType, indiaStateName);

    const render = () => {
      if (map) {
        map.remove();
        map = null;
        choropleth = null;
      }
      if (!countriesData) {
        return;
      }

      this.formatValue = createNumberFormatter(
        this.options.valueFormat,
        this.options.noValuePlaceholder,
      );

      const data = prepareData(this.data.rows, this.options.countryCodeColumn, this.options.valueColumn);

      const { limits, colors, legend } = createScale(countriesData.features, data, this.options);

      // Update data for legend block
      this.legendItems = legend;

      choropleth = L.geoJson(countriesData, {
        onEachFeature: (feature, layer) => {
          const value = getValueForFeature(feature, data, this.options.countryCodeType);
          const valueFormatted = this.formatValue(value);
          const featureData = prepareFeatureProperties(
            feature,
            valueFormatted,
            data,
            this.options.countryCodeType,
          );
          const color = getColorByValue(value, limits, colors, this.options.colors.noValue);

          layer.setStyle({
            color: this.options.colors.borders,
            weight: 1,
            fillColor: color,
            fillOpacity: 1,
          });

          if (this.options.tooltip.enabled) {
            layer.bindTooltip($sanitize(formatSimpleTemplate(
              this.options.tooltip.template,
              featureData,
            )), { sticky: true });
          }

          if (this.options.popup.enabled) {
            layer.bindPopup($sanitize(formatSimpleTemplate(
              this.options.popup.template,
              featureData,
            )));
          }

          layer.on('mouseover', () => {
            layer.setStyle({
              weight: 2,
              fillColor: darkenColor(color),
            });
          });
          layer.on('mouseout', () => {
            layer.setStyle({
              weight: 1,
              fillColor: color,
            });
          });
        },
      });

      const choroplethBounds = choropleth.getBounds();

      map = L.map($element[0].children[0].children[0], {
        center: choroplethBounds.getCenter(),
        zoom: 1,
        zoomSnap: 0,
        layers: [choropleth],
        scrollWheelZoom: false,
        maxBounds: choroplethBounds,
        maxBoundsViscosity: 1,
        attributionControl: false,
        fullscreenControl: true,
      });

      map.on('focus', () => {
        map.on('movestart', onMapMoveStart);
        map.on('moveend', onMapMoveEnd);
      });
      map.on('blur', () => {
        map.off('movestart', onMapMoveStart);
        map.off('moveend', onMapMoveEnd);
      });

      updateBounds({ disableAnimation: true });
    };

    const load = () => {
      loadCountriesData($http, dataUrl).then((data) => {
        if (_.isObject(data)) {
          countriesData = data;
          render();
        }
      });
    };

    load();


    $scope.handleResize = _.debounce(() => {
      if (map) {
        map.invalidateSize(false);
        updateBounds({ disableAnimation: true });
      }
    }, 50);

    const updateCountryMap = () => {
      indiaStateName = getIndiaState(this.options.indiaStateColumn);
      dataUrl = getDataUrl(this.options.mapType, indiaStateName);
      load();
    };

    $scope.$watch('$ctrl.data', render);
    $scope.$watch(() => _.omit(this.options, 'bounds', 'mapType'), render, true);
    $scope.$watch('$ctrl.options.bounds', updateBounds, true);
    $scope.$watch('$ctrl.options.mapType', updateCountryMap, true);
    $scope.$watch('$ctrl.options.indiaStateColumn', updateCountryMap, true);
  },
};

const ChoroplethEditor = {
  template: editorTemplate,
  bindings: {
    data: '<',
    options: '<',
    onOptionsChange: '<',
  },
  controller($scope) {
    this.currentTab = 'general';
    this.setCurrentTab = (tab) => {
      this.currentTab = tab;
    };

    this.colors = ChoroplethPalette;

    this.mapTypes = {
      countries: 'Countries',
      state_india: 'India',
      state_wise_india: 'India/States',
      subdiv_japan: 'Japan/Prefectures',
    };

    this.clusteringModes = {
      q: 'quantile',
      e: 'equidistant',
      k: 'k-means',
    };

    this.legendPositions = {
      'top-left': 'top / left',
      'top-right': 'top / right',
      'bottom-left': 'bottom / left',
      'bottom-right': 'bottom / right',
    };

    this.countryCodeTypes = {};

    this.templateHintFormatter = propDescription => `
      <div class="p-b-5">All query result columns can be referenced using <code>{{ column_name }}</code> syntax.</div>
      <div class="p-b-5">Use special names to access additional properties:</div>
      <div><code>{{ @@value }}</code> formatted value;</div>
      ${propDescription}
      <div class="p-t-5">This syntax is applicable to tooltip and popup templates.</div>
    `;

    const updateCountryCodeType = () => {
      this.options.countryCodeType = inferCountryCodeType(
        this.options.mapType,
        this.data ? this.data.rows : [],
        this.options.countryCodeColumn,
      ) || this.options.countryCodeType;
    };

    const populateCountryCodeTypes = () => {
      let propDescription = '';
      switch (this.options.mapType) {
        case 'subdiv_japan':
          propDescription = `
            <div><code>{{ @@name }}</code> Prefecture name in English;</div>
            <div><code>{{ @@name_local }}</code> Prefecture name in Kanji;</div>
            <div><code>{{ @@iso_3166_2 }}</code> five-letter ISO subdivision code (JP-xx);</div>
          `;
          this.countryCodeTypes = {
            name: 'Name',
            name_local: 'Name (local)',
            iso_3166_2: 'ISO-3166-2',
          };
          break;
        case 'state_india':
          propDescription = `
            <div><code>{{ @@name }}</code> State name in English;</div>
            <div><code>{{ @@state_id }}</code> State Id (1-37);</div>
          `;
          this.countryCodeTypes = {
            name: 'Name',
            state_id: 'State Id',
          };
          break;
        case 'state_wise_india':
          propDescription = `
            <div><code>{{ @@name }}</code> District name in English;</div>
            <div><code>{{ @@district_id }}</code> District Id (1-732);</div>
          `;
          this.countryCodeTypes = {
            name: 'Name',
            district_id: 'District Id',
          };
          break;
        case 'countries':
          propDescription = `
           <div><code>{{ @@name }}</code> short country name;</div>
             <div><code>{{ @@name_long }}</code> full country name;</div>
             <div><code>{{ @@abbrev }}</code> abbreviated country name;</div>
             <div><code>{{ @@iso_a2 }}</code> two-letter ISO country code;</div>
             <div><code>{{ @@iso_a3 }}</code> three-letter ISO country code;</div>
             <div><code>{{ @@iso_n3 }}</code> three-digit ISO country code.</div>
          `;
          this.countryCodeTypes = {
            name: 'Short name',
            name_long: 'Full name',
            abbrev: 'Abbreviated name',
            iso_a2: 'ISO code (2 letters)',
            iso_a3: 'ISO code (3 letters)',
            iso_n3: 'ISO code (3 digits)',
          };
          break;
        default:
          this.countryCodeTypes = {};
      }
      this.templateHint = this.templateHintFormatter(propDescription);
    };

    $scope.$watch('$ctrl.options.mapType', populateCountryCodeTypes);
    $scope.$watch('$ctrl.options.countryCodeColumn', updateCountryCodeType);
    $scope.$watch('$ctrl.data', updateCountryCodeType);

    $scope.$watch('$ctrl.options', (options) => {
      this.onOptionsChange(options);
    }, true);
  },
};

export default function init(ngModule) {
  ngModule.component('choroplethRenderer', ChoroplethRenderer);
  ngModule.component('choroplethEditor', ChoroplethEditor);

  ngModule.run(($injector) => {
    registerVisualization({
      type: 'CHOROPLETH',
      name: 'Map (Choropleth)',
      getOptions: options => _.merge({}, DEFAULT_OPTIONS, options),
      Renderer: angular2react('choroplethRenderer', ChoroplethRenderer, $injector),
      Editor: angular2react('choroplethEditor', ChoroplethEditor, $injector),

      defaultColumns: 3,
      defaultRows: 8,
      minColumns: 2,
    });
  });
}

init.init = true;
