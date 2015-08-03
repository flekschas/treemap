/* global angular:false */

function TreeMapDivCtrl ($window, $element, $, d3, neo4jD3, D3Colors) {
  this.$window = $window;
  this.$ = $;
  this.d3 = d3;
  this.$element = this.$($element),
  this.$d3Element = this.$element.find('.treeMap');

  /**
   * Current level of depth. By default starting at the root, e.g. zero.
   *
   * @type  {Number}
   */
  this.currentDepth = 0;

  this._visibleDepth = 3;

  this.treeMap.width = this.$d3Element.width();
  this.treeMap.height = this.$d3Element.height();

  this.numColors = 10;
  this.steps = 6;

  this.treeMap.colors = new D3Colors(
    this.d3.scale.category10().domain(d3.range(this.numColors)).range()
  ).getScaledFadedColors(this.steps);

  this.treeMap.x = this.d3.scale.linear()
    .domain([0, this.treeMap.width])
    .range([0, this.treeMap.width]);

  this.treeMap.y = this.d3.scale.linear()
    .domain([0, this.treeMap.height])
    .range([0, this.treeMap.height]);

  this.treeMap.el = this.d3.layout.treemap()
    .children(function(d, depth) { return depth ? null : d._children; })
    .sort(function(a, b) { return a.value - b.value; })
    .ratio(this.treeMap.height / this.treeMap.width * 0.5 * (1 + Math.sqrt(5)))
    .round(false);

  this.treeMap.element = this.d3.select(this.$d3Element[0]).append('div')
    .classed('wrapper', true);

  this.treeMap.$element = $(this.treeMap.element[0]);

  this.treeMap.grandparent = this.d3.select('#back');

  neo4jD3.d3
    .then(function (data) {
      this.data = data;
      this.draw();
    }.bind(this));
}

/*
 * -----------------------------------------------------------------------------
 * Methods
 * -----------------------------------------------------------------------------
 */

/**
 * Starter function for aggrgation and pruning.
 *
 * @param  {Object} data       D3 data object.
 * @param  {String} valueProp  Name of the property holding the value.
 */
TreeMapDivCtrl.prototype.accumulateAndPrune = function (data, valueProp) {
  var numChildren = data.children ? data.children.length : false;
  data.meta = data.meta || {};

  if (numChildren) {
    accumulateAndPruneChildren.call(this, data, numChildren, valueProp, 0);
    if (data.value) {
      data.value += data[valueProp];
    } else {
      data.value = data[valueProp];
    }
  }

  /**
   * Recursively accumulate `valueProp` values and prune _empty_ leafs.
   *
   * This function traverses all inner loops and stops one level BEFORE a leaf
   * to be able to splice (delete) empty leafs from the list of children
   *
   * @param  {Object}   node         D3 data object of the node.
   * @param  {Number}   numChildren  Number of children of `node.
   * @param  {String}   valueProp    Property name of the propery holding the value of the node's _size_.
   * @param  {Number}   depth        Original depth of the current node.
   * @param  {Boolean}  root         If node is the root.
   */
  function accumulateAndPruneChildren (node, numChildren, valueProp, depth) {
    // A reference for later
    node._children = node.children;
    node.meta.originalDepth = depth;
    var i = numChildren;
    // We move in reverse order so that deleting nodes doesn't affect future
    // indices.
    while (i--) {
      var child = node.children[i];
      var numChildChildren = child.children ? child.children.length : false;

      child.meta = child.meta || {};

      if (numChildChildren) {
        // Inner node.
        accumulateAndPruneChildren.call(
          this, child, numChildChildren, valueProp, depth + 1
        );
        numChildChildren = child.children.length;
      }

      // We check again the number of children of the child since it can happen
      // that all children have been deleted meanwhile and the inner node became
      // a leaf as well.
      if (numChildChildren) {
        // Inner node.
        if (child[valueProp]) {
          // Add own `numDataSets` to existing `value`.
          child.value += child[valueProp];
          // To represent this node visually in the tree map we need to create
          // a "fake" child, i.e. pseudo node, holding the values of this inner
          // node.
          child.children.push({
            name: child.name,
            meta: {
              originalDepth: child.depth + 1,
              pseudoNode: true
            },
            value: child[valueProp]
          });
          child.children[child.children.length - 1][valueProp] = child[valueProp];
        } else {
          // We prune `child`, i.e. remove, a node in two cases
          // A) `child` is the only child of `node` or
          // B) `child` only has one child.
          // This way we ensure that the out degree of `child` is two or higher.
          if (numChildren === 1 || numChildChildren === 1) {
            // We can remove the inner node since it wasn't used for any
            // annotations.
            for (var j = 0, len = child.children.length; j < len; j++) {
              if (child.children[j].meta.skipped) {
                child.children[j].meta.skipped.unshift(child.name);
              } else {
                child.children[j].meta.skipped = [child.name];
              }
              node.children.push(child.children[j]);
            }
            // Remove the child with the empty valueProp
            node.children.splice(i, 1);
          }
        }
      } else {
        // Leaf.
        if (!child[valueProp]) {
          // Leaf was not used for annotation so we remove it.
          node.children.splice(i, 1);
          numChildren--;
          continue;
        } else {
          // Set `value` of the leaf itself.
          child.value = child[valueProp];
          child.meta.leaf = true;
          child.meta.originalDepth = depth + 1;
        }
      }

      // Increase `value` if the node by the children's `numDataSets`.
      if (typeof node.value !== 'undefined') {
        node.value += child.value;
      } else {
        node.value = child.value;
      }
    }
  }
};


