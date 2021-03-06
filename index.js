/* jshint node:true, undef:true, unused:true */

var assert = require('assert');

var recast = require('recast');
var types = recast.types;
var n = types.namedTypes;
var b = types.builders;
var Replacement = require('./lib/replacement');

/**
 * The 'define()' setting for referencing exports aims to produce code that can
 * be used in environments using AMD.
 *
 * Named modules will be produced, unless `options.namedModules` is set to `false`.
 *
 * @constructor
 * @param {object} options
 */
function AMDFormatter(options) {
  // `true` is default for compatibility, the environment variable
  // helps the command-line usage with `compile-modules convert`
  this.namedModules = options && options.namedModules !== undefined ? options.namedModules :
    typeof process !== 'object' || process.env.AMDFORMATTER_NAMED_MODULES !== 'false';
  this.directExports = options && options.directExports !== undefined ? options.directExports :
    typeof process === 'object' && process.env.AMDFORMATTER_DIRECT_EXPORTS === 'true';
}

/**
 * Returns an expression which globally references the export named by
 * `identifier` for the given module `mod`. For example:
 *
 *    // rsvp/defer.js, export default
 *    rsvp$defer$$.default
 *
 *    // rsvp/utils.js, export function isFunction
 *    rsvp$utils$$.isFunction
 *
 * @param {Module} mod
 * @param {ast-types.Identifier} identifier
 * @return {ast-types.MemberExpression}
 */
AMDFormatter.prototype.reference = function(mod, identifier) {
  return b.memberExpression(
    b.identifier(mod.id),
    n.Identifier.check(identifier) ? identifier : b.identifier(identifier),
    false
  );
};

/**
 * Process a variable declaration found at the top level of the module. Since
 * we do not need to rewrite exported variables, we can leave variable
 * declarations alone.
 *
 * @param {Module} mod
 * @param {ast-types.NodePath} nodePath
 * @return {?Array.<ast-types.Node>}
 */
AMDFormatter.prototype.processVariableDeclaration = function(/* mod, nodePath */) {
  return null;
};

/**
 * Process a function declaration found at the top level of the module. Since
 * we do not need to rewrite exported functions, we can leave function
 * declarations alone.
 *
 * @param {Module} mod
 * @param {ast-types.NodePath} nodePath
 * @returns {Array.<ast-types.Node>}
 */
AMDFormatter.prototype.processFunctionDeclaration = function(/* mod, nodePath */) {
  return null;
};

/**
 * Process a class declaration found at the top level of the module. Since
 * we do not need to rewrite exported classes, we can leave class
 * declarations alone.
 *
 * @param {Module} mod
 * @param {ast-types.NodePath} nodePath
 * @returns {Array.<ast-types.Node>}
 */
AMDFormatter.prototype.processClassDeclaration = function(/* mod, nodePath */) {
  return null;
};

/**
 * Because exported references are captured via a closure as part of a getter
 * on the `exports` object, there's no need to rewrite local references to
 * exported values. For example, `value` in this example can stay as is:
 *
 *   // a.js
 *   export var value = 1;
 *
 * Would be rewritten to look something like this:
 *
 *   var value = 1;
 *
 * @param {Module} mod
 * @param {ast-types.NodePath} referencePath
 * @return {ast-types.Expression}
 */
AMDFormatter.prototype.exportedReference = function(/* mod, referencePath */) {
  return null;
};

/**
 * Gets a reference to an imported binding by getting the value from the
 * required module on demand. For example, this module:
 *
 *   // b.js
 *   import { value } from './a';
 *   console.log(value);
 *
 * Would be rewritten to look something like this:
 *
 *   var a$$ = require('./a');
 *   console.log(a$$.value):
 *
 * If the given reference does not refer to an imported binding then no
 * rewriting is required and `null` will be returned.
 *
 * @param {Module} mod
 * @param {ast-types.NodePath} referencePath
 * @return {?ast-types.Expression}
 */
