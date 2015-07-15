var GlobalEvents = (function () {
  var private = {};

  function GlobalEvents ($window, $, _) {
    private.eventStack = {};

    // Public
    this._ = _;
  }

  GlobalEvents.prototype.off = function (event, index) {
    if (event in private.eventStack && index in private.eventStack[event]) {
      private.eventStack[event].splice(index, 1);
      return true;
    }

    return false;
  };

  GlobalEvents.prototype.on = function (event, callback) {
    if (event in private.eventStack) {
      private.eventStack[event].push(callback);
    } else {
      private.eventStack[event] = [callback];
    }

    return private.eventStack[event].length - 1;
  };

  GlobalEvents.prototype.trigger = function (event) {
    if (event in private.eventStack) {
      var stack = private.eventStack[event];
      for (var i = 0, len = stack.length; i < len; i++) {
        if (this._.isFunction(stack[i])) {
          stack[i]();
        }
      }
    }
  };

  return GlobalEvents;
}());

angular
  .module('globalEvents')
  .service('globalEvents', [
    '$window',
    '$',
    '_',
    GlobalEvents
  ]);
