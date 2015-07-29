function TreeMapCtrl ($element, $, d3, neo4jD3, D3Colors) {
  this.$ = $;
  this.d3 = d3;
  this.$element = this.$($element),
  this.$d3Element = this.$element.find('.treeMap');

  this.d3.width = this.$d3Element.width();
  this.d3.height = this.$d3Element.height();

  this.steps = 6;

  this.d3.colors = new D3Colors(
    d3.scale.category10().domain(d3.range(10)).range()
  ).getScaledFadedColors(this.steps);

  this.d3.x = this.d3.scale.linear()
    .domain([0, this.d3.width])
    .range([0, this.d3.width]);

  console.log(this.d3.x(2 * this.d3.width), 2 * this.d3.width);

  this.d3.y = this.d3.scale.linear()
    .domain([0, this.d3.height])
    .range([0, this.d3.height]);

  this.d3.treeMap = this.d3.layout.treemap()
    .children(function(d, depth) { return depth ? null : d._children; })
    .sort(function(a, b) { return a.value - b.value; })
    .ratio(this.d3.height / this.d3.width * 0.5 * (1 + Math.sqrt(5)))
    .round(false);

  this.d3.element = this.d3.select(this.$d3Element[0]).append('svg')
    .attr('class', 'd3')
    .attr('viewBox', '0 0 ' + this.d3.width + ' ' + this.d3.height)
    .append("g")
      .style("shape-rendering", "crispEdges");

  this.d3.grandparent = this.d3.element.append("g")
    .attr("class", "grandparent");

  this.d3.grandparent.append("rect")
    .attr("y", 0)
    .attr("width", this.d3.width)
    .attr("height", 0);

  this.d3.grandparent.append("text")
    .attr("x", 6)
    .attr("y", 6)
    .attr("dy", ".75em");

  neo4jD3.d3
    .then(function (data) {
      this.data = data;
      this.init();
    }.bind(this));
}

TreeMapCtrl.prototype.browseMode = function (mode) {
  this.mode = mode;
};

TreeMapCtrl.prototype.initBrowseByLevel = function () {
  if (this.data === null) {
    return false;
  }

  var that = this;

  initialize.call(this, this.data);
  accumulate_and_prune.call(this, this.data, 'numDataSets');
  layout.call(this, this.data);
  display.call(this, this.data);

  function initialize(root) {
    root.x = root.y = 0;
    root.dx = this.d3.width;
    root.dy = this.d3.height;
    root.depth = 0;
  }
};

