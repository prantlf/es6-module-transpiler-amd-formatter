/*jshint node:true */
/*global describe,it,beforeEach */
'use strict';

var transpiler = require('es6-module-transpiler'),
  AMDFormatter = require('..');

var container = new transpiler.Container({
  resolvers: [new transpiler.FileResolver([__dirname + '/fixtures/'])],
  formatter: new AMDFormatter({ namedModules: false })
});
container.getModule('7.js');
container.write(__dirname + '/../build/test/fixtures/7.js');
