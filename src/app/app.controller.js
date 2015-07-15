function AppCtrl () {
  this.test = "Hallo.";
}

angular
  .module('treeMapApp')
  .controller('AppCtrl', [AppCtrl]);
