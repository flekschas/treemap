/* global angular:false */

function TreeMapCtrl ($element, $, d3, neo4jD3, D3Colors) {
  this.$ = $;
  this.d3 = d3;
  this.$element = this.$($element),
  this.$d3Element = this.$element.find('.treeMap svg');

  this._numLevels = 3;

  this.d3.width = this.$d3Element.width();
  this.d3.height = this.$d3Element.height();

  this.numColors = 10;
  this.steps = 6;

  this.d3.colors = new D3Colors(
    d3.scale.category10().domain(d3.range(this.numColors)).range()
  ).getScaledFadedColors(this.steps);

  this.d3.x = this.d3.scale.linear()
    .domain([0, this.d3.width])
    .range([0, this.d3.width]);

  this.d3.y = this.d3.scale.linear()
    .domain([0, this.d3.height])
    .range([0, this.d3.height]);

  this.d3.treeMap = this.d3.layout.treemap()
    .children(function(d, depth) { return depth ? null : d._children; })
    .sort(function(a, b) { return a.value - b.value; })
    .ratio(this.d3.height / this.d3.width * 0.5 * (1 + Math.sqrt(5)))
    .round(false);

  this.d3.element = this.d3.select(this.$d3Element[0])
    .attr('viewBox', '0 0 ' + this.d3.width + ' ' + this.d3.height)
    .append('g')
      .style('shape-rendering', 'crispEdges');

  this.d3.grandparent = this.d3.element.append('g')
    .attr('class', 'grandparent');

  this.d3.grandparent.append('rect')
    .attr('y', 0)
    .attr('width', this.d3.width)
    .attr('height', 0);

  this.d3.grandparent.append('text')
    .attr('x', 6)
    .attr('y', 6)
    .attr('dy', '.75em');

  this.counter = 0;

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
    node.meta.depth = depth;
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
            meta: child.meta,
            pseudoNode: true,
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
          child.meta.depth = depth + 1;
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
TreeMapCtrl.prototype.addChildren = function (parent, data, level) {
  var that = this;

  this.counter = 0;

  var children = parent.selectAll("g")
    .data(data._children)
    .enter()
      .append("g");

  // Recursion
  if (level < this.numLevels) {
    this.children[level + 1] = [];
    children.each(function (data) {
      if (data._children && data._children.length) {
        that.children[level + 1].push(
          that.addChildren.call(that, that.d3.select(this), data, level + 1)
        );
      }
    });
  }

  var childrensChildren = children.filter(function(child) {
      return child._children && child._children.length;
    })
    .classed("children", true);

  var childrensLeafs = children.filter(function(child) {
      return !(child._children && child._children.length);
    })
    .classed("leaf", true);

  if (level === 1) {
    childrensChildren
      .on("click", function (data) {
        /*
         * that = TreeMapCtrl
         * this = the clicked DOM element
         * data = data
         */
        that.transition.call(that, this, data);
      });
  }

  var childEls = children.selectAll(".child")
    .data(function(d) { return d._children || [d]; })
    .enter()
    .append("rect")
      .attr("class", "child")
      .attr("fill", this.color.bind(this))
      .call(this.rect.bind(this))
      .attr('opacity', 0)
      .transition()
      .duration(200);

  var parentEls = childrensChildren
    .append('rect')
    .attr('class', 'parent')
    .attr('fill', this.color.bind(this))
    .call(that.rect.bind(that));

  parentEls
    .append('title')
      .text(function(child) {
        return child.uri || child.name;
      });

  parentEls
    .attr('opacity', 0)
    .transition()
    .duration(200);

  var leafEls = childrensLeafs
    .append('use')
    .attr('stroke', this.color.bind(this))
    .attr('xlink:href', '#inner-border-rect')
    .call(that.rect.bind(that));

  leafEls
    .append('title')
      .text(function(leaf) {
        return leaf.uri || leaf.name;
      });

  leafEls
    .attr('opacity', 0)
    .transition()
    .duration(200);

  childEls.attr('opacity', 1);
  parentEls.attr('opacity', 1);
  leafEls.attr('opacity', 1);

  if (level < 2) {
    children.append('text')
      .attr('dy', '.75em')
      .text(function(child) { return child.name; })
      .call(this.text.bind(this));
  }

  return children;
};

/**
 * Add levels of children starting from level `level` until `this.numLevels`.
 *
 * @param  {Number}  level  Starting level.
 */
TreeMapCtrl.prototype.addLevels = function (level) {
  var that = this;

  that.children[level + 1] = [];
  for (var i = 0, len = this.children[level].length; i < len; i++) {
    this.children[level][i].each(function (data) {
      if (data._children && data._children.length) {
        that.children[level + 1].push(
          that.addChildren.call(that, that.d3.select(this), data, level + 1)
        );
      }
    });
  }

  // Check if any children have been added at all.
  if (!that.children[level + 1].length) {
    this.numLevels = level;
  }
};

TreeMapCtrl.prototype.adjustLevelDepth = function (oldLevel, newLevel) {
  if (oldLevel < newLevel) {
    this.addLevels(oldLevel);
  }
  if (oldLevel > newLevel) {
    var i, len;
    // Remove all children deeper than what is specified.
    for (i = 0, len = this.children[newLevel + 1].length; i < len; i++) {
      var group = this.children[newLevel + 1][i].transition().duration(250);

      // Fade groups out and remove them
      group
        .style("opacity", 0)
        .remove();
    }
    for (i = newLevel + 1; i <= oldLevel; i++) {
      this.children[i] = undefined;
    }
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

TreeMapCtrl.prototype.color = function (node) {
  if (this.colorMode === 'depth') {
    // Color by original depth
    // The deeper the node, the lighter the color
    return this.d3.colors((node.meta.branchNo[0] * this.steps) +
      Math.min(this.steps, node.meta.depth) - 1);
  }
  // Default:
  // Color by reverse final depth, i.e. after pruning. The fewer children a node
  // has, the lighter the color. E.g. a leaf is lightest while the root is
  // darkest.
  return this.d3.colors((node.meta.branchNo[0] * this.steps) +
    Math.max(0, this.steps - node.meta.revDepth - 1));
}

/**
 * Display the data.
 *
 * @param   {[type]}  node  D3 data object of the node.
 * @return  {Object}        D3 selection of node's children.
 */
TreeMapCtrl.prototype.display = function (node) {
  var that = this;

  // Update the grand parent, which is kind of the "back button"
  this.d3.grandparent
    .datum(node.parent)
    .on("click", function (data) {
      /*
       * that = TreeMapCtrl
       * this = the clicked DOM element
       * data = data
       */
      that.transition.call(that, this, data);
    })
    .select("text")
      .text(this.name(node));

  // Keep a reference to the old wrapper
  this.d3.formerGroupWrapper = this.d3.groupWrapper;

  // Create a new wrapper group for the children.
  this.d3.groupWrapper = this.d3.element
    .insert("g", ".grandparent")
    .datum(node)
    .attr("class", "depth");

  // For completeness we store the children of level zero.
  this.children[0] = [this.d3.groupWrapper];

  var children = this.addChildren.call(this, this.d3.groupWrapper, node, 1);

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
  this.display(this.data);
};

/**
 * Initialize the root node. This would usually be computed by `treemap()`.
 *
 * @param  {Object} data  D3 data object.
 */
TreeMapCtrl.prototype.initialize = function (data) {
  data.x = data.y = 0;
  data.dx = this.d3.width;
  data.dy = this.d3.height;
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
  if (parent._children && parent._children.length) {
    this.depth = Math.max(this.depth, depth + 1);
    // This creates an anonymous 1px x 1px treemap and sets the children's
    // coordinates accordingly.
    this.d3.treeMap({_children: parent._children});
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
TreeMapCtrl.prototype.rect = function (elements) {
  var that = this;

  elements
    .attr("x", function (data) {
      return that.d3.x(data.x);
    })
    .attr("y", function (data) {
      return that.d3.y(data.y);
    })
    .attr("width", function (data) {
      return that.d3.x(data.x + data.dx) - that.d3.x(data.x);
    })
    .attr("height", function (data) {
      return that.d3.y(data.y + data.dy) - that.d3.y(data.y);
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
      return that.d3.x(data.x) + 6;
    })
    .attr("y", function(data) {
      return that.d3.y(data.y) + 6;
    });
};

/**
 * Transition between parent <> child branches of the treemap.
 *
 * @param   {Object}  data  D3 data object of the node to transition to.
 */
TreeMapCtrl.prototype.transition = function (el, data) {
  console.log('hurz', el, data);
  if (this.d3.transitioning || !data) {
    return;
  }

  console.log(data.name, el, data)

  this.d3.transitioning = true;

  var newGroups = this.display.call(this, data).transition().duration(750),
    formerGroupWrapper = this.d3.formerGroupWrapper.transition().duration(750);

  // Update the domain only after entering new elements.
  this.d3.x.domain([data.x, data.x + data.dx]);
  this.d3.y.domain([data.y, data.y + data.dy]);

  // Enable anti-aliasing during the transition.
  this.d3.element.style("shape-rendering", null);

  // // Draw child nodes on top of parent nodes.
  // this.d3.element
  //   .selectAll(".depth")
  //   .sort(function(a, b) {
  //     return a.depth - b.depth;
  //   });

  // Fade-in entering text.
  newGroups.selectAll("text")
    .style("fill-opacity", 0);

  // Transition to the new view.
  formerGroupWrapper.selectAll("text")
    .call(this.text.bind(this))
    .style("fill-opacity", 0);

  newGroups.selectAll("text")
    .call(this.text.bind(this))
    .style("fill-opacity", 1);

  formerGroupWrapper.selectAll("rect")
    .call(this.rect.bind(this));

  formerGroupWrapper.selectAll("use")
    .call(this.rect.bind(this));

  newGroups.selectAll("rect")
    .call(this.rect.bind(this));

  newGroups.selectAll("use")
    .call(this.rect.bind(this));

  // Remove the old node when the transition is finished.
  formerGroupWrapper.remove()
    .each("end", function() {
      this.d3.element.style("shape-rendering", "crispEdges");
      this.d3.transitioning = false;
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
  'd3',
  {
    configurable: false,
    enumerable: true,
    value: {},
    writable: true
});

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
  'mode',
  {
    configurable: false,
    enumerable: true,
    value: 'branch',
    writable: true
});

Object.defineProperty(
  TreeMapCtrl.prototype,
  'numLevels',
  {
    configurable: false,
    enumerable: true,
    get: function () {
      return this._numLevels;
    },
    set: function (numLevels) {
      var oldLevel = this._numLevels;
      this._numLevels = Math.max(1, numLevels);
      this.adjustLevelDepth(oldLevel, this.numLevels);
    }
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
