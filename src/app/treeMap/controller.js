function TreeMapCtrl ($element, $, d3, neo4jD3) {
  this.$ = $;
  this.d3 = d3;
  this.$element = this.$($element);

  this.d3.width = this.$element.width();
  this.d3.height = this.$element.height();

  this.d3.color = this.d3.scale.category20c();

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

  this.d3.element = this.d3.select($element[0]).append('svg')
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
      this.data = {
        name: 'owl:Thing',
        children: data.children[0].children
      };
      this.init();
    }.bind(this));
}

TreeMapCtrl.prototype.xinit = function () {

};

TreeMapCtrl.prototype.init = function () {
  if (this.data === null) {
    return false;
  }

  var that = this;

  initialize.call(this, this.data);
  accumulateByCount.call(this, this.data);
  layout.call(this, this.data);
  display.call(this, this.data);

  console.log(this.data);

  function initialize(root) {
    root.x = root.y = 0;
    root.dx = this.d3.width;
    root.dy = this.d3.height;
    root.depth = 0;
  }

  // Aggregate the values for internal nodes. This is normally done by the
  // treemap layout, but not here because of our custom implementation.
  // We also take a snapshot of the original children (_children) to avoid
  // the children being overwritten when when layout is computed.
  function accumulate(data) {
    data._children = data.children;
    if (data._children) {
      data.value = data.children.reduce(
        function(previousValue, currentValue) {
          return previousValue + accumulate(currentValue);
        },
        0
      );
      return data.value;
    }
    return data.value;
  }

  // Simple cound the number of children
  function accumulateByCount(data) {
    data._children = data.children;
    if (data._children && data._children.length) {
      data.value = data.children.reduce(
        function(previousValue, currentValue) {
          return previousValue + accumulateByCount(currentValue);
        },
        0
      );
      return data.value;
    }
    return 1;
  }

  // Compute the treemap layout recursively such that each group of siblings
  // uses the same size (1×1) rather than the dimensions of the parent cell.
  // This optimizes the layout for the current zoom state. Note that a wrapper
  // object is created for the parent node for each group of siblings so that
  // the parent’s dimensions are not discarded as we recurse. Since each group
  // of sibling was laid out in 1×1, we must rescale to fit using absolute
  // coordinates. This lets us use a viewport to zoom.
  function layout(d) {
    if (d._children) {
      this.d3.treeMap.nodes({_children: d._children});
      d._children.forEach(function(c) {
        c.x = d.x + c.x * d.dx;
        c.y = d.y + c.y * d.dy;
        c.dx *= d.dx;
        c.dy *= d.dy;
        c.parent = d;
        layout(c);
      });
    }
  }

  function display(d) {
    this.d3.grandparent
      .datum(d.parent)
      .on("click", transition)
      .select("text")
        .text(name(d));

    var g1 = this.d3.element.insert("g", ".grandparent")
      .datum(d)
      .attr("class", "depth");

    var g = g1.selectAll("g")
      .data(d._children)
      .enter().append("g");

    g.filter(function(d) { return d._children; })
      .classed("children", true)
      .on("click", transition);

    g.selectAll(".child")
      .data(function(d) { return d._children || [d]; })
      .enter().append("rect")
      .attr("class", "child")
      .call(rect);

    g.append("rect")
      .attr("class", "parent")
      .call(rect)
      .append("title")
      .text(this, function(d) { return formatNumber(d.name); });

    g.append("text")
      .attr("dy", ".75em")
      .text(function(d) { return d.name; })
      .call(text);

    function transition(d) {
      console.log(that.d3.transitioning, d);
      if (that.d3.transitioning || !d) {
        return;
      }
      that.d3.transitioning = true;

      var g2 = display(d),
          t1 = g1.transition().duration(750),
          t2 = g2.transition().duration(750);

      // Update the domain only after entering new elements.
      that.d3.x.domain([d.x, d.x + d.dx]);
      that.d3.y.domain([d.y, d.y + d.dy]);

      // Enable anti-aliasing during the transition.
      that.d3.element.style("shape-rendering", null);

      // Draw child nodes on top of parent nodes.
      that.d3.element.selectAll(".depth").sort(function(a, b) { return a.depth - b.depth; });

      // Fade-in entering text.
      g2.selectAll("text").style("fill-opacity", 0);

      // Transition to the new view.
      t1.selectAll("text").call(text).style("fill-opacity", 0);
      t2.selectAll("text").call(text).style("fill-opacity", 1);
      t1.selectAll("rect").call(rect);
      t2.selectAll("rect").call(rect);

      // Remove the old node when the transition is finished.
      t1.remove().each("end", function() {
        that.d3.element.style("shape-rendering", "crispEdges");
        that.d3.transitioning = false;
      });
    }

    return g;
  }

  function text(txt) {
    txt.attr("x", function(d) { return that.d3.x(d.x) + 6; })
      .attr("y", function(d) { return that.d3.y(d.y) + 6; });
  }

  function rect(rct) {
    rct.attr("x", function(d) { return that.d3.x(d.x); })
      .attr("y", function(d) { return that.d3.y(d.y); })
      .attr("width", function(d) { return that.d3.x(d.x + d.dx) - that.d3.x(d.x); })
      .attr("height", function(d) { return that.d3.y(d.y + d.dy) - that.d3.y(d.y); });
  }

  function name(d) {
    return d.parent ? name(d.parent) + "." + d.name : d.name;
  }
};

Object.defineProperty(
  TreeMapCtrl.prototype,
  'd3', {
    configurable: false,
    enumerable: true,
    value: {},
    writable: true
});

Object.defineProperty(
  TreeMapCtrl.prototype,
  'data', {
    configurable: false,
    enumerable: true,
    value: null,
    writable: true
});

angular
  .module('treeMap')
  .controller('TreeMapCtrl', [
    '$element',
    '$',
    'd3',
    'neo4jD3',
    TreeMapCtrl
  ]);
