function treeMapDivDirective () {
  'use strict';

  return {
    controller: 'TreeMapDivCtrl',
    controllerAs: 'treeMap',
    restrict: 'E',
    replace: true,
    templateUrl: 'treeMapDiv/template.html'
  };
}

angular
  .module('treeMapDiv')
  .directive('treeMapDiv', [
    treeMapDivDirective
  ]);