/**
 * Recursively add nodes level by level.
 *
 * @method  addChildren
 * @author  Fritz Lekschas
 * @date    2015-08-01
 * @param   {[type]}     parent  [description]
 * @param   {[type]}     data    [description]
 * @param   {[type]}     level   [description]
 */
TreeMapDivCtrl.prototype.addChildren = function (
  parent, data, level, firstTime) {
  var that = this;

  // Create nodes
  var nodes = parent.selectAll('div')
    .data(data._children)
    .enter()
      .append('div')
      .attr('class', function (node) {
        var classes = 'node';
        if (node._children && node._children.length) {
          classes += ' inner-node';
        } else {
          classes += ' leaf';
          node.visibility = true;
        }
        if (level == this.visibleDepth) {
          classes += ' last';
          node.visibility = true;
        }
        // Hide nodes if they are deeper than the specified `depth`
        if (level > this.visibleDepth) {
          classes += ' hidden';
        }
        return classes;
      }.bind(this))
      .attr('title', function (node) {
        return node.uri;
      })
      .style('background-color', function (node) {
        if (node.visibility) {
          return this.color(node);
        }
      }.bind(this))
      .call(that.coordinates.bind(that));

  // Add name to nodes
  nodes.append('span')
    .attr('class', function (node) {
      var classes = 'name';
      if (node.meta.aspectRatio < 1) {
        classes += ' rotated';
      }
      return classes;
    })
    .text(function(node) { return node.name; });

  this.nodesAtLevel[level + 1] = this.nodesAtLevel[level + 1] || [];

  nodes.each(function (node) {

    if (firstTime && node.visibility) {
      var $el = $(this);

      $el
        .css({
          'opacity': 0,
          'transform': 'scale(0.9)'
        });

      that.$window.requestNextAnimationFrame(function() {
        $el
          .css('transitionDuration', function () {
            return ((500 + parseInt(Math.random() * 750)) / 1000) + 's';
          })
          .css('transitionDelay', function () {
            return (parseInt(Math.random() * 500) / 1000) + 's';
          })
          .css({
            'opacity': 1,
            'transform': 'scale(1)'
          });
      });
    }

    if (node._children && node._children.length) {
      // Recursion
      that.nodesAtLevel[level + 1].push(
        that.addChildren(that.d3.select(this), node, level + 1, firstTime)
      );
    }
  });

  return nodes;
};

