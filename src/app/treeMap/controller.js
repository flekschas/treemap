/* global angular:false */

function TreeMapCtrl ($element, $, d3, neo4jD3, D3Colors) {
  this.$ = $;
  this.d3 = d3;
  this.$element = this.$($element),
  this.$d3Element = this.$element.find('.treeMap svg');

  this._visibleDepth = 3;
  this.currentLevel = 0;

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

  this.treeMap.element = this.d3.select(this.$d3Element[0])
    .attr('viewBox', '0 0 ' + this.treeMap.width + ' ' + this.treeMap.height)
    .append('g')
      .style('shape-rendering', 'crispEdges');

  this.treeMap.grandParent = this.d3.select('#back');

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
TreeMapCtrl.prototype.accumulateAndPrune = function (data, valueProp) {
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
 * Recursively add children to the parent until a given threshold.
 *
 * @param {[type]} parent [description]
 * @param {[type]} level  [description]
 */
TreeMapCtrl.prototype.addChildren = function (parent, data, level, firstTime) {
  var that = this,
      childChildNode;

  // Create a `g` wrapper for all children.
  var children = parent.selectAll('.group-of-nodes')
    .data(data._children)
    .enter()
      .append('g')
      .attr('class', 'group-of-nodes');

  // Recursion
  if (level < this.currentLevel + this.visibleDepth) {
    this.children[level + 1] = this.children[level + 1] || [];
    children.each(function (data) {
      if (data._children && data._children.length) {
        that.children[level + 1].push(
          that.addChildren(that.d3.select(this), data, level + 1, firstTime)
        );
      }
    });
  } else {
    /* Final level, i.e. `level === this.visibleDepth`.
     *
     * Since we only call the recursion as long as `level` is smaller than
     * `this.visibleDepth` this else statement will only be reached when both
     * variables are the same.
     *
     * On the final level we draw "inner nodes"
     */

    // D3 selection of all children with children
    var childrensChildren = children.filter(function(child) {
      return child._children && child._children.length;
    });

    childChildNode = childrensChildren
      .selectAll('.inner-node')
      .data(function (child) {
        return data._children;
      })
      .enter()
      .append('g')
        .attr('class', 'inner-node')
        .attr('opacity', 0);

    childChildNode
      .append('rect')
        .attr('class', 'inner-border')
        .attr('fill', this.color.bind(this))
        .call(this.rect.bind(this), 1);

    childChildNode
      .append('rect')
      .attr('class', 'outer-border')
      .call(this.rect.bind(this))
      .on('click', function (data) {
        /*
         * that = TreeMapCtrl
         * this = the clicked DOM element
         * data = data
         */
        that.transition.call(that, this, data);
      });

    childChildNode
      .append('text')
        .attr('dy', '.75em')
        .text(function(child) { return child.name; })
        .call(this.text.bind(this));
  }

  // D3 selection of all children without any children, i.e. leafs.
  var childrensLeafs = children.filter(function(child) {
      return !(child._children && child._children.length);
    });

  var leafs = childrensLeafs
    .selectAll('.leaf-node')
    .data(function (data) {
      return [data];
    })
    .enter()
    .append('g')
      .attr('class', 'leaf-node')
      .attr('opacity', 0);

  leafs
    .append('rect')
      .attr('class', 'leaf')
      .attr('fill', this.color.bind(this))
      .call(this.rect.bind(this));

  leafs
    .append('text')
      .attr('dy', '.75em')
      .text(function(child) { return child.name; })
      .call(this.text.bind(this));

  // Merge `leaf` and `childChildNode` selections. This turns out to be
  var animateEls = leafs;
  if (!leafs.length) {
    animateEls = childrensLeafs;
  }
  if (childChildNode && childChildNode.length) {
    console.log(leafs, childrensLeafs);
    animateEls[0] = animateEls[0].concat(childChildNode[0]);
  }

  // Animation
  animateEls
    .transition()
    .duration(function () {
      if (firstTime) {
        return 1000 + (Math.random() * 500);
      }
      return 500;
    })
    .delay(function () {
      if (firstTime) {
        return Math.random() * 500;
      }
      return 0;
    })
    .attr('opacity', 1);

  return children;
};

/**
 * Add levels of children starting from level `level` until `this.numLevels`.
 *
 * @param  {Number}  level  Starting level.
 */
TreeMapCtrl.prototype.addLevelsOfNodes = function (level) {
  var that = this;

  // Remove currently displayed inner nodes first.
  that.d3.selectAll('.inner-node').remove();

  that.children[level + 1] = that.children[level + 1] || [];
  for (var i = 0, len = this.children[level].length; i < len; i++) {
    this.children[level][i].each(function (data) {
      if (data._children && data._children.length) {
        that.children[level + 1].push(
          that.addChildren(that.d3.select(this), data, level + 1, true)
        );
      }
    });
  }

  // Check if any children have been added at all.
  if (!that.children[level + 1].length) {
    this.numLevels = level;
  }
};

TreeMapCtrl.prototype.removeLevelsOfNodes = function (lastVisibleLevel) {
    var i, len;
    // Add inner nodes to `.group-of-nodes` at `newLevel`.
    for (i = 0, len = this.children[newLevel].length; i < len; i++) {
      this.children[newLevel][i].each(function (data) {
        if (data._children && data._children.length) {
          that.addChildren(that.d3.select(this), data, newLevel, true);
        }
      });
    }
    // Remove all children deeper than what is specified.
    for (i = 0, len = this.children[newLevel + 1].length; i < len; i++) {
      var group = this.children[newLevel + 1][i].transition().duration(250);

      // Fade groups out and remove them
      group
        .style("opacity", 0)
        .remove();
    }
    // Unset intemediate levels
    for (i = newLevel + 1; i <= oldLevel; i++) {
      this.children[i] = undefined;
    }
};

TreeMapCtrl.prototype.adjustLevelDepth = function (oldLevel, newLevel) {
  var that = this;

  if (oldLevel < newLevel) {
    this.addLevelsOfNodes(oldLevel);
  }
  if (oldLevel > newLevel) {
    this.removeLevelsOfNodes(newLevel);
  }
};

/**
 * Set the browsing mode.
 *
 * @param  {String}  mode  Name of the mode.
 */
TreeMapCtrl.prototype.browseMode = function (mode) {
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
TreeMapCtrl.prototype.color = function (node) {
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
TreeMapCtrl.prototype.colorEl = function (element, attribute) {
  element
    .attr(attribute, this.color.bind(this));
};

/**
 * Display the data.
 *
 * @param   {Object}  node  D3 data object of the node.
 * @return  {Object}        D3 selection of node's children.
 */
TreeMapCtrl.prototype.display = function (node, firstTime) {
  var that = this;

  // Update the grand parent, which is kind of the "back button"
  this.treeMap.grandParent
    .datum(node.parent)
    .on('click', function (data) {
      /*
       * that = TreeMapCtrl
       * this = the clicked DOM element
       * data = data
       */
      that.transition.call(that, this, data);
    })
    .text(this.name(node));

  // Keep a reference to the old wrapper
  this.treeMap.formerGroupWrapper = this.treeMap.groupWrapper;

  // Create a new wrapper group for the children.
  this.treeMap.groupWrapper = this.treeMap.element
    .append('g')
    .datum(node)
    .attr('class', 'depth');

  // For completeness we store the children of level zero.
  this.children[0] = [this.treeMap.groupWrapper];

  var children = this.addChildren(
    this.treeMap.groupWrapper, node, 1, firstTime);

  // We have to cache the children to dynamically adjust the level depth.
  this.children[1] = [children];

  return children;
};

/**
 * Draw the treemap.
 */
TreeMapCtrl.prototype.draw = function () {
  if (this.data === null) {
    return false;
  }

  this.initialize(this.data);
  this.accumulateAndPrune(this.data, 'numDataSets');
  this.layout(this.data, 0);
  this.display(this.data, true);
};

/**
 * Initialize the root node. This would usually be computed by `treemap()`.
 *
 * @param  {Object} data  D3 data object.
 */
TreeMapCtrl.prototype.initialize = function (data) {
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
TreeMapCtrl.prototype.layout = function (parent, depth) {
  parent.meta.depth = depth;
  if (parent._children && parent._children.length) {
    this.depth = Math.max(this.depth, depth + 1);
    // This creates an anonymous 1px x 1px treemap and sets the children's
    // coordinates accordingly.
    this.treeMap.el({_children: parent._children});
    for (var i = 0, len = parent._children.length; i < len; i++) {
      var child = parent._children[i];
      child.x = parent.x + child.x * parent.dx;
      child.y = parent.y + child.y * parent.dy;
      child.dx *= parent.dx;
      child.dy *= parent.dy;
      child.parent = parent;

      child.meta.branchNo = parent.meta.branchNo.concat([i]);

      this.layout(child, depth + 1);
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
TreeMapCtrl.prototype.name = function (data) {
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
 * redundant but that's how it works right now. So to assign `TreeMapCtrl` as
 * the context we have to manually bind `this`.
 *
 * URL: https://github.com/mbostock/d3/wiki/Selections#call
 *
 * @param  {Array}  elements  D3 selection of DOM elements.
 */
TreeMapCtrl.prototype.rect = function (elements, reduction) {
  var that = this;

  reduction = reduction || 0;

  elements
    .attr('x', function (data) {
      return that.treeMap.x(data.x) + reduction;
    })
    .attr('y', function (data) {
      return that.treeMap.y(data.y) + reduction;
    })
    .attr('width', function (data) {
      return that.treeMap.x(data.x + data.dx) - that.treeMap.x(data.x) - (2 * reduction);
    })
    .attr('height', function (data) {
      return that.treeMap.y(data.y + data.dy) - that.treeMap.y(data.y) - (2 * reduction);
    });
};

/**
 * Set the coordinates of the text node.
 *
 * How to invoke:
 * `d3.selectAll('text').call(this.rect.bind(this))`
 *
 * Note: See TreeMapCtrl.prototype.rect
 *
 * @param  {[type]} el [description]
 * @return {[type]}    [description]
 */
TreeMapCtrl.prototype.text = function (el) {
  var that = this;

  el.attr("x", function(data) {
      return that.treeMap.x(data.x) + 3;
    })
    .attr("y", function(data) {
      return that.treeMap.y(data.y) + 4;
    });
};

/**
 * Transition between parent <> child branches of the treemap.
 *
 * @param   {Object}  data  D3 data object of the node to transition to.
 */
TreeMapCtrl.prototype.transition = function (el, data) {
  if (this.treeMap.transitioning || !data) {
    return;
  }

  this.currentLevel = data.meta.depth;

  this.treeMap.transitioning = true;

  // We need to delay the zoom transition to allow the fade-in transition of
  // to fully end. This is solution is not ideal but chaining transitions like
  // described at http://stackoverflow.com/a/17101823/981933 is infeasable
  // since an unknown number of multiple selections has to be transitioned first
  var newGroups = this.display.call(this, data)
      .transition().duration(750).delay(500),
    formerGroupWrapper = this.treeMap.formerGroupWrapper
      .transition().duration(750).delay(500);

  // Update the domain only after entering new elements.
  this.treeMap.x.domain([data.x, data.x + data.dx]);
  this.treeMap.y.domain([data.y, data.y + data.dy]);

  // Enable anti-aliasing during the transition.
  this.treeMap.element.style('shape-rendering', null);

  // Fade-in entering text.
  newGroups.selectAll('text')
    .style('fill-opacity', 0);

  // Transition to the new view.
  formerGroupWrapper.selectAll('text')
    .call(this.text.bind(this))
    .style('fill-opacity', 0);

  newGroups.selectAll('text')
    .call(this.text.bind(this))
    .style('fill-opacity', 1);

  formerGroupWrapper.selectAll('.inner-border')
    .call(this.rect.bind(this), 1);

  formerGroupWrapper.selectAll('.outer-border, .leaf')
    .call(this.rect.bind(this));

  newGroups.selectAll('.inner-border')
    .call(this.rect.bind(this), 1);

  newGroups.selectAll('.outer-border, .leaf')
    .call(this.rect.bind(this));

  // Remove the old node when the transition is finished.
  formerGroupWrapper.remove()
    .each('end', function() {
      this.treeMap.element.style('shape-rendering', 'crispEdges');
      this.treeMap.transitioning = false;
    }.bind(this));
};


/*
 * -----------------------------------------------------------------------------
 * Properties
 * -----------------------------------------------------------------------------
 */

Object.defineProperty(
  TreeMapCtrl.prototype,
  'children',
  {
    configurable: false,
    enumerable: true,
    value: [],
    writable: true
  }
);

Object.defineProperty(
  TreeMapCtrl.prototype,
  'data',
  {
    configurable: false,
    enumerable: true,
    value: null,
    writable: true
});

Object.defineProperty(
  TreeMapCtrl.prototype,
  'depth',
  {
    configurable: false,
    enumerable: true,
    value: 0,
    writable: true
});

Object.defineProperty(
  TreeMapCtrl.prototype,
  'levels',
  {
    configurable: false,
    enumerable: true,
    value: [],
    writable: true
});

Object.defineProperty(
  TreeMapCtrl.prototype,
  'visibleDepth',
  {
    configurable: false,
    enumerable: true,
    get: function () {
      return this._visibleDepth;
    },
    set: function (visibleDepth) {
      var oldLevel = this._visibleDepth;
      this._visibleDepth = Math.min(Math.max(1, visibleDepth), this.depth);
      this.adjustLevelDepth(oldLevel, this.visibleDepth);
    }
});

Object.defineProperty(
  TreeMapCtrl.prototype,
  'treeMap',
  {
    configurable: false,
    enumerable: true,
    value: {},
    writable: true
});

angular
  .module('treeMap')
  .controller('TreeMapCtrl', [
    '$element',
    '$',
    'd3',
    'neo4jD3',
    'D3Colors',
    TreeMapCtrl
  ]);
