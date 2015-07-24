// function D3Tree (D3Node) {
//   // Store super class
//   this.Super = Object;

//   // Call super constructor
//   this.Super.call(this);

//   this.D3Node = D3Node;
// }

// // Make Files's prototype inherit from Array's prototype
// D3Tree.prototype = Object.create(Object.prototype);
// // Set Files's constructor to itself
// D3Tree.prototype.constructor = D3Tree;

// D3Tree.prototype.push = function (files) {
//   for (var i = 0, len = files.length; i < len; i++) {
//     var file = files[i];

//     // Look if a file with the same name is still
//     if (this._index[file.name] >= 0) {
//       // Skip file
//       continue;
//     }

//     // Push new file and cache its index
//     var lastId = this.Super.prototype.push.call(this, file) - 1;
//     this._index[file.name] = lastId;
//   }
// };

// D3Tree.prototype.get = function (name) {
//   var index = !!this._index[name];

//   return index ? this[index] : undefined;
// };

// angular
//   .module('d3Tree')
//   .service('D3Tree', [
//     'D3Node',
//     D3Tree
//   ]);