AMDFormatter.prototype.importedReference = function(/* mod, referencePath */) {
  return null;
};

/**
 * We do not need to rewrite references to local declarations.
 *
 * @param {Module} mod
 * @param {ast-types.NodePath} referencePath
 * @returns {?ast-types.Node}
 */
AMDFormatter.prototype.localReference = function(/* mod, referencePath */) {
  return null;
};

/**
 * @param {Module} mod
 * @param {ast-types.Expression} declaration
 * @return {ast-types.Statement}
 */
AMDFormatter.prototype.defaultExport = function(mod, declaration) {
  var exportStatement, body, lastStatement;

  if (mod.exports.declarations.length > 1) {
    if (this.directExports) {
      throw new Error('more than one default export detected');
    }
    // a default export statement inside the program body
    exportStatement = function (value)  {
      return b.expressionStatement(b.callExpression(
        b.identifier('__es6_export__'), [b.literal("default"), value]));
    };
  } else {
    body = mod.ast.program.body;
    lastStatement = body[body.length - 1];
    if (lastStatement && lastStatement.declaration !== declaration) {
      // exactly one default export statement inside the program body
      if (this.directExports) {
        throw new Error('a default export before the end of module detected');
      } else {
        exportStatement = function (value) {
          return b.expressionStatement(b.assignmentExpression("=",
            b.memberExpression(
              b.identifier('__exports__'),
              b.literal("default"),
              true
            ),
            value
          ));
        };
      }
    } else {
      // a default export statement as the last one in the program body
      if (this.directExports) {
        exportStatement = function (value) {
          return b.returnStatement(value);
        };
      } else {
        exportStatement = function (value) {
          return b.returnStatement(b.objectExpression([
            b.property('init', b.literal('default'), value)
          ]));
        };
      }
    }
  }
  if (n.FunctionDeclaration.check(declaration) ||
      n.ClassDeclaration.check(declaration)) {
    // export default function foo () {}
    // -> becomes:
    // function foo () {}
    // __es6_export__('default', foo);
    return [declaration, exportStatement(declaration.id)];
  }
  // export default {foo: 1};
  return [exportStatement(declaration)];
};

/**
 * Replaces non-default exports. For declarations we simply remove the `export`
 * keyword. For export declarations that just specify bindings, e.g.
 *
 *   export { a, b };
 *
 * we remove them entirely since they'll be handled when we define properties on
 * the `exports` object.
 *
 * @param {Module} mod
 * @param {ast-types.NodePath} nodePath
 * @return {?Replacement}
 */
AMDFormatter.prototype.processExportDeclaration = function(mod, nodePath) {
  var node = nodePath.node,
    declaration = node.declaration,
    specifiers = node.specifiers;

  if (n.FunctionDeclaration.check(declaration) ||
      n.ClassDeclaration.check(declaration)) {
    // export function <name> () {}
    // export class Foo {}
    return Replacement.swaps(nodePath, [declaration, b.expressionStatement(
      b.callExpression(b.identifier('__es6_export__'), [b.literal(declaration.id.name), declaration.id])
    )]);
  } else if (n.VariableDeclaration.check(declaration)) {
    // export default var foo = 1;
    return Replacement.swaps(nodePath, [declaration].concat(declaration.declarations.map(function (declaration) {
      return b.expressionStatement(
        b.callExpression(b.identifier('__es6_export__'), [b.literal(declaration.id.name), declaration.id])
      );
    })));
  } else if (declaration) {
    throw new Error('unexpected export style, found a declaration of type: ' + declaration.type);
  } else {
    return Replacement.swaps(nodePath, [].concat(specifiers.map(function (specifier) {
      return b.expressionStatement(
        b.callExpression(b.identifier('__es6_export__'), [b.literal((specifier.name || specifier.id).name), specifier.id])
      );
    })));
  }
};

