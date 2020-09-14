/*jshint node:true */
/*global describe,it,beforeEach */
'use strict';

var transpiler = require('es6-module-transpiler'),
  AMDFormatter = require('..');

var container = new transpiler.Container({
  resolvers: [new transpiler.FileResolver([__dirname + '/fixtures/'])],
  formatter: new AMDFormatter({ directExports: true })
});
container.getModule('9.js');
container.write(__dirname + '/../build/test/fixtures/9.js');