TreeMapDivCtrl.prototype.addClickListener = function () {
  var that = this;

  $(this.treeMap.element[0]).on('click', '.inner-node.last', function (event) {
    // D3 hard links data with DOM elements and stores it under the `__data__`
    // property.
    that.transition(this, this.__data__);
  });
};

TreeMapDivCtrl.prototype.adjustLevelDepth = function (oldLevel, newLevel) {
  if (oldLevel === newLevel) {
    return;
  }

  var from, to, i, j, hidden;

  if (oldLevel < newLevel) {
    from = oldLevel - 1;
    to = newLevel;
  } else {
    // Remove all children deeper than what is specified.
    hidden = true;
    from = newLevel - 1;
    to = oldLevel;
  }

  for (i = 0, len = this.nodesAtLevel[newLevel].length; i < len; i++) {
    // Show nodes at current level
    this.nodesAtLevel[newLevel][i]
      .classed('last', true)
      .classed('hidden', false);
  }

  for (i = 0, len = this.nodesAtLevel[oldLevel].length; i < len; i++) {
    // Hide nodes at former level
    this.nodesAtLevel[oldLevel][i]
      .classed('last', false)
      .classed('hidden', true);
  }


  // `from` and `to` are included in the loop.
  while (from++ < to) {
    for (i = 0, len = this.nodesAtLevel[from].length; i < len; i++) {
      this.nodesAtLevel[from][i]
        .style('background-color', function (node) {
          if (from === newLevel || node.meta.revDepth === 0) {
            return this.color(node);
          }
        }.bind(this))
        .classed('last', function (node) {
          if (from === newLevel) {
            return true;
          }
        })
        .classed('hidden', function (node) {
          if (hidden && from === newLevel) {
            return false;
          }
          return hidden;
        });
    }
  }
};

/**
 * Set the browsing mode.
 *
 * @param  {String}  mode  Name of the mode.
 */
TreeMapDivCtrl.prototype.browseMode = function (mode) {
  this.mode = mode;
};

/**
 * Generate a color given an elements node data object.
 *
 * @method  color
 * @author  Fritz Lekschas
 * @date    2015-07-31
 * @param   {Object}  node  D3 node data object.
 * @return  {String}        HEX color string.
 */
TreeMapDivCtrl.prototype.color = function (node) {
  if (this.colorMode === 'depth') {
    // Color by original depth
    // The deeper the node, the lighter the color
    return this.treeMap.colors((node.meta.branchNo[0] * this.steps) +
      Math.min(this.steps, node.meta.originalDepth) - 1);
  }
  // Default:
  // Color by reverse final depth, i.e. after pruning. The fewer children a node
  // has, the lighter the color. E.g. a leaf is lightest while the root is
  // darkest.
  return this.treeMap.colors((node.meta.branchNo[0] * this.steps) +
    Math.max(0, this.steps - node.meta.revDepth - 1));
}

/**
 * Provide a color to a DOM's attribute
 *
 * @method  colorEl
 * @author  Fritz Lekschas
 * @date    2015-07-31
 * @param   {Object}    element    DOM element created by D3.
 * @param   {String}    attribute  Name of attribute that should be colored.
 */
TreeMapDivCtrl.prototype.colorEl = function (element, attribute) {
  element
    .attr(attribute, this.color.bind(this));
};

/**
 * Display the data.
 *
 * @param   {Object}  node  D3 data object of the node.
 * @return  {Object}        D3 selection of node's children.
 */
TreeMapDivCtrl.prototype.display = function (node, firstTime) {
  var that = this;

  // Update the grand parent, which is kind of the "back button"
  this.treeMap.grandparent
    .datum(node.parent)
    .on("click", function (data) {
      /*
       * that = TreeMapDivCtrl
       * this = the clicked DOM element
       * data = data
       */
      that.transition.call(that, this, data);
    })
    .text(this.name(node));

  this.treeMap.element
    .datum(node);

  // For completeness we store the children of level zero.
  this.nodesAtLevel[0] = [this.treeMap.element];

  var children = this.addChildren.call(
    this, this.treeMap.element, node, 1, firstTime);

  // We have to cache the children to dynamically adjust the level depth.
  this.nodesAtLevel[1] = [children];

  return children;
};

