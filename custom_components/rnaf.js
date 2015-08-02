// https://gist.github.com/getify/3004342
// requires raf.js (polyfil)
(function () {
  'use strict';

  var ids = {};

  function requestId () {
    var id;
    do {
      id = Math.floor(Math.random() * 1E9);
    } while (id in ids);
    return id;
  }

  if (!window.requestNextAnimationFrame) {
    window.requestNextAnimationFrame = function (callback, element) {
      var id = requestId();

      ids[id] = requestAnimationFrame(function () {
        ids[id] = requestAnimationFrame(function (ts) {
          delete ids[id];
          callback(ts);
        }, element);
      }, element);

      return id;
    };
  }

  if (!window.cancelNextAnimationFrame) {
    window.cancelNextAnimationFrame = function(id) {
      if (ids[id]) {
        cancelAnimationFrame(ids[id]);
        delete ids[id];
      }
    };
  }
}());