/**
 * Since import declarations only control how we rewrite references we can just
 * remove them -- they don't turn into any actual statements.
 *
 * @param {Module} mod
 * @param {ast-types.NodePath} nodePath
 * @return {?Replacement}
 */
AMDFormatter.prototype.processImportDeclaration = function(mod, nodePath) {
  return Replacement.removes(nodePath);
};

/**
 * Since named export reassignment is just a local variable, we can ignore it.
 * e.g.
 *
 * export var foo = 1;
 * foo = 2;
 *
 * @param {Module} mod
 * @param {ast-types.NodePath} nodePath
 * @return {?Replacement}
 */
AMDFormatter.prototype.processExportReassignment = function (/* mod, nodePath */) {
  return null;
};

/**
 * Convert a list of ordered modules into a list of files.
 *
 * @param {Array.<Module>} modules Modules in execution order.
 * @return {Array.<ast-types.File}
 */
AMDFormatter.prototype.build = function(modules) {
  var self = this;
  return modules.map(function(mod) {
    var body = mod.ast.program.body,
      meta = self.buildDependenciesMeta(mod),
      oneDefaultExport = mod.exports.declarations.length === 1 && mod.exports.names[0] === 'default',
      defineArgs = [],
      dependencies = meta.deps,
      parameters = meta.identifiers,
      lastDefaultExport, originalBody, lastStatement;

    // setting up all named imports, and re-exporting from as well
    body.unshift.apply(body, self.buildPrelude(mod));

    if (!oneDefaultExport) {
      body.unshift(
        // function __es6_export__ (name, value) provides a way to set named exports into __exports__
        b.functionDeclaration(b.identifier('__es6_export__'), [b.identifier('name'), b.identifier('value')], b.blockStatement([
          b.expressionStatement(b.assignmentExpression("=",
            b.memberExpression(
              b.identifier('__exports__'),
              b.identifier('name'),
              true
            ),
            b.identifier('value')
          ))
        ]))
      );
    }
    body.unshift(
      // module body runs in strict mode.
      b.expressionStatement(b.literal('use strict'))
    );

    // wrapping the body of the program with a define() call
    if (self.namedModules) {
      defineArgs.push(
        // module name argument
        b.literal(mod.name)
      );
    }
    if (oneDefaultExport) {
      originalBody = mod.ast.original.program.body;
      lastStatement = originalBody[originalBody.length - 1];
      lastDefaultExport = n.ExportDeclaration.check(lastStatement) && lastStatement.default;
    }
    if (!lastDefaultExport) {
      dependencies = dependencies.concat(b.literal('exports'));
      parameters = parameters.concat(b.identifier('__exports__'));
    }
    defineArgs.push(
      // depedencies
      b.arrayExpression(dependencies),
      // factory function
      b.functionExpression(null, parameters, b.blockStatement(body))
    );
    mod.ast.program.body = [b.expressionStatement(b.callExpression(b.identifier('define'), defineArgs))];

    mod.ast.filename = mod.relativePath;
    return mod.ast;
  });
};

/**
 * Build a series of identifiers based on the imports (and exports with sources)
 * in the given module.
 *
 * @private
 * @param {Module} mod
 * @return {
 *   setters: {ast-types.Array}
 *   deps: {ast-types.Array}
 * }
 */
