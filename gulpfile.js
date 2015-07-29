var clean         = require('gulp-clean');
var concat        = require('gulp-concat');
var gulp          = require('gulp');
var gulpUtil      = require('gulp-util');
var opn           = require('opn');
var plumber       = require('gulp-plumber');
var rename        = require("gulp-rename");
var runSequence   = require('run-sequence');
var sass          = require('gulp-sass');
var spawn         = require('child_process').spawn;
var templateCache = require('gulp-angular-templatecache');
var webserver     = require('gulp-webserver');
var wrap          = require('gulp-wrap');


/*
 * -----------------------------------------------------------------------------
 * Config
 * -----------------------------------------------------------------------------
 */

var openBrowser   = gulpUtil.env.open;


/*
 * -----------------------------------------------------------------------------
 * Config
 * -----------------------------------------------------------------------------
 */

var sourcePaths = {
  assets: '/assets',
  styles: [
    '/assets/styles'
  ],
  jsSource: [
    '/app',
    '/common'
  ]
};

var vendorPaths = [
  'bower_components/angular/angular.js',
  'bower_components/angular-resource/angular-resource.js',
  'bower_components/d3/d3.js',
  'bower_components/lodash/lodash.js',
  'bower_components/jquery/dist/jquery.js',
];

var globalPaths = {
  src: 'src',
  dist: 'dist'
};

var server = {
  host: 'localhost',
  port: '8001'
};


/*
 * -----------------------------------------------------------------------------
 * Tasks
 * -----------------------------------------------------------------------------
 */

gulp.task('clean', function () {
  return gulp
    .src(globalPaths.dist, {read: false})
    .pipe(clean());
});

gulp.task('templates', function () {
  return gulp
    .src([
      globalPaths.src + '/app/**/*.html',
      globalPaths.src + '/common/**/*.html',
    ])
    .pipe(templateCache({
      standalone: true
    }))
    .pipe(gulp.dest(globalPaths.dist + sourcePaths.assets));
});

gulp.task('index', function () {
  return gulp
    .src(globalPaths.src + '/index.html')
    .pipe(plumber())
    .pipe(gulp.dest(globalPaths.dist));
});

gulp.task('sass', function () {
  return gulp
    .src(globalPaths.src + sourcePaths.styles + '/styles.scss')
    .pipe(plumber())
    .pipe(sass().on('error', sass.logError))
    .pipe(gulp.dest(globalPaths.dist + sourcePaths.assets));
});

gulp.task('jsSource', function () {
  return gulp
    .src([
      globalPaths.src + '/**/*module.js',
      globalPaths.src + '/**/!(*module).js'
    ])
    .pipe(plumber())
    .pipe(wrap('// <%= file.path %>\n<%= contents %>\n\n'))
    .pipe(concat('app.js'))
    .pipe(gulp.dest(globalPaths.dist + sourcePaths.assets));
});

gulp.task('jsVendor', function () {
  return gulp
    .src(vendorPaths)
    .pipe(plumber())
    .pipe(wrap('// <%= file.path %>\n<%= contents %>\n\n'))
    .pipe(concat('vendor.js'))
    .pipe(gulp.dest(globalPaths.dist + sourcePaths.assets));
});

gulp.task('webserver', function() {
  gulp.src( '.' )
    .pipe(webserver({
      host:             server.host,
      port:             server.port,
      livereload:       true,
      directoryListing: false
    }));
});

gulp.task('open', function() {
  if (openBrowser) {
    opn('http://' + server.host + ':' + server.port + '/dist');
  }
});

/*
 * -----------------------------------------------------------------------------
 * Watcher
 * -----------------------------------------------------------------------------
 */

gulp.task('watch', function() {
  gulp.watch(globalPaths.src + '/index.html', ['index']);
  gulp.watch([
      globalPaths.src + '/app/**/*.html',
      globalPaths.src + '/common/**/*.html',
    ], ['templates']);
  gulp.watch(globalPaths.src + sourcePaths.styles + '/**/*.scss', ['sass']);
  gulp.watch(globalPaths.src + '/**/*.js', ['jsSource']);
  gulp.watch(vendorPaths, ['jsVendor']);
});

gulp.task('build', function(callback) {
  runSequence(
    'clean',
    [
      'index', 'sass', 'jsSource', 'jsVendor', 'templates'
    ],
    callback);
});

gulp.task('default', ['build', 'webserver', 'watch', 'open']);