/**
 * Draw the treemap.
 */
TreeMapDivCtrl.prototype.draw = function () {
  if (this.data === null) {
    return false;
  }

  console.log('vdepth ' + this.visibleDepth);

  this.initialize(this.data);
  this.accumulateAndPrune(this.data, 'numDataSets');
  this.layout(this.data, 0);
  this.display(this.data, true);
  this.addClickListener();
};

/**
 * Initialize the root node. This would usually be computed by `treemap()`.
 *
 * @param  {Object} data  D3 data object.
 */
TreeMapDivCtrl.prototype.initialize = function (data) {
  data.x = data.y = 0;
  data.dx = this.treeMap.width;
  data.dy = this.treeMap.height;
  data.depth = 0;
  data.meta = {
    branchNo: []
  };
};

/**
 * Recursively compute the layout of each node depended on its parent.
 *
 * Compute the treemap layout recursively such that each group of siblings uses
 * the same size (1×1) rather than the dimensions of the parent cell. This
 * optimizes the layout for the current zoom state. Note that a wrapper object
 * is created for the parent node for each group of siblings so that the
 * parent's dimensions are not discarded as we recurse. Since each group of
 * sibling was laid out in 1×1, we must rescale to fit using absolute
 * coordinates. This lets us use a viewport to zoom.
 *
 * @param  {Object}  data  D3 data object.
 */
TreeMapDivCtrl.prototype.layout = function (parent, depth) {
  parent.meta.depth = depth;
  if (parent._children && parent._children.length) {
    this.treeMap.depth = Math.max(this.treeMap.depth, depth + 1);
    // This creates an anonymous 1px x 1px treemap and sets the children's
    // coordinates accordingly.
    this.treeMap.el({_children: parent._children});
    for (var i = 0, len = parent._children.length; i < len; i++) {
      var child = parent._children[i];
      child.x = child.x * parent.dx;
      child.y = child.y * parent.dy;
      child.dx *= parent.dx;
      child.dy *= parent.dy;
      child.parent = parent;

      // Store aspect ration and area for later font styling
      child.meta.aspectRatio = child.dx / child.dy;
      child.meta.area = child.dy * child.dx;

      // Keep a reference of the branches that have been taken
      child.meta.branchNo = parent.meta.branchNo.concat([i]);

      // Recursion
      this.layout(child, depth + 1);

      // Take the max reverse depth when we visite the inner node the second
      // time.
      parent.meta.revDepth = Math.max(
        child.meta.revDepth + 1,
        parent.meta.revDepth || 0
      )
    }
  } else {
    // Leaf
    // Leafs have a reverse depth of zero.
    parent.meta.revDepth = 0;
  }
};

/**
 * Generate the name of the node.
 *
 * @param   {Object}  data  Node's D3 data object.
 * @return  {String}        Name of the node.
 */
TreeMapDivCtrl.prototype.name = function (data) {
    return data.parent ? this.name(data.parent) + "." + data.name : data.name;
};
/**
 * Set the coordinates of the rectangular.
 *
 * How to invoke:
 * `d3.selectAll('rect').call(this.rect.bind(this))`
 *
 * Note: This weird looking double this is needed as the context of a `call`
 * function is actually the same as the selection passed to it, which seems
 * redundant but that's how it works right now. So to assign `TreeMapDivCtrl` as
 * the context we have to manually bind `this`.
 *
 * URL: https://github.com/mbostock/d3/wiki/Selections#call
 *
 * @param  {Array}  elements  D3 selection of DOM elements.
 */
TreeMapDivCtrl.prototype.coordinates = function (elements) {
  var that = this;

  elements
    .style('left', function (data) {
      return that.treeMap.x(data.x) + 'px';
    })
    .style('top', function (data) {
      return that.treeMap.y(data.y) + 'px';
    })
    .style('width', function (data) {
      return (that.treeMap.x(data.x + data.dx) - that.treeMap.x(data.x)) + 'px';
    })
    .style('height', function (data) {
      return (that.treeMap.y(data.y + data.dy) - that.treeMap.y(data.y)) + 'px';
    });
};

