function AppCtrl ($window, $, _, globalEvents) {
  this.$ = $;
  this._ = _;

  this.$($window).on('resize orientationchange', this._.debounce(
    function () {
      globalEvents.trigger('resize');
    },
    250
  ));
}

angular
  .module('treeMapApp')
  .controller('AppCtrl', [
    '$window',
    '$',
    '_',
    'globalEvents',
    AppCtrl
  ]);