AMDFormatter.prototype.buildDependenciesMeta = function(mod) {
  var requiredModules = [];
  var importedModules = [];
  var importedModuleIdentifiers = [];
  var self = this,
    importSpecifiers;

  // `(import|export) { ... } from 'math'`
  [mod.imports, mod.exports].forEach(function(declarations) {
    declarations.modules.forEach(function(sourceModule) {
      if (~requiredModules.indexOf(sourceModule)) {
        return;
      }
      requiredModules.push(sourceModule);

      var matchingDeclaration;
      declarations.declarations.some(function(declaration) {
        if (declaration.source === sourceModule) {
          matchingDeclaration = declaration;
          return true;
        }
      });

      assert.ok(
        matchingDeclaration,
        'no matching declaration for source module: ' + sourceModule.relativePath
      );

      importSpecifiers = matchingDeclaration.specifiers;
      if (self.directExports && importSpecifiers.length === 1) {
        importedModuleIdentifiers.push(b.identifier(importSpecifiers[0].name));
      } else {
        importedModuleIdentifiers.push(b.identifier(sourceModule.id));
      }
      importedModules.push(b.literal(matchingDeclaration.sourcePath));
    });
  });

  return {
    identifiers: importedModuleIdentifiers, // [path$to$foo$$, path$to$bar$$]
    deps: importedModules                   // ["./foo", "./bar"]
  };
};

/**
 * Set the scoped values for every named import (and exports from)
 * in the given module.
 *
 * @private
 * @param {Module} mod
 * @return {Array[ast-types.Statement]}
 */
AMDFormatter.prototype.buildPrelude = function(mod) {
  var prelude = [],
    self = this;

  // import {foo} from "foo"; should hoist variables declaration
  mod.imports.names.forEach(function (name) {
    var specifier = mod.imports.findSpecifierByName(name),
      id;

    if (!specifier) {
      return null;
    }
    if (self.directExports && specifier.declaration.specifiers.length === 1) {
      return null;
    }

    prelude.push(b.variableDeclaration('var', [b.identifier(specifier.name)]));

    id = mod.getModule(specifier.declaration.node.source.value).id;
    if (specifier.from) {
      // import { value } from './a';
      // import a from './a';
      if (self.directExports && specifier.from === 'default') {
        prelude.push(b.expressionStatement(b.assignmentExpression("=",
          b.identifier(specifier.name), b.identifier(id)
        )));
      } else {
        prelude.push(b.expressionStatement(b.assignmentExpression("=",
          b.identifier(specifier.name),
          b.memberExpression(
            b.identifier(id),
            b.literal(specifier.from),
            true
          )
        )));
      }
    } else {
      // import * as a from './a'
      prelude.push(b.expressionStatement(b.assignmentExpression("=",
        b.identifier(specifier.name),
        b.identifier(id)
      )));
    }
  });

  mod.exports.names.forEach(function(name) {
    var specifier = mod.exports.findSpecifierByName(name),
      id, exportStatement, originalBody, lastStatement;

    assert.ok(
      specifier,
      'no export specifier found for export name `' +
      name + '` from ' + mod.relativePath
    );

    if (!specifier.declaration.node.source) {
      return;
    }

    if (mod.exports.declarations.length === 1 && name === 'default') {
      // exactly one default export statement
      originalBody = mod.ast.original.program.body;
      lastStatement = originalBody[originalBody.length - 1];
      if (n.ExportDeclaration.check(lastStatement) && lastStatement.default) {
        // a default export statement as the last one in the program body
        exportStatement = function (value) {
          return b.returnStatement(b.objectExpression([
            b.property('init', b.literal('default'), value)
          ]));
        };
      } else {
        // exactly one default export statement inside the program body
        exportStatement = function (value)  {
          return b.expressionStatement(b.assignmentExpression("=",
            b.memberExpression(
              b.identifier('__exports__'),
              b.literal("default"),
              true
            ),
            value
          ));
        };
      }
    } else {
      // a default export statement inside the program body
      exportStatement = function (value) {
        return b.expressionStatement(b.callExpression(
          b.identifier('__es6_export__'), [b.literal(specifier.name), value]
        ));
      };
    }

    id = mod.getModule(specifier.declaration.node.source.value).id;
    prelude.push(exportStatement(
      b.memberExpression(
        b.identifier(id),
        b.literal(specifier.from),
        true
      )
    ));
  });

  return prelude;
};

module.exports = AMDFormatter;