/**
 * Transition between parent <> child branches of the treemap.
 *
 * @param   {Object}  data  D3 data object of the node to transition to.
 */
TreeMapDivCtrl.prototype.transition = function (el, data) {
  if (this.treeMap.transitioning || !data) {
    return;
  }

  this.treeMap.transitioning = true;

  var absX = 0, absY = 0, node = data;
  while (node.meta.depth > this.currentDepth) {
    absX += node.x;
    absY += node.y;
    node = node.parent;
  }

  // We need to delay the zoom transition to allow the fade-in transition of
  // to fully end. This is solution is not ideal but chaining transitions like
  // described at http://stackoverflow.com/a/17101823/981933 is infeasable
  // since an unknown number of multiple selections has to be transitioned first
  var transition = this.treeMap.element.transition().duration(750);

  // Update the domain only after entering new elements.
  this.treeMap.x.domain([0, data.dx]);
  this.treeMap.y.domain([0, data.dy]);

  var scaleX = this.treeMap.width / data.dx,
      scaleY = this.treeMap.height / data.dy,
      originX = absX + (data.dx / 2),
      originY = absY + (data.dy / 2),
      centerAdjustmentX = (this.treeMap.width / 2) - originX,
      centerAdjustmentY = (this.treeMap.height / 2) - originY;

  console.log(
    'transform-origin: ' + (absX + (data.dx / 2)) + 'px ' + (absY + (data.dy / 2)) + 'px', 'scaleX(' + scaleX +') scaleY(' + scaleY +')',
    centerAdjustmentX,
    centerAdjustmentY,
    'translate3d(-' + absX + 'px, -' + absY + 'px)'
  );

  this.treeMap.$element
    .css('transform', 'translate3d(-' + (absX * scaleX) + 'px, -' + (absY * scaleY) + 'px, 0)');

  // this.treeMap.$element
  //   .css({
  //     'transformOrigin': originX + 'px ' + originY + 'px',
  //     'transform': 'translate(' + centerAdjustmentX + 'px, ' + centerAdjustmentY + 'px) scaleX(' + scaleX +') scaleY(' + scaleY +')'
  //   });

  this.treeMap.element.selectAll('.node')
    .style('transition-delay', null)
    .style('transition-duration', null)
    .style('transform', 'rotate(0.1deg)')
    .call(this.coordinates.bind(this));
};


/*
 * -----------------------------------------------------------------------------
 * Properties
 * -----------------------------------------------------------------------------
 */

Object.defineProperty(
  TreeMapDivCtrl.prototype,
  'nodesAtLevel',
  {
    configurable: false,
    enumerable: true,
    value: [],
    writable: true
  }
);

Object.defineProperty(
  TreeMapDivCtrl.prototype,
  'data',
  {
    configurable: false,
    enumerable: true,
    value: null,
    writable: true
});

Object.defineProperty(
  TreeMapDivCtrl.prototype,
  'mode',
  {
    configurable: false,
    enumerable: true,
    value: 'branch',
    writable: true
});

Object.defineProperty(
  TreeMapDivCtrl.prototype,
  'visibleDepth',
  {
    configurable: false,
    enumerable: true,
    get: function () {
      return this._visibleDepth;
    },
    set: function (visibleDepth) {
      var oldLevel = this._visibleDepth;
      this._visibleDepth = Math.max(1, visibleDepth);
      this.adjustLevelDepth(oldLevel, this.visibleDepth);
    }
});

Object.defineProperty(
  TreeMapDivCtrl.prototype,
  'treeMap',
  {
    configurable: false,
    enumerable: true,
    value: {},
    writable: true
});

angular
  .module('treeMapDiv')
  .controller('TreeMapDivCtrl', [
    '$window',
    '$element',
    '$',
    'd3',
    'neo4jD3',
    'D3Colors',
    TreeMapDivCtrl
  ]);
