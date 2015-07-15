function treeMapDirective () {
  'use strict';

  return {
    controller: 'TreeMapCtrl',
    controllerAs: 'treeMap',
    restrict: 'E',
    replace: true,
    templateUrl: 'treeMap/template.html'
  };
}

angular
  .module('treeMap')
  .directive('treeMap', [
    treeMapDirective
  ]);
