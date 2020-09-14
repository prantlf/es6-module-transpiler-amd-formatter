es6-module-transpiler-amd-formatter
===================================

ES6 Module Transpiler Formatter to Output AMD `define()` Format

## Overview

ES6 Module Transpiler `es6-module-transpiler` is an experimental compiler that allows you to write your JavaScript using a subset of the current ES6 module syntax, and compile it into various formats. The `es6-module-transpiler-amd-formatter` is one of those output formats that is focus on enabling the use of ES6 modules thru [RequireJS][] today.

[RequireJS]: http://www.requirejs.org/
[es6-module-transpiler]: https://github.com/square/es6-module-transpiler

## Disclaimer

This output format compromises in few of the ES6 features in ES6 modules, including live bindings, sealed objects, etc. This compromise is Ok when you try to use them as AMD modules.

## Usage

### Build tools

Since this formatters is an plugin for [es6-module-transpiler], you can use it with any existing build tool that supports [es6-module-transpiler] as the underlaying engine to transpile the ES6 modules.

You just need to make sure that `es6-module-transpiler-amd-formatter` is accessible for those tools, and pass the proper `formatter` option thru the [es6-module-transpiler][] configuration.

### Executable

If you plan to use the `compile-module` CLI, the formatters can be used directly from the command line:

```
$ npm install es6-module-transpiler
$ npm install es6-module-transpiler-amd-formatter
$ ./node_modules/.bin/compile-modules convert -f es6-module-transpiler-amd-formatter path/to/**/*.js -o build/
```

__The `-f` option allow you to specify the path to the specific formatter, which is this case is an installed module called `es6-module-transpiler-amd-formatter`.__

### Library

You can also use the formatter with the transpiler as a library:

```javascript
var transpiler = require('es6-module-transpiler');
var AMDFormatter = require('es6-module-transpiler-amd-formatter');
var Container = transpiler.Container;
var FileResolver = transpiler.FileResolver;

var container = new Container({
  resolvers: [new FileResolver(['lib/'])],
  formatter: new AMDFormatter()
});

container.getModule('index');
container.write('out/mylib.js');
```

### Named Modules

Named modules will be produced by default. If you want to process the modules by the [RequireJS] optimizer and let the `r.js` assign the module names, you can configure this formatter to produce unnamed modules.

If you use the command-line tool, set the environment variable `AMDFORMATTER_NAMED_MODULES` to `false`:

```
AMDFORMATTER_NAMED_MODULES=false ./node_modules/.bin/compile-modules ...
```

If you use the library, set the option `namedModules` to `false` in the constructor of the formatter:

```javascript
var container = new Container({
  resolvers: [new FileResolver(['lib/'])],
  formatter: new AMDFormatter({ namedModules: false })
});
```

### Simplified Exports

If you maintain a large project compiled by an [AMD.JS] bundler, you may be looking for a way of supplying modern [ES6] modules, but you will not be able to replace the bundler because of its additional functionality ([RequireJS]) and the existing code base. [ES6] and [AMD.JS] are not entirely compatible, especially when dealing with the default exports. The following rules allow to mix [ES6] and [AMD.JS] modules in a single build:

* Default exports allowed only at the end of a module to allow exporting them by `return` and not by the wrapper `exports` object with the `default` key.
* A default export imported directly, without the wrapper object with the `default` key.
* Named exports imported as an object, with the exported names as keys.

Depending on those rules, the following ES6 module:

```javascript
import assert from "./assert";

export default function (a, b) {
  assert(a);
  assert(b);
  return a + b;
};
```

will be transpiled as if it was coded as a native [AMD.JS]:

```javascript
define("component/foo", ["./assert"], function (assert) {
  "use strict";

  return function (a, b) {
    assert(a);
    assert(b);
    return a + b;
  };
});
```

[ES6] modules developed for an [AMD.JS] project this way will be reusable in the future, when the bundler will be replaced.

If you use the command-line tool, set the environment variable `AMDFORMATTER_DIRECT_EXPORTS` to `true`:

```
AMDFORMATTER_DIRECT_EXPORTS=true ./node_modules/.bin/compile-modules ...
```

If you use the library, set the option `directExports` to `true` in the constructor of the formatter:

```javascript
var container = new Container({
  resolvers: [new FileResolver(['lib/'])],
  formatter: new AMDFormatter({ directExports: true })
});
```

You will want to disable the [named modules](#named-modules) generation, if you combine [ES6] and [AMD.JS] modules in a single (build) project and want to let the [RequireJS] optimizer (`r.js`) to generate the module names.

[AMD.JS]: https://github.com/amdjs/amdjs-api#readme
[ES6]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules

## Supported ES6 Module Syntax

Again, this syntax is in flux and is closely tracking the module work being done by TC39. This package relies on the syntax supported by [es6-module-transpiler], which relies on [esprima], you can have more information about the supported syntax here: https://github.com/square/es6-module-transpiler#supported-es6-module-syntax

[esprima]: https://github.com/ariya/esprima

## Compiled Output

First of all, the output format for `define()` might looks alien even for many developers, but considering that [es6-module-transpiler] relies on [Recast] to mutate the original ES6 code, it can output the corresponding [sourceMap], you should be able to debug the module code without having to understand the actual output format.

[sourceMap]: http://www.html5rocks.com/en/tutorials/developertools/sourcemaps/
[Recast]: https://github.com/benjamn/recast

### Default export

For a module without imports, and a single default exports:

```javascript
export default function (a, b) {
  return a + b;
}
```

will produce something like this:

```javascript
define("component/foo", ["exports"], function(__exports__) {
  "use strict";

  function __es6_export__(name, value) {
    __exports__[name] = value;
  }

  __es6_export__("default", function(a, b) {
    return a + b;
  });
});
```

### Imports and exports

A more complex example will look like this:

```javascript
import assert from "./assert";

export default function (a, b) {
  assert(a);
  assert(b);
  return a + b;
};
```

and the output will be:

```javascript
define("component/foo", ["./assert", "exports"], function(component$assert$$, __exports__) {
  "use strict";

  function __es6_export__(name, value) {
    __exports__[name] = value;
  }

  var assert = component$assert$$["default"];
  __es6_export__("assert", component$assert$$["assert"]);

  __es6_export__("default", function(a, b) {
    assert(a);
    assert(b);
    return a + b;
  });
});
```

Part of the goal, is try to preserve as much as possible the original code of the module within the factory function. Obviously, this is difficult when you have to export default functions and other declarations. The only modifications you will see in the body are the calls to the `__es6_export__()` method to export the new value when defined or updated, the rest of the code will remain immutable.

### Default export optimisation

If the default export is the single export in a module and it is not the last statement, the `__es6_export__` function will not be generated. For example:

```javascript
export default function (a, b) {
  return a + b;
}
console.log('done');
```

will produce something like this:

```javascript
define("component/foo", ["exports"], function(__exports__) {
  "use strict";

  __exports__["default"] = function(a, b) {
    return a + b;
  };
  console.log('done');
});
```

If the default export is the single export in a module and it is the last statement, it will be returned from the module withotu using the `__exports__` parameter. For example:

```javascript
export default function (a, b) {
  return a + b;
}
```

will produce something like this:

```javascript
define("component/foo", [], function() {
  "use strict";

  return function(a, b) {
    return a + b;
  };
});
```

## Contributing

1. Fork it
2. Create your feature branch (`git checkout -b my-new-feature`)
3. Commit your changes (`git commit -am 'Add some feature'`)
4. Push to the branch (`git push origin my-new-feature`)
5. Create new Pull Request

Thanks, and enjoy living in the ES6 future!