TreeMapCtrl.prototype.init = function () {
  if (this.data === null) {
    return false;
  }

  var that = this;

  initialize.call(this, this.data);
  accumulate_and_prune.call(this, this.data, 'numDataSets');
  layout.call(this, this.data);
  display.call(this, this.data);

  function initialize(root) {
    root.x = root.y = 0;
    root.dx = this.d3.width;
    root.dy = this.d3.height;
    root.depth = 0;
  }

  /**
   * Starter function for aggrgation and pruning.
   * @param  {object} data D3 tree object.
   */
  function accumulate_and_prune(data, valueProp) {
    var numChildren = data.children ? data.children.length : false;
    data.meta = data.meta || {};
    if (numChildren) {
      accumulate_and_prune_children(data, numChildren, valueProp, 0, true);
      if (data.value) {
        data.value += data[valueProp];
      } else {
        data.value = data[valueProp];
      }
    }
  }

  /**
   * Aggregate `numDataSets` values and prune _empty_ leafes. This function
   * traverses all inner loops and stops one level BEFORE a leaf to be able to
   * splice (delete) empty leafs from the list of children
   * @param  {[type]} data        [description]
   * @param  {[type]} numChildren [description]
   * @return {[type]}             [description]
   */
  function accumulate_and_prune_children(node, numChildren, valueProp, depth, root) {
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

      if (root) {
        child.meta.branchNo = i;
      } else {
        child.meta.branchNo = node.meta.branchNo;
      }

      if (numChildChildren) {
        // Inner node.
        accumulate_and_prune_children(child, numChildChildren, valueProp, depth + 1);
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
          // We `child`, i.e. remove, a node in two cases
          // A) `child` is the only child pf `node` or
          // B) `child` only has one child.
          // This was we ensure that the out degree of `child` is two or higher.
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

  // Compute the treemap layout recursively such that each group of siblings
  // uses the same size (1×1) rather than the dimensions of the parent cell.
  // This optimizes the layout for the current zoom state. Note that a wrapper
  // object is created for the parent node for each group of siblings so that
  // the parent’s dimensions are not discarded as we recurse. Since each group
  // of sibling was laid out in 1×1, we must rescale to fit using absolute
  // coordinates. This lets us use a viewport to zoom.
  function layout(data) {
    if (data._children && data._children.length) {
      this.d3.treeMap({_children: data._children});
      for (var i = 0, len = data._children.length; i < len; i++) {
        var child = data._children[i];
        child.x = data.x + child.x * data.dx;
        child.y = data.y + child.y * data.dy;
        child.dx *= data.dx;
        child.dy *= data.dy;
        child.parent = data;
        layout(child);
      }
    }
  }

  function layoutByLevel (data, numLevels) {
    // Default number of levels to show.
    numLevels = numLevels || 10;
    if (data._children && data._children.length) {
      this.d3.treeMap({_children: data._children});
    }
  }

  function display(d) {
    this.d3.grandparent
      .datum(d.parent)
      .on("click", transition.bind(this))
      .select("text")
        .text(name(d));

    var groupWrapper = this.d3.element
      .insert("g", ".grandparent")
      .datum(d)
      .attr("class", "depth");

    var g = groupWrapper
          .selectAll("g")
          .data(d._children)
          .enter()
            .append("g");

    if (this.numLevels > 1) {
      for (var i = 0, len = d._children.length; i < len; i++) {
        if (d._children[i]._children && d._children[i]._children.length) {
          addChildren.call(this, this.d3.select(g[0][i]), d._children[i], 2);
        }
      }
    }

    g.filter(function(d) { return d._children && d._children.length; })
      .classed("children", true)
      .on("click", transition.bind(this));

    g.selectAll(".child")
      .data(function(d) { return d._children || [d]; })
      .enter()
      .append("rect")
        .attr("class", "child")
        .attr("fill", function(d) {
          return d.depth ? this.d3.colors((d.meta.branchNo * this.steps) + Math.min(this.steps, d.meta.depth) - 1) : null;
        }.bind(this))
        .call(this.rect.bind(this));

    g.append("rect")
      .attr("class", function (d) {
        return (d._children && d._children.length) ? 'parent' : 'leaf';
      })
      .attr("fill", function(d) {
        if (!(d._children && d._children.length)) {
          if (d.meta.depth) {
            return this.d3.colors((d.meta.branchNo * this.steps) + Math.min(this.steps, d.meta.depth) - 1);
          }
        }
        return null;
      }.bind(this))
      .call(this.rect.bind(this))
      .append("title")
        .text(function(d) {
          return d.uri || d.name;
        });

    // g.filter(function(d) { return !(d._children && d._children.length); })
    //   .classed("leaf", true)
    //   .append("rect")
    //     .attr("class", "inner-border")
    //     .attr("stroke", function(d) {
    //       return d.depth ? this.d3.colors((d.meta.branchNo * this.steps) + Math.min(this.steps, d.meta.depth) - 1) : null;
    //     }.bind(this))
    //     .call(rect);

    g.append("text")
      .attr("dy", ".75em")
      .text(function(d) { return d.name; })
      .call(this.text.bind(this));

    function addChildren(wrapper, d, level) {
      var g = wrapper
          .selectAll("g")
          .data(d._children)
          .enter()
            .append("g");

      if (level < this.numLevels) {
        for (var i = 0, len = d._children.length; i < len; i++) {
          if (d._children[i]._children && d._children[i]._children.length) {
            addChildren.call(this, this.d3.select(g[0][i]), d._children[i], level + 1);
          }
        }
      }

      g.filter(function(d) { return d._children && d._children.length; })
        .classed("children", true);

      g.selectAll(".child")
        .data(function(d) { return d._children || [d]; })
        .enter()
        .append("rect")
          .attr("class", "child")
          .attr("fill", function(d) {
            return d.depth ? this.d3.colors((d.meta.branchNo * this.steps) + Math.min(this.steps, d.meta.depth) - 1) : null;
          }.bind(this))
          .call(this.rect.bind(this));

      g.append("rect")
        .attr("class", function (d) {
          return (d._children && d._children.length) ? 'parent' : 'leaf';
        })
        .attr("fill", function(d) {
          if (!(d._children && d._children.length)) {
            if (d.meta.depth) {
              return this.d3.colors((d.meta.branchNo * this.steps) + Math.min(this.steps, d.meta.depth) - 1);
            }
          }
          return null;
        }.bind(this))
        .call(this.rect.bind(this))
        .append("title")
          .text(function(d) {
            return d.uri || d.name;
          });

      // g.filter(function(d) { return !(d._children && d._children.length); })
      //   .classed("leaf", true)
      //   .append("rect")
      //     .attr("class", "inner-border")
      //     .attr("stroke", function(d) {
      //       return d.depth ? this.d3.colors((d.meta.branchNo * this.steps) + Math.min(this.steps, d.meta.depth) - 1) : null;
      //     }.bind(this))
      //     .call(rect);
    }

    function transition (data) {
      if (this.d3.transitioning || !data) {
        return;
      }

      this.d3.transitioning = true;

      var newGroupWrapper = display.call(this, data),
          oldTree = groupWrapper.transition().duration(750),
          newTree = newGroupWrapper.transition().duration(750);

      // Update the domain only after entering new elements.
      this.d3.x.domain([data.x, data.x + data.dx]);
      this.d3.y.domain([data.y, data.y + data.dy]);

      // Enable anti-aliasing during the transition.
      this.d3.element.style("shape-rendering", null);

      // Draw child nodes on top of parent nodes.
      this.d3.element
        .selectAll(".depth")
        .sort(function(a, b) {
          return a.depth - b.depth;
        });

      // Fade-in entering text.
      newGroupWrapper.selectAll("text")
        .style("fill-opacity", 0);

      // Transition to the new view.
      oldTree.selectAll("text")
        .call(this.text.bind(this))
        .style("fill-opacity", 0);

      newTree.selectAll("text")
        .call(this.text.bind(this))
        .style("fill-opacity", 1);

      oldTree.selectAll("rect")
        .call(this.rect.bind(this));

      newTree.selectAll("rect")
        .call(this.rect.bind(this));

      // Remove the old node when the transition is finished.
      oldTree.remove()
        .each("end", function() {
          this.d3.element.style("shape-rendering", "crispEdges");
          this.d3.transitioning = false;
        }.bind(this));
    }

    return g;
  }

  function text(el) {
    el
      .attr("x", function(d) { return that.d3.x(d.x + 6); })
      .attr("y", function(d) { return that.d3.y(d.y + 6); });
  }

  function rect(el) {
    el
      .attr("x", function(d) { return that.d3.x(d.x); })
      .attr("y", function(d) { return that.d3.y(d.y); })
      .attr("width", function(d) { return that.d3.x(d.x + d.dx) - that.d3.x(d.x); })
      .attr("height", function(d) { return that.d3.y(d.y + d.dy) - that.d3.y(d.y); });
  }

  function name(d) {
    return d.parent ? name(d.parent) + "." + d.name : d.name;
  }
};

TreeMapCtrl.prototype.name = function (data) {
    return d.parent ? name(d.parent) + "." + d.name : d.name;
};

/**
 * Set the coordinates of the rectangular.
 *
 * How to invoke:
 * `call(this.rect.bind(this))`
 *
 * Note: This weird looking double this is needed as the context of a `call`
 * function is actually the same as the selection passed to it, which seems
 * redundant but that's how it works right now.
 *
 * URL: https://github.com/mbostock/d3/wiki/Selections#call
 *
 * @param  {[type]} el [description]
 * @return {[type]}    [description]
 */
TreeMapCtrl.prototype.rect = function (elements) {
  var that = this;

  console.log(this);

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

TreeMapCtrl.prototype.text = function (el) {
  var that = this;

  el.attr("x", function(data) {
      return that.d3.x(data.x) + 6;
    })
    .attr("y", function(data) {
      return that.d3.y(data.y) + 6;
    });
};

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
    value: 3,
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
