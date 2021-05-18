import { filter } from 'lodash';
import { angular2react } from 'angular2react';
import template from './widget.html';
import TextboxDialog from '@/components/dashboards/TextboxDialog';
import IframeboxDialog from '@/components/dashboards/IframeboxDialog';
import TableEditDialog from '@/components/dashboards/TableEditDialog';
import widgetDialogTemplate from './widget-dialog.html';
import EditParameterMappingsDialog from '@/components/dashboards/EditParameterMappingsDialog';
import './widget.less';
import './widget-dialog.less';

const WidgetDialog = {
  template: widgetDialogTemplate,
  bindings: {
    resolve: '<',
    close: '&',
    dismiss: '&',
  },
  controller() {
    this.widget = this.resolve.widget;
  },
};

export let DashboardWidget = null; // eslint-disable-line import/no-mutable-exports

function DashboardWidgetCtrl($scope, $location, $uibModal, $window, $rootScope, $timeout, $sce, Events, currentUser) {
  this.canViewQuery = currentUser.hasPermission('view_query');
  this.userName = currentUser.name;

  this.editTextBox = () => {
    TextboxDialog.showModal({
      dashboard: this.dashboard,
      text: this.widget.text,
      onConfirm: (text) => {
        this.widget.text = text;
        return this.widget.save();
      },
    });
  };

  this.editIframeBox = () => {
    IframeboxDialog.showModal({
      dashboard: this.dashboard,
      text: this.widget.text,
      onConfirm: (text) => {
        this.widget.text = text;
        this.widget.html = $sce.trustAsHtml(text);
        return this.widget.save();
      },
    });
  };

  this.editTableEdit = () => {
    TableEditDialog.showModal({
      dashboard: this.dashboard,
      text: this.widget.text,
      options: this.widget.options,
      onConfirm: (text, options) => {
        this.widget.text = text;
        this.widget.options = { ...this.widget.options, ...options };
        return this.widget.save();
      },
    }).result.then(() => {
      $timeout(() => this.refresh());
    });
  };

  this.expandVisualization = () => {
    $uibModal.open({
      component: 'widgetDialog',
      resolve: {
        widget: this.widget,
      },
      size: 'lg',
    });
  };

  this.hasParameters = () => this.widget.query.getParametersDefs().length > 0;

  this.editParameterMappings = () => {
    EditParameterMappingsDialog.showModal({
      dashboard: this.dashboard,
      widget: this.widget,
    }).result.then((valuesChanged) => {
      this.localParameters = null;

      // refresh widget if any parameter value has been updated
      if (valuesChanged) {
        $timeout(() => this.refresh());
      }
      $scope.$applyAsync();
      $rootScope.$broadcast('dashboard.update-parameters');
    });
  };

  this.localParametersDefs = () => {
    if (!this.localParameters) {
      this.localParameters = filter(
        this.widget.getParametersDefs(),
        param => !this.widget.isStaticParam(param),
      );
    }
    return this.localParameters;
  };

  this.deleteWidget = () => {
    if (!$window.confirm(`Are you sure you want to remove "${this.widget.getName()}" from the dashboard?`)) {
      return;
    }

    this.widget.delete().then(() => {
      if (this.deleted) {
        this.deleted({});
      }
    });
  };

  Events.record('view', 'widget', this.widget.id);

  this.load = (refresh = false) => {
    const maxAge = $location.search().maxAge;
    return this.widget.load(refresh, maxAge);
  };

  this.forceRefresh = () => this.load(true);

  this.refresh = (buttonId) => {
    this.refreshClickButtonId = buttonId;
    this.load(true).finally(() => {
      this.refreshClickButtonId = undefined;
    });
  };

  if (this.widget.visualization) {
    Events.record('view', 'query', this.widget.visualization.query.id, { dashboard: true });
    Events.record('view', 'visualization', this.widget.visualization.id, { dashboard: true });

    this.type = 'visualization';
    this.load();
  } else if (this.widget.restricted) {
    this.type = 'restricted';
  } else if (this.widget.options.isHTML) {
    this.type = 'htmlcontent';
    this.widget.html = $sce.trustAsHtml(this.widget.text);
  } else if (this.widget.options.isTable) {
    this.type = 'tablecontent';
    this.load();
  } else {
    this.type = 'textbox';
  }
}

const DashboardWidgetOptions = {
  template,
  controller: DashboardWidgetCtrl,
  bindings: {
    widget: '<',
    public: '<',
    dashboard: '<',
    filters: '<',
    deleted: '<',
  },
};

export default function init(ngModule) {
  ngModule.component('widgetDialog', WidgetDialog);
  ngModule.component('dashboardWidget', DashboardWidgetOptions);
  ngModule.run(['$injector', ($injector) => {
    DashboardWidget = angular2react('dashboardWidget ', DashboardWidgetOptions, $injector);
  }]);
}

init.init = true;
