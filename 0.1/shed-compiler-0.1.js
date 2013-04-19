global.$shed = global.$shed || {};
$shed.modules = $shed.modules || {};

(function() {
    var modules = {
    };
        
    $shed.exportModule = function(name, func) {
        var evaluate = function() {
            var value = func();
            modules[name].value = value;
            modules[name].evaluated = true;
            var parts = name.split(".");
            var current = $shed.modules;
            for (var i = 0; i < parts.length - 1; i += 1) {
                current[parts[i]] = current[parts[i]] || {};
                current = current[parts[i]];
            }
            current[parts[parts.length - 1]] = value;
        };
        modules[name] = {
            evaluate: evaluate,
            evaluated: false,
            value: null
        };
    };

    $shed.import = function(name) {
        var identifiers = name.$value.split(".");
        var moduleResult = findParentModule(identifiers);
        if (!moduleResult) {
            throw new Error("Could not find module: " + name.$value);
        }
        var module = moduleResult.module;
        if (!module.evaluated) {
            module.evaluate();
        }
        
        var value = module.value;
        for (var depth = moduleResult.depth; depth < identifiers.length; depth += 1) {
            if (!(identifiers[depth] in value)) {
                throw new Error("Could not find module: " + name.$value);
            }
            value = value[identifiers[depth]];
        }
        return value;
    };
    
    var findParentModule = function(identifiers) {
        for (var depth = identifiers.length; depth >= 1; depth -= 1) {
            var module = modules[identifiers.slice(0, depth).join(".")];
            if (module) {
                return {
                    module: module,
                    depth: depth
                };
            }
        }
        return null;
    };
    
    $shed.js = {
        import: function(name) {
            return $shed.import($shed.string(name));
        }
    };
})();
;

$shed.exportModule("time", function() {
    var _promises = $shed.js.import("promises");
    return {
        sleep: function(seconds) {
            var promise = _promises.createPromise();
            
            setTimeout(function() {
                promise.fulfill();
            }, seconds.$value * 1000);
            
            return promise;
        }
    };
});
;

$shed.exportModule("lists", function() {
    var options = $shed.js.import("options");
    var tuples = $shed.js.import("tuples");
    var _sequences = $shed.js.import("_sequences");
    
    var sequenceToList = function(sequence) {
        var result = [];
        while (!_sequences.isNil(sequence)) {
            result.push(sequence.head());
            sequence = sequence.tail();
        }
        return $shed.lists.createFromArray(result);
    };

    // Assumes all inputs are the same length
    var zip = function() {
        var lists = Array.prototype.map.call(arguments, function(list) {
            return list.$toJsArray();
        });
        var result = [];
        for (var listsIndex = 0; listsIndex < lists[0].length; listsIndex += 1) {
            result[listsIndex] = tuples.$createFromArray(lists.map(function(list) {
                return list[listsIndex];
            }));
        };
        return $shed.lists.createFromArray(result);
    };
    
    var concat = function(listOfLists) {
        var result = [];
        
        listOfLists.forEach(function(list) {
            list.forEach(function(value) {
                result.push(value);
            });
        });
        
        return $shed.lists.createFromArray(result);
    };
    
    return {
        sequenceToList: sequenceToList,
        zip: zip,
        concat: concat
    };
});
;

$shed.exportModule("regex", function() {
    var options = $shed.js.import("options");
    return {
        create: function(shedRegexString) {
            var RegexResult = function(jsResult) {
                return {
                    capture: function(index) {
                        return $shed.string(jsResult[index.$value]);
                    }
                };
            };
            
            var regex = new RegExp(shedRegexString.$value);
            return {
                test: function(shedString) {
                    return $shed.boolean(regex.test(shedString.$value));
                },
                exec: function(shedString) {
                    var result = regex.exec(shedString.$value);
                    if (result === null) {
                        return options.none;
                    } else {
                        return options.some(RegexResult(result));
                    };
                }
            };
        },
        escape: function(shedString) {
            return $shed.string(shedString.$value.replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1"));
        }
    };
});
;

$shed.exportModule("_hacks", function() {
    return {
        isSame: function(first, second) {
            return first === second;
        }
    };
});
;

$shed.exportModule("tuples", function() {
    var Tuple = $shed.class(function(values) {
        return new $tupleConstructor(values);
    }, "Tuple");
    
    function $tupleConstructor(values) {
        this.$values = values;
    }

    $tupleConstructor.prototype.$class = Tuple;
    $tupleConstructor.prototype.$usesThis = true;

    $tupleConstructor.prototype.equals = function(other) {
        if (classOf(other) !== Tuple) {
            return false;
        }
        if (this.$values.length !== other.$values.length) {
            return false;
        }
        for (var i = 0; i < this.$values.length; i += 1) {
            if (!equal(this.$values[i], other.$values[i])) {
                return false;
            }
        }
        return true;
    };

    $tupleConstructor.prototype.represent = function() {
        var valuesString = this.$values.map(function(value) {
            return represent(value).$value;
        }).join(", ");
        return $shed.string(
            "tuple(".concat(valuesString).concat(")")
        );
    };

    $tupleConstructor.prototype.append = function(value) {
        var newValues = this.$values.slice(0);
        newValues.push(value);
        return tuple.apply(this, newValues);
    };

    $tupleConstructor.prototype.appendDestructive = function(value) {
        this.$values.push(value);
        return this;
    };

    $tupleConstructor.prototype.map = function(func) {
        return func.apply(null, this.$values);
    };

    return {
        head: function(tuple) {
            return tuple.$values[0];
        },
        $createFromArray: function(array) {
            return tuple.apply(this, array);
        },
        Tuple: Tuple
    };
});
;

$shed.exportModule("_strings", function() {
    var lists = $shed.js.import("lists");
    return {
        joinSequence: function(separator, sequence) {
            var jsString = lists.sequenceToList(sequence)
                .$toJsArray()
                .map(function(shedString) {
                    return shedString.$value;
                })
                .join(separator.$value);
            return $shed.string(jsString);
        }
    };
});
;

$shed.exportModule("files", function() {
    var fs = require("fs");
    var path = require("path");
    var promises = $shed.js.import("promises");
    
    function readFile(filePath, encoding) {
        var promise = promises.createPromise();
        
        fs.readFile(filePath.$value, encoding.$value, function(err, contents) {
            promise.fulfill($shed.string(contents));
        });
        
        return promise;
    }
    
    function finder() {
        return new Finder({
            filters: []
        });
    }
    
    function Finder(options) {
        this.$options = options;
    }
    
    Finder.prototype.filesOnly = function() {
        return this;
    };
    
    Finder.prototype.root = function(root) {
        return this.roots(listOf(root));
    };
    
    Finder.prototype.roots = function(roots) {
        return new Finder({
            roots: roots,
            filters: this.$options.filters
        });
    }
    
    Finder.prototype.filterFiles = function() {
        return new FinderFileFilter(this);
    };
    
    Finder.prototype.find = function() {
        var filters = this.$options.filters;
        var promise = promises.createPromise();
        
        var result = [];
        var unexpanded = $shed.toJsArray(this.$options.roots).slice(0).map(function(path) {
            return path.$value;
        });
        
        function next() {
            if (unexpanded.length === 0) {
                promise.fulfill($lists.createFromArray(result.map($shed.string)));
            } else {
                expandNext();
            }
        }
        
        // TODO: handle err
        
        function expandNext() {
            var filePath = unexpanded.pop();
            fs.stat(filePath, function(err, stats) {
                if (stats.isFile() && matchesAllFilters(filePath)) {
                    result.push(filePath);
                    next();
                } else if (stats.isDirectory()) {
                    fs.readdir(filePath, function(err, files) {
                        files.forEach(function(file) {
                            unexpanded.push(path.join(filePath, file));
                        });
                        next();
                    });
                } else {
                    next();
                }
            });
        }
        
        function matchesAllFilters(path) {
            return filters.every(function(filter) {
                return filter(path);
            });
        }
        
        next();
        
        return promise;
    };
    
    function FinderFileFilter(finder) {
        this.$finder = finder;
    }
    
    FinderFileFilter.prototype.hasExtension = function(extension) {
        var filters = this.$finder.$options.filters.slice(0);
        filters.push(function(file) {
            return new RegExp("\\." + extension.$value + "$").test(file);
        });
        return new Finder({
            roots: this.$finder.$options.roots,
            filters: filters
        });
    };
    
    return {
        readFile: readFile,
        finder: finder
    };
});
;

$shed.exportModule("_json", function() {
    return {
        parseString: function(shedString) {
            return $shed.string(JSON.parse(shedString.$value));
        },
        stringifyString: function(shedString) {
            return $shed.string(JSON.stringify(shedString.$value));
        }
    };
});
;

$shed.exportModule("promises", function() {
    function constructPromise() {
        var waiters = [];
        
        var unfulfilledImpl = {
            map: function(func) {
                var promise = createPromise();
                waiters.push(function() {
                    var result = func.apply(null, arguments);
                    promise.fulfill(result);
                });
                return promise;
            },
            bind: function(func) {
                var promise = createPromise();
                waiters.push(function() {
                    var result = func.apply(null, arguments);
                    result.map(function(value) {
                        promise.fulfill(value);
                    });
                });
                return promise;
            },
            fulfill: fulfill
        };
        
        var impl = unfulfilledImpl;
        
        function fulfill() {
            var results = arguments;
            waiters.forEach(function(waiter) {
                waiter.apply(null, results);
            });
            
            impl = {
                map: function(func) {
                    return createFulfilledPromise(func.apply(null, results));
                },
                bind: function(func) {
                    return func.apply(null, results);
                }
            };
        }
        
        return {
            $class: Promise,
            map: function(func) {
                return impl.map(func);
            },
            bind: function(func) {
                return impl.bind(func);
            },
            fulfill: function() {
                return fulfill.apply(this, arguments);
            }
        };
    }
    
    var Promise = $shed.class(constructPromise, "Promise");
    var createPromise = Promise;
    function createFulfilledPromise() {
        var promise = createPromise();
        promise.fulfill.apply(promise, arguments);
        return promise;
    }
    
    function combineList(promises) {
        if (promises.length().$value === 0) {
            return createFulfilledPromise(emptyList);
        }
        
        var combinedPromise = createPromise();
        var values = [];
        
        var numberOfFulfilledPromises = 0;
        promises.forEach(function(promise, index) {
            promise.map(function(value) {
                numberOfFulfilledPromises += 1;
                values[index] = value;
                if (numberOfFulfilledPromises === promises.length().$value) {
                    combinedPromise.fulfill($shed.lists.createFromArray(values));
                }
            });
        });
        
        return combinedPromise;
    }
    
    return {
        createPromise: createPromise,
        createFulfilledPromise: createFulfilledPromise,
        isPromise: function(value) {
            return value.$class === Promise;
        },
        combineList: combineList
    };
});
;

$shed.exportModule("trampolining", function() {
    var options = $shed.js.import("options");
    var trampoline = function(func) {
        var next = nextFunction(func);
        
        while (next.$isTrampolineNextFunction) {
            next = next.func();
        }
        
        return next.value;
    };
    
    var nextFunction = function(func) {
        return {
            $isTrampolineNextFunction: true,
            func: func
        };
    };
    
    var stop = function(value) {
        return {
            value: value
        };
    };
    
    return {
        trampoline: trampoline,
        nextFunction: nextFunction,
        stop: stop
    };
});
;

$shed.exportModule("nodejs", function() {
    var util = require("util");
    var child_process = require("child_process");
    var _promises = $shed.js.import("promises");
    
    var command = util.format("node");
    
    function executeString(javaScript) {
        var promise = _promises.createPromise();
        
        var child = child_process.exec("node", {env: {}}, function(err, stdout, stderr) {
            promise.fulfill(createExecutionResult(err, stdout, stderr));
        });
        
        child.stdin.write(javaScript.$value);
        child.stdin.end();
        
        return promise;
    }
    
    function createExecutionResult(err, stdout, stderr) {
        return {
            isSuccess: function() {
                return !err;
            },
            stdout: function() {
                return $shed.string(stdout);
            },
            stderr: function() {
                return $shed.string(stderr);
            },
            exitCode: function() {
                return $shed.number(err.code);
            }
        };
    }
    
    return {
        executeString: executeString
    };
});
;

$shed.exportModule("lazySequences", function() {
    var sequences = $shed.js.import("sequences");
    var map = $shed.function(function(func, sequence) {
        return sequences.isNil(sequence) ? $shed.memberAccess(sequences, sequences.nil) : MappedCons(func, func(sequence.head()), sequence.tail());
    }).$define("map");
    var MappedCons = (function() {
        var $class = $shed.class(function(func, head, tail) {
            return {
                $class: $class,
                head: $shed.function(function() {
                    return head;
                }),
                tail: $shed.function(function() {
                    return map(func, tail);
                })
            };
        });
        return $class;
    })().$define("MappedCons");
    var filter = $shed.function(function(predicate, sequence) {
        return sequences.isNil(sequence) ? $shed.memberAccess(sequences, sequences.nil) : (predicate(sequence.head()) ? FilteredCons(predicate, sequence) : filter(predicate, sequence.tail()));
    }).$define("filter");
    var FilteredCons = (function() {
        var $class = $shed.class(function(predicate, sequence) {
            return {
                $class: $class,
                head: $shed.function(function() {
                    return sequence.head();
                }),
                tail: $shed.function(function() {
                    return filter(predicate, sequence.tail());
                })
            };
        });
        return $class;
    })().$define("FilteredCons");
    var concat = $shed.function(function(sequenceOfSequences) {
        return sequences.isNil(sequenceOfSequences) ? $shed.memberAccess(sequences, sequences.nil) : (function() {
            var headSequence = sequenceOfSequences.head();
            return sequences.isNil(headSequence) ? concat(sequenceOfSequences.tail()) : ConcatSequence(headSequence, sequenceOfSequences);
        })();
    }).$define("concat");
    var ConcatSequence = (function() {
        var $class = $shed.class(function(headSequence, sequenceOfSequences) {
            return {
                $class: $class,
                head: $shed.function(function() {
                    return headSequence.head();
                }),
                tail: $shed.function(function() {
                    return concat(sequence.cons(headSequence.tail(), sequenceOfSequences.tail()));
                })
            };
        });
        return $class;
    })().$define("ConcatSequence");
    return {
        map: map,
        filter: filter,
        concat: concat
    };
});;

$shed.exportModule("lazySequenceables", function() {
    var lazySequences = $shed.js.import("lazySequences");
    var Sequenceable = $shed.js.import("sequenceables.Sequenceable");
    var Sequence = $shed.js.import("sequences.Sequence");
    var map = $shed.function(function(func, sequenceable) {
        return (function() {
            var sequence = lazySequences.map(func, sequenceable.toSequence());
            return sequenceToSequenceable(sequence);
        })();
    }).$define("map");
    var filter = $shed.function(function(predicate, sequenceable) {
        return (function() {
            var sequence = lazySequences.filter(predicate, sequenceable.toSequence());
            return sequenceToSequenceable(sequence);
        })();
    }).$define("filter");
    var concat = $shed.function(function(sequenceableOfSequenceables) {
        return (function() {
            var sequenceOfSequences = toSequence(map(toSequence, sequenceableOfSequenceables));
            var sequence = lazySequences.concat(sequenceOfSequences);
            return sequenceToSequenceable(sequence);
        })();
    }).$define("concat");
    var sequenceToSequenceable = $shed.function(function(sequence) {
        return SequenceableFromSequence(sequence);
    }).$define("sequenceToSequenceable");
    var SequenceableFromSequence = (function() {
        var $class = $shed.class(function(sequence) {
            return {
                $class: $class,
                toSequence: $shed.function(function() {
                    return sequence;
                })
            };
        });
        return $class;
    })().$define("SequenceableFromSequence");
    var toSequence = $shed.function(function(sequenceable) {
        return sequenceable.toSequence();
    }).$define("toSequence");
    return {
        map: map,
        filter: filter,
        concat: concat
    };
});;

$shed.exportModule("json", function() {
    var _json = $shed.js.import("_json");
    var parseString = $shed.function(function(value) {
        return _json.parseString(value);
    }).$define("parseString");
    var stringifyString = $shed.function(function(value) {
        return _json.stringifyString(value);
    }).$define("stringifyString");
    return {
        parseString: parseString,
        stringifyString: stringifyString
    };
});;

$shed.exportModule("strings", function() {
    var _strings = $shed.js.import("_strings");
    var join = $shed.function(function(separator, sequenceable) {
        return joinSequence(separator, sequenceable.toSequence());
    }).$define("join");
    var joinSequence = $shed.memberAccess(_strings, _strings.joinSequence);
    return {
        join: join,
        joinSequence: joinSequence
    };
});;

$shed.exportModule("_sequences", function() {
    var _hacks = $shed.js.import("_hacks");
    var Nil = (function() {
        var $class = $shed.class(function() {
            return {
                $class: $class
            };
        });
        return $class;
    })().$define("Nil");
    var nil = Nil();
    var cons = $shed.function(function(head, tail) {
        return Cons(head, tail);
    }).$define("cons");
    var isNil = $shed.function(function(sequence) {
        return _hacks.isSame(sequence, nil);
    }).$define("isNil");
    var Cons = (function() {
        var $class = $shed.class(function(head, tail) {
            return {
                $class: $class,
                head: $shed.function(function() {
                    return head;
                }),
                tail: $shed.function(function() {
                    return tail;
                })
            };
        });
        return $class;
    })().$define("Cons");
    var Sequence = (function() {
        var $class = $shed.class(function() {
            return {
                $class: $class
            };
        });
        return $class;
    })().$define("Sequence");
    return {
        Nil: Nil,
        nil: nil,
        cons: cons,
        isNil: isNil,
        Sequence: Sequence
    };
});;

$shed.exportModule("sets", function() {
    var sequenceables = $shed.js.import("sequenceables");
    var fromList = $shed.function(function(list) {
        return ListSet(list);
    }).$define("fromList");
    var ListSet = (function() {
        var $class = $shed.class(function(list) {
            var contains = $shed.function(function(value) {
                return sequenceables.any($shed.function(function(element) {
                    return value.equals(element);
                }), list);
            }).$define("contains");
            var toSequence = $shed.function(function() {
                return list.toSequence();
            }).$define("toSequence");
            return {
                $class: $class,
                contains: contains,
                toSequence: toSequence
            };
        });
        return $class;
    })().$define("ListSet");
    var emptySet = fromList(listOf());
    return {
        fromList: fromList,
        emptySet: emptySet
    };
});;

$shed.exportModule("sequences", function() {
    var _sequences = $shed.js.import("_sequences");
    var options = $shed.js.import("options");
    var trampolining = $shed.js.import("trampolining");
    var lists = $shed.js.import("lists");
    var Sequence = $shed.memberAccess(_sequences, _sequences.Sequence);
    var nil = $shed.memberAccess(_sequences, _sequences.nil);
    var isNil = $shed.memberAccess(_sequences, _sequences.isNil);
    var cons = $shed.memberAccess(_sequences, _sequences.cons);
    var head = $shed.function(function(sequence) {
        return isNil(sequence) ? $shed.memberAccess(options, options.none) : options.some(sequence.head());
    }).$define("head");
    var any = $shed.function(function(predicate, sequence) {
        return trampolining.trampoline($shed.function(function() {
            return anyTrampolined(predicate, sequence);
        }));
    }).$define("any");
    var anyTrampolined = $shed.function(function(predicate, sequence) {
        return isNil(sequence) ? trampolining.stop(false) : (predicate(sequence.head()) ? trampolining.stop(true) : trampolining.nextFunction($shed.function(function() {
            return anyTrampolined(predicate, sequence.tail());
        })));
    }).$define("anyTrampolined");
    var all = $shed.function(function(predicate, sequence) {
        return trampolining.trampoline($shed.function(function() {
            return allTrampolined(predicate, sequence);
        }));
    }).$define("all");
    var allTrampolined = $shed.function(function(predicate, sequence) {
        return isNil(sequence) ? trampolining.stop(true) : (predicate(sequence.head()) ? trampolining.nextFunction($shed.function(function() {
            return allTrampolined(predicate, sequence.tail());
        })) : trampolining.stop(false));
    }).$define("allTrampolined");
    var lazyCons = (function() {
        var $class = $shed.class(function(myHead, deferredTail) {
            return {
                $class: $class,
                head: $shed.function(function() {
                    return myHead;
                }),
                tail: deferredTail
            };
        });
        return $class;
    })().$define("lazyCons");
    var forEach = $shed.function(function(func, sequence) {
        return trampolining.trampoline($shed.function(function() {
            return forEachTrampolined(func, sequence);
        }));
    }).$define("forEach");
    var forEachTrampolined = $shed.function(function(func, sequence) {
        return isNil(sequence) ? (function() {
            return trampolining.stop($shed.unit);
        })() : (function() {
            func(sequence.head());
            return trampolining.nextFunction($shed.function(function() {
                return forEachTrampolined(func, sequence.tail());
            }));
        })();
    }).$define("forEachTrampolined");
    var singleton = (function() {
        var $class = $shed.class(function(value) {
            return {
                $class: $class,
                head: $shed.function(function() {
                    return value;
                }),
                tail: $shed.function(function() {
                    return nil;
                })
            };
        });
        return $class;
    })().$define("singleton");
    var reversed = $shed.function(function(sequence) {
        return reversed2(nil, sequence);
    }).$define("reversed");
    var reversed2 = $shed.function(function(alreadyReversed, toReverse) {
        return isNil(toReverse) ? alreadyReversed : reversed2(cons(toReverse.head(), alreadyReversed), toReverse.tail());
    }).$define("reversed2");
    var filter = $shed.function(function(predicate, sequence) {
        return lists.sequenceToList(sequence).filter(predicate).toSequence();
    }).$define("filter");
    return {
        Sequence: Sequence,
        nil: nil,
        isNil: isNil,
        cons: cons,
        head: head,
        any: any,
        all: all,
        lazyCons: lazyCons,
        forEach: forEach,
        singleton: singleton,
        reversed: reversed,
        filter: filter
    };
});;

$shed.exportModule("options", function() {
    var _sequences = $shed.js.import("_sequences");
    var none = (function() {
        var $class = $shed.class(function() {
            return {
                $class: $class,
                map: $shed.function(function(func) {
                    return none;
                }),
                orElse: $shed.function(function(func) {
                    return func();
                }),
                valueOrElse: $shed.function(function(func) {
                    return func();
                }),
                toSequence: $shed.function(function() {
                    return $shed.memberAccess(_sequences, _sequences.nil);
                }),
                equals: $shed.function(function(other) {
                    return other.map($shed.function(function() {
                        return false;
                    })).valueOrElse($shed.function(function() {
                        return true;
                    }));
                })
            };
        });
        return $class;
    })()();
    var some = (function() {
        var $class = $shed.class(function(value) {
            return {
                $class: $class,
                map: $shed.function(function(func) {
                    return some(func(value));
                }),
                orElse: $shed.function(function(func) {
                    return some(value);
                }),
                valueOrElse: $shed.function(function(func) {
                    return value;
                }),
                toSequence: $shed.function(function() {
                    return _sequences.cons(value, $shed.memberAccess(_sequences, _sequences.nil));
                }),
                equals: $shed.function(function(other) {
                    return $shed.function(function(x) {
                        return other.map($shed.function(function(otherValue) {
                            return equal(x, otherValue);
                        })).valueOrElse($shed.function(function() {
                            return false;
                        }));
                    })(value);
                })
            };
        });
        return $class;
    })().$define("some");
    return {
        none: none,
        some: some
    };
});;

$shed.exportModule("structs", function() {
    var lists = $shed.js.import("lists");
    var sequenceables = $shed.js.import("sequenceables");
    var lazySequenceables = $shed.js.import("lazySequenceables");
    var strings = $shed.js.import("strings");
    var Struct = (function() {
        var $class = $shed.class(function(type, fields) {
            var representation = $shed.function(function() {
                return type.identifier().concat($shed.string("(")).concat(strings.join($shed.string(", "), lazySequenceables.map(represent, fields))).concat($shed.string(")"));
            }).$define("representation");
            var equals = $shed.function(function(other) {
                return equal(type, other.type()) ? equalList(fields, other.fields()) : false;
            }).$define("equals");
            var equalList = $shed.function(function(first, second) {
                return not(equal(first.length(), second.length())) ? false : sequenceables.all(pack(equal), lists.zip(first, second));
            }).$define("equalList");
            return {
                $class: $class,
                type: $shed.function(function() {
                    return type;
                }),
                fields: $shed.function(function() {
                    return fields;
                }),
                represent: representation,
                equals: equals
            };
        });
        return $class;
    })().$define("Struct");
    return {
        create: Struct
    };
});;

$shed.exportModule("sequenceables", function() {
    var sequences = $shed.js.import("sequences");
    var head = $shed.function(function(sequenceable) {
        return sequences.head(sequenceable.toSequence());
    }).$define("head");
    var any = $shed.function(function(predicate, sequenceable) {
        return sequences.any(predicate, sequenceable.toSequence());
    }).$define("any");
    var all = $shed.function(function(predicate, sequenceable) {
        return sequences.all(predicate, sequenceable.toSequence());
    }).$define("all");
    var Sequenceable = (function() {
        var $class = $shed.class(function() {
            return {
                $class: $class
            };
        });
        return $class;
    })().$define("Sequenceable");
    return {
        head: head,
        any: any,
        all: all,
        Sequenceable: Sequenceable
    };
});;

$shed.exportModule("values", function() {
    var sequenceables = $shed.js.import("sequenceables");
    var AsValue = (function() {
        var $class = $shed.class(function(value, type, attributes) {
            var equals = $shed.function(function(other) {
                return sequenceables.all($shed.function(function(attribute) {
                    return attribute.get(value).equals(attribute.get(other));
                }), attributes);
            }).$define("equals");
            return {
                $class: $class,
                equals: equals
            };
        });
        return $class;
    })().$define("AsValue");
    var Attribute = (function() {
        var $class = $shed.class(function(name, get) {
            return {
                $class: $class,
                name: $shed.function(function() {
                    return name;
                }),
                get: $shed.function(function(value) {
                    return get(value);
                })
            };
        });
        return $class;
    })().$define("Attribute");
    return {
        asValue: AsValue,
        attribute: Attribute
    };
});;

var dummyType = {
};

var matchClass = function(clazz, func) {
    return {
        matches: function(value) {
            return $shed.boolean(classOf(value).equals(clazz));
        },
        apply: func
    };
};

var matchDefault = function(func) {
    return {
        matches: function(value) {
            return $shed.boolean(true);
        },
        apply: func
    };
};

var match = function(value) {
    var cases = Array.prototype.slice.call(arguments, 1);
    for (var i = 0; i < cases.length; i += 1) {
        if (cases[i].matches(value)) {
            return cases[i].apply(value);
        }
    }
    throw new Error("no case found for match, value was: " + represent(value).$value);
};

(function() {
    $shed.isJsFunction = function(functionToCheck) {
        var getType = {};
        return functionToCheck && getType.toString.call(functionToCheck) === "[object Function]";
    }

    $shed.memberAccess = function(obj, member) {
        if (obj.$usesThis && $shed.isJsFunction(member)) {
            return member.bind(obj);
        } else {
            return member;
        }
    };
    
    Function.prototype.$define = function(name) {
        return this;
    };
    
    $shed.function = function(func) {
        return func;
    };
    
    var shedClassPrototype = {
        $usesThis: true,
        equals: function(other) {
            return this === other;
        },
        _jsName: function() {
            return this.$className ? this.$className : "$Anonymous";
        },
        represent: function() {
            return $shed.string("Class<" + this._jsName() + ">");
        },
        identifier: function() {
            return $shed.string(this._jsName());
        },
        $define: function(name) {
            return $shed.class(this, name);
        }
    };
    shedClassPrototype.__proto__ = Function.prototype;
    
    $shed.class = function(constructor, name) {
        constructor.$className = name;
        constructor.__proto__ = shedClassPrototype;
        return constructor;
    };
    
    $shed.Unit = $shed.class(function() { }, "Unit");
    $shed.unit = {$class: $shed.Unit};
    $shed.Boolean = {$class: $shed.class(function() { }, "Boolean")};
    
    $shed.Function = $shed.class(function() { }, "Function");
    
    var number = $shed.number = $shed.class(function(value) {
        return new Double(value);
    }, "Double");
    
    function Double(value) {
        this.$value = value;
    }
    
    Double.prototype.$usesThis = true;
    Double.prototype.$class = $shed.number;
    
    Double.prototype.equals = function(other) {
        return boolean(this.$value === other.$value);
    };
    
    Double.prototype.lessThan = function(other) {
        return boolean(this.$value < other.$value);
    };
    
    Double.prototype.lessThanOrEqual = function(other) {
        return boolean(this.$value <= other.$value);
    };
    
    Double.prototype.greaterThan = function(other) {
        return boolean(this.$value > other.$value);
    };
    
    Double.prototype.subtract = function(other) {
        return number(this.$value - other.$value);
    };
    
    Double.prototype.add = function(other) {
        return number(this.$value + other.$value);
    };
    
    Double.prototype.toString = function() {
        return string(this.$value.toString());
    };
    
    var string = $shed.string = $shed.class(function(value) {
        return new String(value);
    }, "String");
    
    function String(value) {
        this.$value = value;
    }
    
    String.prototype.$usesThis = true;
    String.prototype.$class = $shed.string;
    
    String.prototype.concat = function(other) {
        return string(this.$value + other.$value);
    };
    String.prototype.equals = function(other) {
        return this.$value === other.$value;
    };
    String.prototype.length = function(other) {
        return number(this.$value.length);
    };
    String.prototype.sliceFrom = function(index) {
        return string(this.$value.slice(index.$value));
    };
    String.prototype.substring = function(startIndex, endIndex) {
        return string(this.$value.substring(startIndex.$value, endIndex.$value));
    };
    String.prototype.replace = function(oldString, newString) {
        // TODO: remove duplication (also in regex.js)
        function escapeRegex(string) {
            return string.replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1");
        }
        
        var regex = new RegExp(escapeRegex(oldString.$value), "g");
        return string(this.$value.replace(regex, newString.$value));
    };
    String.prototype.toString = function() {
        return this;
    };
    String.prototype.represent = function() {
        return string(JSON.stringify(this.$value));
    };
    
    var boolean = $shed.boolean = function(value) {
        return value;
    };
    
    function ImmutableArrayList(values) {
        this.$values = values;
    }
    
    ImmutableArrayList.prototype.$usesThis = true;
    ImmutableArrayList.prototype.$class = ImmutableArrayList;
    
    ImmutableArrayList.prototype.forEach = function(func) {
        return this.$values.forEach(func);
    };
    
    ImmutableArrayList.prototype.map = function(func) {
        return new ImmutableArrayList(this.$values.map(func));
    };
    
    ImmutableArrayList.prototype.filter = function(predicate) {
        return new ImmutableArrayList(this.$values.filter(predicate));
    };
    
    ImmutableArrayList.prototype.foldLeft = function(initialValue, func) {
        return this.$values.reduce(func, initialValue);
    };
    
    ImmutableArrayList.prototype.isEmpty = function() {
        return this.$values.length === 0;
    };
    
    ImmutableArrayList.prototype.length = function() {
        return number(this.$values.length);
    };
    
    ImmutableArrayList.prototype.head = function() {
        // TODO: should return an option
        return this.$values[0];
    };
    
    ImmutableArrayList.prototype.last = function() {
        // TODO: should return an option
        return this.$values[this.$values.length - 1];
    };
    
    ImmutableArrayList.prototype.append = function(value) {
        return new ImmutableArrayList(this.$values.concat([value]));
    };
    
    ImmutableArrayList.prototype.concat = function(other) {
        return new ImmutableArrayList(this.$values.concat(other.$toJsArray()));
    };
    
    ImmutableArrayList.prototype.$toJsArray = function() {
        return this.$values;
    };
    
    ImmutableArrayList.prototype.toSequence = function() {
        // HACK: should really define ImmutableArrayList later to avoid this late import
        var sequences = $shed.js.import("sequences");
        var values = this.$values;
        
        var sequence = function(index) {
            if (values.length === index) {
                return sequences.nil;
            } else {
                return sequences.lazyCons(
                    values[index],
                    function() {
                        return sequence(index + 1);
                    }
                );
            }
        };
        
        return sequence(0);
    };
    
    ImmutableArrayList.prototype.represent = function() {
        var toJsString = function(value) {
            return value.$value;
        };
        var elements = this.$values.map(represent).map(toJsString).join(", ");
        return $shed.string("ImmutableArrayList([" + elements + "])");
    };
    
    ImmutableArrayList.prototype.equals = function(other) {
        var otherArray = other.$toJsArray();
        if (this.$values.length !== otherArray.length) {
            return false;
        } else {
            for (var i = 0; i < this.$values.length; i += 1) {
                if (!equal(this.$values[i], otherArray[i])) {
                    return false;
                }
            }
            return true;
        }
    };
    
    $shed.lists = {
        create: function() {
            return new ImmutableArrayList(Array.prototype.slice.call(arguments, 0));
        },
        createFromArray: function(array) {
            return new ImmutableArrayList(array);
        }
    };
    
    $shed.toJsArray = function(value) {
        if (value.$toJsArray) {
            return value.$toJsArray();
        }
        throw new Error(
            "Could not convert value to JavaScript array: " + 
                represent(value).$value
        )
    };
})();

var classOf = function(value) {
    if (value.$class) {
        return value.$class;
    } else if ($shed.isJsFunction(value)) {
        return $shed.Function;
    } else if ($isBoolean(value)) {
        return $shed.Boolean;
    } else {
        throw new Error("Could not determine class of value: " + (value.toString().$value || value.toString()));
    }

};

var $import = $shed.import;
var $lists = $shed.lists;

var print = function(string) {
    process.stdout.write(string.$value);
};

var runtimeImport = $import;
var listOf = $shed.lists.create;
var String = $shed.string;
var Unit = $shed.Unit;
var not = function(value) {
    return !value;
};
var and = function() {
    return Array.prototype.slice.call(arguments, 0).every(function(value) {
        return !!value;
    });
};
var or = function() {
    return Array.prototype.slice.call(arguments, 0).some(function(value) {
        return !!value;
    });
};

// TODO: should detect whether or not an object has an appropriate
// representation more safely
var represent = function(value) {
    if (value.represent) {
        return value.represent();
    } else if (value.struct) {
        return represent(value.struct());
    } else if ($isBoolean(value)) {
        return $shed.string(value ? "true" : "false");
    } else {
        return $shed.string("<" + represent(classOf(value)).$value + " without represent>");
    }
};

var Nothing = dummyType;
var emptyList = listOf();
var Func = function() {
    return dummyType;
};
var List = function() {
    return dummyType;
};

var tuple = (function() {
    var Tuple = $shed.js.import("tuples.Tuple");
    
    function tuple() {
        var values = Array.prototype.slice.call(arguments, 0);
        return Tuple(values);
    }
    
    return tuple;
})();

var tupleFromSequence = function(sequence) {
    var values = [];
    while (sequence.head) {
        values.push(sequence.head());
        sequence = sequence.tail();
    }
    return tuple.apply(null, values);
};

var pack = function(func) {
    return function(tuple) {
        return func.apply(this, tuple.$values);
    };
};

var listRange = function(from, to) {
    var result = [];
    for (var i = from.$value; i < to.$value; i += 1) {
        result.push($shed.number(i));
    }
    return $shed.lists.createFromArray(result);
};

var equal = function(first, second) {
    if (first.equals) {
        return first.equals(second);
    } else if (first.struct && second.struct) {
        return equal(first.struct(), second.struct());
    } else if ($isBoolean(first) && $isBoolean(second)) {
        return first === second;
    } else {
        throw new Error("arguments are not equalable");
    }
};

var $isBoolean = function(value) {
    return value === true || value === false;
};

var lazyFunction = function(func) {
    var impl = function() {
        impl = func();
        return impl.apply(this, arguments);
    };
    return function() {
        return impl.apply(this, arguments);
    };
};

var range = function(from, to) {
    return {
        foldLeft: function(initialValue, func) {
            from = from.$value;
            to = to.$value;
            var result = initialValue;
            for (var i = from; i < to; i++) {
                result = func(result, i);
            }
            return result;
        }
    };
};
;

$shed.exportModule("shed.compiler.compilation", function() {
    var files = $shed.js.import("files");
    var promises = $shed.js.import("promises");
    var strings = $shed.js.import("strings");
    var lists = $shed.js.import("lists");
    var sequenceables = $shed.js.import("sequenceables");
    var createStringSource = $shed.js.import("lop.strings.createStringSource");
    var moduleCompilation = $shed.js.import("shed.compiler.moduleCompilation");
    var main = $shed.function(function(argv) {
        return (function() {
            var pathRoots = argv.filter($shed.function(function(arg) {
                return not(arg.substring($shed.number(0), $shed.number(2)).equals($shed.string("--")));
            }));
            var shedFilePaths = findShedFiles(pathRoots);
            var shedParts = shedFilePaths.bind(compileShedFiles).map(joinJavaScriptUnits);
            var runtime = compileRuntime();
            var programParts = promises.combineList(listOf(runtime, shedParts));
            var mainFunction = sequenceables.head(argv.filter($shed.function(function(arg) {
                return arg.substring($shed.number(0), $shed.number(7)).equals($shed.string("--main="));
            })).map($shed.function(function(arg) {
                return arg.sliceFrom($shed.number(7));
            })));
            return programParts.map(joinJavaScriptUnits).map($shed.function(function(program) {
                return (function() {
                    print(program);
                    mainFunction.map($shed.function(function(mainFunction) {
                        return (function() {
                            print($shed.string("\n\n$shed.js.import(\"").concat(mainFunction).concat($shed.string("\")")));
                            print($shed.string("($shed.lists.createFromArray(process.argv.slice(2).map($shed.string)));"));
                        })();
                    }));
                })();
            }));
        })();
    }).$define("main");
    var compileString = $shed.function(function(input) {
        return (function() {
            var source = createStringSource(input, $shed.string("raw string"));
            return compileRuntime().map($shed.function(function(runtime) {
                return runtime.concat($shed.string(";\n\n")).concat(moduleCompilation.compileSourceToString(source));
            }));
        })();
    }).$define("compileString");
    var compileRuntime = $shed.function(function() {
        return (function() {
            var jsFilePaths = files.finder().filesOnly().root($shed.string("runtime/js")).filterFiles().hasExtension($shed.string("js")).find();
            var shedFilePaths = findShedFiles(listOf($shed.string("runtime/stdlib")));
            var bootstrapPart = readUtf8File($shed.string("runtime/bootstrap.js"));
            var jsParts = jsFilePaths.bind(readFiles);
            var shedParts = shedFilePaths.bind(compileShedFiles);
            var preludePart = readUtf8File($shed.string("runtime/prelude.js"));
            var allParts = promises.combineList(listOf(bootstrapPart.map(listOf), jsParts, shedParts, preludePart.map(listOf))).map($shed.memberAccess(lists, lists.concat));
            return allParts.map(joinJavaScriptUnits);
        })();
    }).$define("compileRuntime");
    var findShedFiles = $shed.function(function(roots) {
        return files.finder().filesOnly().roots(roots).filterFiles().hasExtension($shed.string("shed")).find();
    }).$define("findShedFiles");
    var readFiles = $shed.function(function(paths) {
        return promises.combineList(paths.map(readUtf8File));
    }).$define("readFiles");
    var compileShedFiles = $shed.function(function(paths) {
        return promises.combineList(paths.map(compileShedFile));
    }).$define("compileShedFiles");
    var compileShedFile = $shed.function(function(path) {
        return readUtf8File(path).map($shed.function(function(contents) {
            return (function() {
                var source = createStringSource(contents, $shed.string("File: ").concat(path));
                return moduleCompilation.compileSourceToString(source);
            })();
        }));
    }).$define("compileShedFile");
    var readUtf8File = $shed.function(function(path) {
        return files.readFile(path, $shed.string("utf8"));
    }).$define("readUtf8File");
    var joinJavaScriptUnits = $shed.function(function(units) {
        return strings.join($shed.string(";\n\n"), units);
    }).$define("joinJavaScriptUnits");
    return {
        compileString: compileString,
        main: main
    };
});;

$shed.exportModule("shed.compiler.codeGeneration.microJavaScript", function() {
    var strings = $shed.js.import("strings");
    var lists = $shed.js.import("lists");
    var sequences = $shed.js.import("sequences");
    var lazySequences = $shed.js.import("lazySequences");
    var nodes = $shed.js.import("shed.compiler.nodes");
    var js = $shed.js.import("shed.compiler.javaScript.js");
    var shed = nodes;
    var generate = $shed.function(function(node) {
        return Generator(generate).generate(node);
    }).$define("generate");
    var Generator = (function() {
        var $class = $shed.class(function(generate) {
            var shedGlobal = js.ref($shed.string("$shed"));
            var generatorGenerate = $shed.function(function(node) {
                return match(node, matchClass($shed.memberAccess(shed, shed.UnitNode), unit), matchClass($shed.memberAccess(shed, shed.BooleanNode), bool), matchClass($shed.memberAccess(shed, shed.NumberNode), number), matchClass($shed.memberAccess(shed, shed.StringNode), string), matchClass($shed.memberAccess(shed, shed.VariableReferenceNode), variableReference), matchClass($shed.memberAccess(shed, shed.IfThenElseNode), ifThenElse), matchClass($shed.memberAccess(shed, shed.CallNode), call), matchClass($shed.memberAccess(shed, shed.TypeApplicationNode), typeApplication), matchClass($shed.memberAccess(shed, shed.MemberAccessNode), memberAccess), matchClass($shed.memberAccess(shed, shed.FunctionNode), func), matchClass($shed.memberAccess(shed, shed.ClassNode), classDeclaration), matchClass($shed.memberAccess(shed, shed.ObjectNode), obj), matchClass($shed.memberAccess(shed, shed.DoBlockNode), doBlock), matchClass($shed.memberAccess(shed, shed.LetInNode), letIn), matchClass($shed.memberAccess(shed, shed.AndNode), and), matchClass($shed.memberAccess(shed, shed.ExpressionStatementNode), expressionStatement), matchClass($shed.memberAccess(shed, shed.ReturnStatementNode), returnStatement), matchClass($shed.memberAccess(shed, shed.ValDeclarationNode), valDeclaration), matchClass($shed.memberAccess(shed, shed.DefinitionNode), definition), matchClass($shed.memberAccess(shed, shed.ImportNode), importNode), matchClass($shed.memberAccess(shed, shed.ModuleNode), moduleNode));
            }).$define("generatorGenerate");
            var unit = $shed.function(function(unit) {
                return js.propertyAccess(shedGlobal, $shed.string("unit"));
            }).$define("unit");
            var bool = $shed.function(function(bool) {
                return js.bool(bool.value());
            }).$define("bool");
            var number = $shed.function(function(number) {
                return js.call(js.propertyAccess(shedGlobal, $shed.string("number")), listOf(js.number(number.value())));
            }).$define("number");
            var string = $shed.function(function(string) {
                return js.call(js.propertyAccess(shedGlobal, $shed.string("string")), listOf(js.string(string.value())));
            }).$define("string");
            var variableReference = $shed.function(function(variableReference) {
                return js.ref(variableReference.identifier());
            }).$define("variableReference");
            var ifThenElse = $shed.function(function(ifThenElse) {
                return js.conditional(generate(ifThenElse.condition()), generate(ifThenElse.trueValue()), generate(ifThenElse.falseValue()));
            }).$define("ifThenElse");
            var call = $shed.function(function(call) {
                return js.call(classOf(call.callee()).equals($shed.memberAccess(nodes, nodes.MemberAccessNode)) ? js.propertyAccess(generate(call.callee().left()), call.callee().memberName()) : generate(call.callee()), call.args().map(generate));
            }).$define("call");
            var typeApplication = $shed.function(function(typeApplication) {
                return generate(typeApplication.callee());
            }).$define("typeApplication");
            var memberAccess = $shed.function(function(memberAccess) {
                return js.call(js.propertyAccess(js.ref($shed.string("$shed")), $shed.string("memberAccess")), listOf(generate(memberAccess.left()), js.propertyAccess(generate(memberAccess.left()), memberAccess.memberName())));
            }).$define("memberAccess");
            var func = $shed.function(function(func) {
                return js.call(js.propertyAccess(shedGlobal, $shed.string("function")), listOf(js.func(generateFormalArgs(func.formalArgs()), listOf(js.ret(generate(func.body()))))));
            }).$define("func");
            var classDeclaration = $shed.function(function(classDeclaration) {
                return js.call(js.func(emptyList, listOf(js.varDeclaration($shed.string("$class"), js.call(js.propertyAccess(shedGlobal, $shed.string("class")), listOf(js.func(generateFormalArgs(classDeclaration.formalArgs()), generateObjectBody(classDeclaration.body()))))), js.ret(js.ref($shed.string("$class"))))), emptyList);
            }).$define("classDeclaration");
            var obj = $shed.function(function(obj) {
                return js.call(generate(shed.classDeclaration(emptyList, obj)), emptyList);
            }).$define("obj");
            var doBlock = $shed.function(function(doBlock) {
                return js.call(js.func(emptyList, doBlock.statements().map(generate)), emptyList);
            }).$define("doBlock");
            var letIn = $shed.function(function(letIn) {
                return (function() {
                    var jsDeclarations = letIn.declarations().map(generate);
                    var jsExpression = generate(letIn.expression());
                    return js.call(js.func(emptyList, jsDeclarations.concat(listOf(js.ret(jsExpression)))), emptyList);
                })();
            }).$define("letIn");
            var and = $shed.function(function(andNode) {
                return js.and(generate(andNode.left()), generate(andNode.right()));
            }).$define("and");
            var expressionStatement = $shed.function(function(expressionStatement) {
                return js.expressionStatement(generate(expressionStatement.expression()));
            }).$define("expressionStatement");
            var returnStatement = $shed.function(function(returnStatement) {
                return js.ret(generate(returnStatement.value()));
            }).$define("returnStatement");
            var valDeclaration = $shed.function(function(valDeclaration) {
                return js.varDeclaration(valDeclaration.name(), generate(valDeclaration.value()));
            }).$define("valDeclaration");
            var definition = $shed.function(function(definition) {
                return js.varDeclaration(definition.name(), js.call(js.propertyAccess(generate(definition.value()), $shed.string("$define")), listOf(js.string(definition.name()))));
            }).$define("definition");
            var importNode = $shed.function(function(importNode) {
                return js.varDeclaration(importNode.moduleName().last(), js.call(js.propertyAccess(js.propertyAccess(js.ref($shed.string("$shed")), $shed.string("js")), $shed.string("import")), listOf(js.string(strings.join($shed.string("."), importNode.moduleName())))));
            }).$define("importNode");
            var moduleNode = $shed.function(function(moduleNode) {
                return moduleNode.name().map($shed.function(function(name) {
                    return generateNamedModule(name, moduleNode);
                })).valueOrElse($shed.function(function() {
                    return generateUnnamedModule(moduleNode);
                }));
            }).$define("moduleNode");
            var generateFormalArgs = $shed.function(function(formalArgs) {
                return formalArgs.map($shed.function(function(arg) {
                    return arg.name();
                }));
            }).$define("generateFormalArgs");
            var generateObjectBody = $shed.function(function(body) {
                return body.statements().map(generate).concat(listOf(js.ret(generateMembersObject(body.memberDeclarations()))));
            }).$define("generateObjectBody");
            var generateMembersObject = $shed.function(function(membersDeclaration) {
                return js.obj(lists.sequenceToList(sequences.cons(tuple($shed.string("$class"), js.ref($shed.string("$class"))), generateMembers(membersDeclaration))));
            }).$define("generateMembersObject");
            var generateMembers = $shed.function(function(membersDeclaration) {
                return lazySequences.map($shed.function(function(memberDeclaration) {
                    return tuple(memberDeclaration.name(), generate(memberDeclaration.value()));
                }), membersDeclaration.toSequence());
            }).$define("generateMembers");
            var generateNamedModule = $shed.function(function(name, moduleNode) {
                return (function() {
                    var membersObject = js.obj(lists.sequenceToList(generateMembers(moduleNode.memberDeclarations())));
                    return js.expressionStatement(js.call(js.propertyAccess(shedGlobal, $shed.string("exportModule")), listOf(js.string(strings.join($shed.string("."), name)), js.func(emptyList, moduleNode.statements().map(generate).concat(listOf(js.ret(membersObject)))))));
                })();
            }).$define("generateNamedModule");
            var generateUnnamedModule = $shed.function(function(moduleNode) {
                return js.call(js.func(emptyList, moduleNode.statements().map(generate)), emptyList);
            }).$define("generateUnnamedModule");
            return {
                $class: $class,
                generate: generatorGenerate
            };
        });
        return $class;
    })().$define("Generator");
    return {
        generate: generate,
        Generator: Generator
    };
});;

$shed.exportModule("shed.compiler.tokenising.tokens", function() {
    var Token = $shed.js.import("lop.token.Token");
    var end = $shed.function(function(source) {
        return Token($shed.string("end"), $shed.string(""), source);
    }).$define("end");
    var identifier = $shed.function(function(value, source) {
        return Token($shed.string("identifier"), value, source);
    }).$define("identifier");
    var keyword = $shed.function(function(value, source) {
        return Token($shed.string("keyword"), value, source);
    }).$define("keyword");
    var whitespace = $shed.function(function(value, source) {
        return Token($shed.string("whitespace"), value, source);
    }).$define("whitespace");
    var symbol = $shed.function(function(value, source) {
        return Token($shed.string("symbol"), value, source);
    }).$define("symbol");
    var string = $shed.function(function(value, source) {
        return Token($shed.string("string"), value, source);
    }).$define("string");
    var number = $shed.function(function(value, source) {
        return Token($shed.string("number"), value, source);
    }).$define("number");
    var comment = $shed.function(function(value, source) {
        return Token($shed.string("comment"), value, source);
    }).$define("comment");
    return {
        end: end,
        identifier: identifier,
        keyword: keyword,
        whitespace: whitespace,
        symbol: symbol,
        string: string,
        number: number,
        comment: comment
    };
});;

$shed.exportModule("shed.compiler.tokenising.tokeniser", function() {
    var json = $shed.js.import("json");
    var regex = $shed.js.import("regex");
    var none = $shed.js.import("options.none");
    var some = $shed.js.import("options.some");
    var sequences = $shed.js.import("sequences");
    var map = $shed.js.import("lazySequenceables.map");
    var sequenceToList = $shed.js.import("lists.sequenceToList");
    var sets = $shed.js.import("sets");
    var strings = $shed.js.import("strings");
    var tokens = $shed.js.import("shed.compiler.tokenising.tokens");
    var Token = $shed.js.import("lop.token.Token");
    var StringSource = $shed.js.import("lop.sources.StringSource");
    var Tokeniser = (function() {
        var $class = $shed.class(function() {
            var keywords = sets.fromList(listOf($shed.string("true"), $shed.string("false"), $shed.string("return"), $shed.string("package"), $shed.string("import"), $shed.string("val"), $shed.string("var"), $shed.string("public"), $shed.string("object"), $shed.string("class"), $shed.string("interface"), $shed.string("if"), $shed.string("else"), $shed.string("while"), $shed.string("fun"), $shed.string("for"), $shed.string("def"), $shed.string("then"), $shed.string("do"), $shed.string("members"), $shed.string("module"), $shed.string("let"), $shed.string("in")));
            var symbols = sets.fromList(listOf($shed.string("=>"), $shed.string("->"), $shed.string("<:"), $shed.string("&&"), $shed.string("`"), $shed.string("¬"), $shed.string("!"), $shed.string("£"), $shed.string("$"), $shed.string("%"), $shed.string("^"), $shed.string("&"), $shed.string("*"), $shed.string("("), $shed.string(")"), $shed.string("-"), $shed.string("="), $shed.string("+"), $shed.string("["), $shed.string("]"), $shed.string("{"), $shed.string("}"), $shed.string(";"), $shed.string(":"), $shed.string("'"), $shed.string("@"), $shed.string("#"), $shed.string("~"), $shed.string("<"), $shed.string(">"), $shed.string(","), $shed.string("."), $shed.string("/"), $shed.string("?"), $shed.string("\\"), $shed.string("|")));
            var tokenise = $shed.function(function(input) {
                return sequenceToList(tokeniseString(input));
            }).$define("tokenise");
            var tokeniseString = $shed.function(function(input) {
                return (function() {
                    var length = input.asString().length();
                    return length.greaterThan($shed.number(0)) ? (function() {
                        var nextToken = readNextToken(input);
                        return sequences.lazyCons(nextToken.token(), $shed.function(function() {
                            return tokeniseString(nextToken.rest());
                        }));
                    })() : sequences.singleton(tokens.end(input.range($shed.number(0), $shed.number(0))));
                })();
            }).$define("tokeniseString");
            var readNextToken = $shed.function(function(input) {
                return listOf(readLineComment, readWhitespace, readString, readSymbol, readNumber, readIdentifier).foldLeft(none, $shed.function(function(result, reader) {
                    return result.orElse($shed.function(function() {
                        return reader(input);
                    }));
                })).valueOrElse($shed.function(function() {
                    return NextToken(tokens.symbol(input.asString().substring($shed.number(0), $shed.number(1)), input.range($shed.number(0), $shed.number(1))), input.sliceFrom($shed.number(1)));
                }));
            }).$define("readNextToken");
            var regexReader = $shed.function(function(regex, tokenBuilder) {
                return $shed.function(function(input) {
                    return (function() {
                        var string = input.asString();
                        return regex.exec(string).map($shed.function(function(regexResult) {
                            return (function() {
                                var value = regexResult.capture($shed.number(1));
                                return NextToken(tokenBuilder(value, input.range($shed.number(0), value.length())), input.sliceFrom(value.length()));
                            })();
                        }));
                    })();
                });
            }).$define("regexReader");
            var alphanumericToken = $shed.function(function(value, source) {
                return (function() {
                    var tokenBuilder = keywords.contains(value) ? $shed.memberAccess(tokens, tokens.keyword) : $shed.memberAccess(tokens, tokens.identifier);
                    return tokenBuilder(value, source);
                })();
            }).$define("alphanumericToken");
            var capture = $shed.function(function(value) {
                return regex.create($shed.string("^(").concat(value).concat($shed.string(")")));
            }).$define("capture");
            var readIdentifier = regexReader(capture($shed.string("[a-zA-Z_][a-zA-Z0-9_]*")), alphanumericToken);
            var readWhitespace = regexReader(capture($shed.string("\\s+")), $shed.memberAccess(tokens, tokens.whitespace));
            var symbolRegex = capture(strings.join($shed.string("|"), map($shed.memberAccess(regex, regex.escape), symbols)));
            var readSymbol = regexReader(symbolRegex, $shed.memberAccess(tokens, tokens.symbol));
            var readNumber = regexReader(capture($shed.string("[0-9]+")), $shed.memberAccess(tokens, tokens.number));
            var readLineComment = regexReader(capture($shed.string("//.*")), $shed.memberAccess(tokens, tokens.comment));
            var createStringToken = $shed.function(function(value, source) {
                return tokens.string(json.parseString(value), source);
            }).$define("createStringToken");
            var readString = regexReader(capture($shed.string("\"[^\"\\\\]*(?:\\\\.[^\"\\\\]*)*\"")), createStringToken);
            var NextToken = (function() {
                var $class = $shed.class(function(token, rest) {
                    return {
                        $class: $class,
                        token: $shed.function(function() {
                            return token;
                        }),
                        rest: $shed.function(function() {
                            return rest;
                        })
                    };
                });
                return $class;
            })().$define("NextToken");
            return {
                $class: $class,
                tokenise: tokenise
            };
        });
        return $class;
    })().$define("Tokeniser");
    return {
        Tokeniser: Tokeniser
    };
});;

$shed.exportModule("shed.compiler.referenceResolving", function() {
    var sequences = $shed.js.import("sequences");
    var results = $shed.js.import("shed.compiler.results");
    var nodes = $shed.js.import("shed.compiler.nodes");
    var scoping = $shed.js.import("shed.compiler.scoping");
    var resolveReferences = $shed.function(function(node, context) {
        return (function() {
            var scope = scoping.scopeOf(node);
            var result = classOf(node).equals($shed.memberAccess(nodes, nodes.VariableReferenceNode)) ? resolveRef(node, context) : results.success(context);
            var resultUpdatedContext = isVariableBinder(node) ? result.map($shed.function(function(context) {
                return context.add(node.name());
            })) : result;
            return resultUpdatedContext.bind($shed.function(function(context) {
                return resolveScope(scope, context);
            }));
        })();
    }).$define("resolveReferences");
    var resolveRef = $shed.function(function(ref, context) {
        return (function() {
            var name = ref.identifier();
            return context.contains(name) ? results.success(context) : results.failure(listOf(variableNotInScope(name)));
        })();
    }).$define("resolveRef");
    var isVariableBinder = $shed.function(function(node) {
        return match(node, matchClass($shed.memberAccess(nodes, nodes.FormalArgumentNode), $shed.function(function() {
            return true;
        })), matchDefault($shed.function(function() {
            return false;
        })));
    }).$define("isVariableBinder");
    var resolveScope = $shed.function(function(scope, context) {
        return (function() {
            var result = resolveAll(scope.nodes(), context);
            return match(scope, matchClass($shed.memberAccess(scoping, scoping.SameScope), $shed.function(function(scope) {
                return result;
            })), matchClass($shed.memberAccess(scoping, scoping.SubScope), $shed.function(function(scope) {
                return result.map($shed.function(function(subContext) {
                    return context;
                }));
            })));
        })();
    }).$define("resolveScope");
    var resolveAll = $shed.function(function(nodes, context) {
        return nodes.foldLeft(results.success(context), $shed.function(function(result, child) {
            return result.bind($shed.function(function(context) {
                return resolveReferences(child, context);
            }));
        }));
    }).$define("resolveAll");
    var variableNotInScope = $shed.function(function(name) {
        return $shed.string("variable not in scope: ").concat(name);
    }).$define("variableNotInScope");
    var Context = (function() {
        var $class = $shed.class(function(names) {
            var contains = $shed.function(function(name) {
                return sequences.any($shed.function(function(n) {
                    return n.equals(name);
                }), names);
            }).$define("contains");
            var add = $shed.function(function(name) {
                return Context(sequences.cons(name, names));
            }).$define("add");
            return {
                $class: $class,
                contains: contains,
                add: add
            };
        });
        return $class;
    })().$define("Context");
    var emptyContext = Context($shed.memberAccess(sequences, sequences.nil));
    return {
        resolveReferences: resolveReferences,
        emptyContext: emptyContext,
        variableNotInScope: variableNotInScope
    };
});;

$shed.exportModule("shed.compiler.moduleCompilation", function() {
    var strings = $shed.js.import("strings");
    var createStringSource = $shed.js.import("lop.strings.createStringSource");
    var Parser = $shed.js.import("shed.compiler.parsing.parser.Parser");
    var resolveReferences = $shed.js.import("shed.compiler.referenceResolving.resolveReferences");
    var microJavaScript = $shed.js.import("shed.compiler.codeGeneration.microJavaScript");
    var writing = $shed.js.import("shed.compiler.javaScript.writing");
    var results = $shed.js.import("shed.compiler.results");
    var parser = Parser();
    var compileSourceToString = $shed.function(function(source) {
        return (function() {
            var result = parser.parseModule(source).bind($shed.function(function(shedNode) {
                return (function() {
                    var javaScriptNode = microJavaScript.generate(shedNode);
                    return results.success(writing.write(javaScriptNode));
                })();
            }));
            return result.valueOrElse($shed.function(function(failure) {
                return failure.messages().forEach(print);
            }));
        })();
    }).$define("compileSourceToString");
    return {
        compileSourceToString: compileSourceToString
    };
});;

$shed.exportModule("shed.compiler.scoping", function() {
    var nodes = $shed.js.import("shed.compiler.nodes");
    var scopeOf = $shed.function(function(node) {
        return match(node, matchClass($shed.memberAccess(nodes, nodes.UnitNode), noScope), matchClass($shed.memberAccess(nodes, nodes.NumberNode), noScope), matchClass($shed.memberAccess(nodes, nodes.StringNode), noScope), matchClass($shed.memberAccess(nodes, nodes.BooleanNode), noScope), matchClass($shed.memberAccess(nodes, nodes.IfThenElseNode), ifScope), matchClass($shed.memberAccess(nodes, nodes.CallNode), callScope), matchClass($shed.memberAccess(nodes, nodes.FormalArgumentNode), formalArgScope), matchClass($shed.memberAccess(nodes, nodes.VariableReferenceNode), noScope), matchClass($shed.memberAccess(nodes, nodes.FunctionNode), functionScope));
    }).$define("scopeOf");
    var noScope = $shed.function(function(node) {
        return sameScope(emptyList);
    }).$define("noScope");
    var ifScope = $shed.function(function(node) {
        return sameScope(listOf(node.condition(), node.trueValue(), node.falseValue()));
    }).$define("ifScope");
    var callScope = $shed.function(function(node) {
        return sameScope(listOf(node.callee()).concat(node.args()));
    }).$define("callScope");
    var formalArgScope = $shed.function(function(node) {
        return sameScope(listOf(node.type()));
    }).$define("formalArgScope");
    var functionScope = $shed.function(function(node) {
        return subScope(node.formalArgs().concat(listOf(node.body())));
    }).$define("functionScope");
    var SameScope = (function() {
        var $class = $shed.class(function(nodes) {
            return {
                $class: $class,
                nodes: $shed.function(function() {
                    return nodes;
                })
            };
        });
        return $class;
    })().$define("SameScope");
    var SubScope = (function() {
        var $class = $shed.class(function(nodes) {
            return {
                $class: $class,
                nodes: $shed.function(function() {
                    return nodes;
                })
            };
        });
        return $class;
    })().$define("SubScope");
    var sameScope = SameScope;
    var subScope = SubScope;
    return {
        scopeOf: scopeOf,
        SameScope: SameScope,
        SubScope: SubScope
    };
});;

$shed.exportModule("shed.compiler.nodes", function() {
    var structs = $shed.js.import("structs");
    var Node = (function() {
        var $class = $shed.class(function() {
            return {
                $class: $class
            };
        });
        return $class;
    })().$define("Node");
    var FormalArgumentNode = (function() {
        var $class = $shed.class(function(name, type) {
            return {
                $class: $class,
                name: $shed.function(function() {
                    return name;
                }),
                type: $shed.function(function() {
                    return type;
                }),
                struct: $shed.function(function() {
                    return structs.create(FormalArgumentNode, listOf(name, type));
                })
            };
        });
        return $class;
    })().$define("FormalArgumentNode");
    var MemberDeclarationNode = (function() {
        var $class = $shed.class(function(name, value) {
            return {
                $class: $class,
                name: $shed.function(function() {
                    return name;
                }),
                value: $shed.function(function() {
                    return value;
                }),
                struct: $shed.function(function() {
                    return structs.create(MemberDeclarationNode, listOf(name, value));
                })
            };
        });
        return $class;
    })().$define("MemberDeclarationNode");
    var UnitNode = (function() {
        var $class = $shed.class(function() {
            return {
                $class: $class,
                struct: $shed.function(function() {
                    return structs.create(UnitNode, emptyList);
                })
            };
        });
        return $class;
    })().$define("UnitNode");
    var NumberNode = (function() {
        var $class = $shed.class(function(value) {
            return {
                $class: $class,
                value: $shed.function(function() {
                    return value;
                }),
                struct: $shed.function(function() {
                    return structs.create(NumberNode, listOf(value));
                })
            };
        });
        return $class;
    })().$define("NumberNode");
    var BooleanNode = (function() {
        var $class = $shed.class(function(value) {
            return {
                $class: $class,
                value: $shed.function(function() {
                    return value;
                }),
                struct: $shed.function(function() {
                    return structs.create(BooleanNode, listOf(value));
                })
            };
        });
        return $class;
    })().$define("BooleanNode");
    var StringNode = (function() {
        var $class = $shed.class(function(value) {
            return {
                $class: $class,
                value: $shed.function(function() {
                    return value;
                }),
                struct: $shed.function(function() {
                    return structs.create(StringNode, listOf(value));
                })
            };
        });
        return $class;
    })().$define("StringNode");
    var VariableReferenceNode = (function() {
        var $class = $shed.class(function(identifier) {
            return {
                $class: $class,
                identifier: $shed.function(function() {
                    return identifier;
                }),
                struct: $shed.function(function() {
                    return structs.create(VariableReferenceNode, listOf(identifier));
                })
            };
        });
        return $class;
    })().$define("VariableReferenceNode");
    var IfThenElseNode = (function() {
        var $class = $shed.class(function(condition, trueValue, falseValue) {
            return {
                $class: $class,
                condition: $shed.function(function() {
                    return condition;
                }),
                trueValue: $shed.function(function() {
                    return trueValue;
                }),
                falseValue: $shed.function(function() {
                    return falseValue;
                }),
                struct: $shed.function(function() {
                    return structs.create(IfThenElseNode, listOf(condition, trueValue, falseValue));
                })
            };
        });
        return $class;
    })().$define("IfThenElseNode");
    var CallNode = (function() {
        var $class = $shed.class(function(callee, args) {
            return {
                $class: $class,
                callee: $shed.function(function() {
                    return callee;
                }),
                args: $shed.function(function() {
                    return args;
                }),
                struct: $shed.function(function() {
                    return structs.create(CallNode, listOf(callee, args));
                })
            };
        });
        return $class;
    })().$define("CallNode");
    var TypeApplicationNode = (function() {
        var $class = $shed.class(function(callee, args) {
            return {
                $class: $class,
                callee: $shed.function(function() {
                    return callee;
                }),
                args: $shed.function(function() {
                    return args;
                }),
                struct: $shed.function(function() {
                    return structs.create(TypeApplicationNode, listOf(callee, args));
                })
            };
        });
        return $class;
    })().$define("TypeApplicationNode");
    var MemberAccessNode = (function() {
        var $class = $shed.class(function(left, memberName) {
            return {
                $class: $class,
                left: $shed.function(function() {
                    return left;
                }),
                memberName: $shed.function(function() {
                    return memberName;
                }),
                struct: $shed.function(function() {
                    return structs.create(MemberAccessNode, listOf(left, memberName));
                })
            };
        });
        return $class;
    })().$define("MemberAccessNode");
    var FunctionNode = (function() {
        var $class = $shed.class(function(formalArgs, body) {
            return {
                $class: $class,
                formalArgs: $shed.function(function() {
                    return formalArgs;
                }),
                body: $shed.function(function() {
                    return body;
                }),
                struct: $shed.function(function() {
                    return structs.create(FunctionNode, listOf(formalArgs, body));
                })
            };
        });
        return $class;
    })().$define("FunctionNode");
    var ClassNode = (function() {
        var $class = $shed.class(function(formalArgs, body) {
            return {
                $class: $class,
                formalArgs: $shed.function(function() {
                    return formalArgs;
                }),
                body: $shed.function(function() {
                    return body;
                }),
                struct: $shed.function(function() {
                    return structs.create(ClassNode, listOf(formalArgs, body));
                })
            };
        });
        return $class;
    })().$define("ClassNode");
    var ObjectNode = (function() {
        var $class = $shed.class(function(memberDeclarations, statements) {
            return {
                $class: $class,
                memberDeclarations: $shed.function(function() {
                    return memberDeclarations;
                }),
                statements: $shed.function(function() {
                    return statements;
                }),
                struct: $shed.function(function() {
                    return structs.create(ObjectNode, listOf(memberDeclarations, statements));
                })
            };
        });
        return $class;
    })().$define("ObjectNode");
    var DoBlockNode = (function() {
        var $class = $shed.class(function(statements) {
            return {
                $class: $class,
                statements: $shed.function(function() {
                    return statements;
                }),
                struct: $shed.function(function() {
                    return structs.create(DoBlockNode, listOf(statements));
                })
            };
        });
        return $class;
    })().$define("DoBlockNode");
    var LetInNode = (function() {
        var $class = $shed.class(function(declarations, expression) {
            return {
                $class: $class,
                declarations: $shed.function(function() {
                    return declarations;
                }),
                expression: $shed.function(function() {
                    return expression;
                }),
                struct: $shed.function(function() {
                    return structs.create(LetInNode, listOf(declarations, expression));
                })
            };
        });
        return $class;
    })().$define("LetInNode");
    var AndNode = (function() {
        var $class = $shed.class(function(left, right) {
            return {
                $class: $class,
                left: $shed.function(function() {
                    return left;
                }),
                right: $shed.function(function() {
                    return right;
                }),
                struct: $shed.function(function() {
                    return structs.create(AndNode, listOf(left, right));
                })
            };
        });
        return $class;
    })().$define("AndNode");
    var ExpressionStatementNode = (function() {
        var $class = $shed.class(function(expression) {
            return {
                $class: $class,
                expression: $shed.function(function() {
                    return expression;
                }),
                struct: $shed.function(function() {
                    return structs.create(ExpressionStatementNode, listOf(expression));
                })
            };
        });
        return $class;
    })().$define("ExpressionStatementNode");
    var ReturnStatementNode = (function() {
        var $class = $shed.class(function(value) {
            return {
                $class: $class,
                value: $shed.function(function() {
                    return value;
                }),
                struct: $shed.function(function() {
                    return structs.create(ReturnStatementNode, listOf(value));
                })
            };
        });
        return $class;
    })().$define("ReturnStatementNode");
    var ValDeclarationNode = (function() {
        var $class = $shed.class(function(name, value) {
            return {
                $class: $class,
                name: $shed.function(function() {
                    return name;
                }),
                value: $shed.function(function() {
                    return value;
                }),
                struct: $shed.function(function() {
                    return structs.create(ValDeclarationNode, listOf(name, value));
                })
            };
        });
        return $class;
    })().$define("ValDeclarationNode");
    var DefinitionNode = (function() {
        var $class = $shed.class(function(name, value) {
            return {
                $class: $class,
                name: $shed.function(function() {
                    return name;
                }),
                value: $shed.function(function() {
                    return value;
                }),
                struct: $shed.function(function() {
                    return structs.create(DefinitionNode, listOf(name, value));
                })
            };
        });
        return $class;
    })().$define("DefinitionNode");
    var ImportNode = (function() {
        var $class = $shed.class(function(moduleName) {
            return {
                $class: $class,
                moduleName: $shed.function(function() {
                    return moduleName;
                }),
                struct: $shed.function(function() {
                    return structs.create(ImportNode, listOf(moduleName));
                })
            };
        });
        return $class;
    })().$define("ImportNode");
    var ModuleNode = (function() {
        var $class = $shed.class(function(name, memberDeclarations, statements) {
            return {
                $class: $class,
                name: $shed.function(function() {
                    return name;
                }),
                memberDeclarations: $shed.function(function() {
                    return memberDeclarations;
                }),
                statements: $shed.function(function() {
                    return statements;
                }),
                struct: $shed.function(function() {
                    return structs.create(ModuleNode, listOf(name, memberDeclarations, statements));
                })
            };
        });
        return $class;
    })().$define("ModuleNode");
    return {
        Node: Node,
        formalArgument: FormalArgumentNode,
        FormalArgumentNode: FormalArgumentNode,
        memberDeclaration: MemberDeclarationNode,
        MemberDeclarationNode: MemberDeclarationNode,
        unit: UnitNode,
        UnitNode: UnitNode,
        number: NumberNode,
        NumberNode: NumberNode,
        bool: BooleanNode,
        BooleanNode: BooleanNode,
        string: StringNode,
        StringNode: StringNode,
        variableReference: VariableReferenceNode,
        VariableReferenceNode: VariableReferenceNode,
        ref: VariableReferenceNode,
        ifThenElse: IfThenElseNode,
        IfThenElseNode: IfThenElseNode,
        call: CallNode,
        CallNode: CallNode,
        typeApplication: TypeApplicationNode,
        TypeApplicationNode: TypeApplicationNode,
        memberAccess: MemberAccessNode,
        MemberAccessNode: MemberAccessNode,
        func: FunctionNode,
        FunctionNode: FunctionNode,
        classDeclaration: ClassNode,
        ClassNode: ClassNode,
        obj: ObjectNode,
        ObjectNode: ObjectNode,
        doBlock: DoBlockNode,
        DoBlockNode: DoBlockNode,
        letIn: LetInNode,
        LetInNode: LetInNode,
        and: AndNode,
        AndNode: AndNode,
        expressionStatement: ExpressionStatementNode,
        ExpressionStatementNode: ExpressionStatementNode,
        ret: ReturnStatementNode,
        returnStatement: ReturnStatementNode,
        ReturnStatementNode: ReturnStatementNode,
        valDeclaration: ValDeclarationNode,
        ValDeclarationNode: ValDeclarationNode,
        definition: DefinitionNode,
        DefinitionNode: DefinitionNode,
        importStatement: ImportNode,
        ImportNode: ImportNode,
        moduleNode: ModuleNode,
        ModuleNode: ModuleNode
    };
});;

$shed.exportModule("shed.compiler.javaScript.js", function() {
    var structs = $shed.js.import("structs");
    var UnitNode = (function() {
        var $class = $shed.class(function() {
            return {
                $class: $class,
                value: $shed.function(function() {
                    return value;
                }),
                struct: $shed.function(function() {
                    return structs.create(UnitNode, emptyList);
                })
            };
        });
        return $class;
    })().$define("UnitNode");
    var StringNode = (function() {
        var $class = $shed.class(function(value) {
            return {
                $class: $class,
                value: $shed.function(function() {
                    return value;
                }),
                struct: $shed.function(function() {
                    return structs.create(StringNode, listOf(value));
                })
            };
        });
        return $class;
    })().$define("StringNode");
    var BooleanNode = (function() {
        var $class = $shed.class(function(value) {
            return {
                $class: $class,
                value: $shed.function(function() {
                    return value;
                }),
                struct: $shed.function(function() {
                    return structs.create(BooleanNode, listOf(value));
                })
            };
        });
        return $class;
    })().$define("BooleanNode");
    var NumberNode = (function() {
        var $class = $shed.class(function(value) {
            return {
                $class: $class,
                value: $shed.function(function() {
                    return value;
                }),
                struct: $shed.function(function() {
                    return structs.create(NumberNode, listOf(value));
                })
            };
        });
        return $class;
    })().$define("NumberNode");
    var VariableReferenceNode = (function() {
        var $class = $shed.class(function(identifier) {
            return {
                $class: $class,
                identifier: $shed.function(function() {
                    return identifier;
                }),
                struct: $shed.function(function() {
                    return structs.create(VariableReferenceNode, listOf(identifier));
                })
            };
        });
        return $class;
    })().$define("VariableReferenceNode");
    var ConditionalOperatorNode = (function() {
        var $class = $shed.class(function(condition, trueValue, falseValue) {
            return {
                $class: $class,
                condition: $shed.function(function() {
                    return condition;
                }),
                trueValue: $shed.function(function() {
                    return trueValue;
                }),
                falseValue: $shed.function(function() {
                    return falseValue;
                }),
                struct: $shed.function(function() {
                    return structs.create(ConditionalOperatorNode, listOf(condition, trueValue, falseValue));
                })
            };
        });
        return $class;
    })().$define("ConditionalOperatorNode");
    var CallNode = (function() {
        var $class = $shed.class(function(callee, args) {
            return {
                $class: $class,
                callee: $shed.function(function() {
                    return callee;
                }),
                args: $shed.function(function() {
                    return args;
                }),
                struct: $shed.function(function() {
                    return structs.create(CallNode, listOf(callee, args));
                })
            };
        });
        return $class;
    })().$define("CallNode");
    var PropertyAccessNode = (function() {
        var $class = $shed.class(function(left, propertyName) {
            return {
                $class: $class,
                left: $shed.function(function() {
                    return left;
                }),
                propertyName: $shed.function(function() {
                    return propertyName;
                }),
                struct: $shed.function(function() {
                    return structs.create(PropertyAccessNode, listOf(left, propertyName));
                })
            };
        });
        return $class;
    })().$define("PropertyAccessNode");
    var FunctionNode = (function() {
        var $class = $shed.class(function(formalArgs, statements) {
            return {
                $class: $class,
                formalArgs: $shed.function(function() {
                    return formalArgs;
                }),
                statements: $shed.function(function() {
                    return statements;
                }),
                struct: $shed.function(function() {
                    return structs.create(FunctionNode, listOf(formalArgs, statements));
                })
            };
        });
        return $class;
    })().$define("FunctionNode");
    var ObjectNode = (function() {
        var $class = $shed.class(function(properties) {
            return {
                $class: $class,
                properties: $shed.function(function() {
                    return properties;
                }),
                struct: $shed.function(function() {
                    return structs.create(ObjectNode, listOf(properties));
                })
            };
        });
        return $class;
    })().$define("ObjectNode");
    var AndNode = (function() {
        var $class = $shed.class(function(left, right) {
            return {
                $class: $class,
                left: $shed.function(function() {
                    return left;
                }),
                right: $shed.function(function() {
                    return right;
                }),
                struct: $shed.function(function() {
                    return structs.create(AndNode, listOf(left, right));
                })
            };
        });
        return $class;
    })().$define("AndNode");
    var ExpressionStatementNode = (function() {
        var $class = $shed.class(function(expression) {
            return {
                $class: $class,
                expression: $shed.function(function() {
                    return expression;
                }),
                struct: $shed.function(function() {
                    return structs.create(ExpressionStatementNode, listOf(expression));
                })
            };
        });
        return $class;
    })().$define("ExpressionStatementNode");
    var ReturnNode = (function() {
        var $class = $shed.class(function(value) {
            return {
                $class: $class,
                value: $shed.function(function() {
                    return value;
                }),
                struct: $shed.function(function() {
                    return structs.create(ReturnNode, listOf(value));
                })
            };
        });
        return $class;
    })().$define("ReturnNode");
    var VarDeclarationNode = (function() {
        var $class = $shed.class(function(name, initialValue) {
            return {
                $class: $class,
                name: $shed.function(function() {
                    return name;
                }),
                initialValue: $shed.function(function() {
                    return initialValue;
                }),
                struct: $shed.function(function() {
                    return structs.create(VarDeclarationNode, listOf(name, initialValue));
                })
            };
        });
        return $class;
    })().$define("VarDeclarationNode");
    var StatementsNode = (function() {
        var $class = $shed.class(function(statements) {
            return {
                $class: $class,
                statements: $shed.function(function() {
                    return statements;
                }),
                struct: $shed.function(function() {
                    return structs.create(StatementsNode, listOf(statements));
                })
            };
        });
        return $class;
    })().$define("StatementsNode");
    return {
        unit: UnitNode,
        UnitNode: UnitNode,
        bool: BooleanNode,
        BooleanNode: BooleanNode,
        number: NumberNode,
        NumberNode: NumberNode,
        string: StringNode,
        StringNode: StringNode,
        ref: VariableReferenceNode,
        variableReference: VariableReferenceNode,
        VariableReferenceNode: VariableReferenceNode,
        conditional: ConditionalOperatorNode,
        ConditionalOperatorNode: ConditionalOperatorNode,
        call: CallNode,
        CallNode: CallNode,
        propertyAccess: PropertyAccessNode,
        PropertyAccessNode: PropertyAccessNode,
        func: FunctionNode,
        FunctionNode: FunctionNode,
        obj: ObjectNode,
        ObjectNode: ObjectNode,
        and: AndNode,
        AndNode: AndNode,
        expressionStatement: ExpressionStatementNode,
        ExpressionStatementNode: ExpressionStatementNode,
        ret: ReturnNode,
        ReturnNode: ReturnNode,
        varDeclaration: VarDeclarationNode,
        VarDeclarationNode: VarDeclarationNode,
        statements: StatementsNode,
        StatementsNode: StatementsNode
    };
});;

$shed.exportModule("shed.compiler.javaScript.writing", function() {
    var json = $shed.js.import("json");
    var strings = $shed.js.import("strings");
    var regex = $shed.js.import("regex");
    var js = $shed.js.import("shed.compiler.javaScript.js");
    var lowestPrecedence = $shed.number(100);
    var write = $shed.function(function(javaScriptNode) {
        return writeWithPrecedence(javaScriptNode, lowestPrecedence);
    }).$define("write");
    var writeWithPrecedence = $shed.function(function(javaScriptNode, precedence) {
        return match(javaScriptNode, matchClass($shed.memberAccess(js, js.BooleanNode), writeBoolean), matchClass($shed.memberAccess(js, js.NumberNode), writeNumber), matchClass($shed.memberAccess(js, js.StringNode), writeString), matchClass($shed.memberAccess(js, js.VariableReferenceNode), writeVariableReference), matchClass($shed.memberAccess(js, js.ConditionalOperatorNode), writeExpression(conditionalOperatorWriter, precedence)), matchClass($shed.memberAccess(js, js.CallNode), writeCall), matchClass($shed.memberAccess(js, js.PropertyAccessNode), writePropertyAccess), matchClass($shed.memberAccess(js, js.FunctionNode), writeExpression(functionWriter, precedence)), matchClass($shed.memberAccess(js, js.ObjectNode), writeObject), matchClass($shed.memberAccess(js, js.AndNode), writeExpression(andWriter, precedence)), matchClass($shed.memberAccess(js, js.ExpressionStatementNode), writeExpressionStatement), matchClass($shed.memberAccess(js, js.ReturnNode), writeReturn), matchClass($shed.memberAccess(js, js.VarDeclarationNode), writeVar), matchClass($shed.memberAccess(js, js.StatementsNode), writeStatements));
    }).$define("writeWithPrecedence");
    var writeExpression = $shed.function(function(expressionType, precedence) {
        return $shed.function(function(node) {
            return (function() {
                var subWrite = $shed.function(function(node) {
                    return writeWithPrecedence(node, $shed.memberAccess(expressionType, expressionType.precedence));
                }).$define("subWrite");
                var innerString = expressionType.write(subWrite, node);
                return precedence.lessThanOrEqual($shed.memberAccess(expressionType, expressionType.precedence)) ? $shed.string("(").concat(innerString).concat($shed.string(")")) : innerString;
            })();
        });
    }).$define("writeExpression");
    var conditionalOperatorWriter = (function() {
        var $class = $shed.class(function() {
            var writeConditionalOperator = $shed.function(function(write, conditional) {
                return write(conditional.condition()).concat($shed.string(" ? ")).concat(write(conditional.trueValue())).concat($shed.string(" : ")).concat(write(conditional.falseValue()));
            }).$define("writeConditionalOperator");
            return {
                $class: $class,
                precedence: $shed.number(15),
                write: writeConditionalOperator
            };
        });
        return $class;
    })()();
    var writeBoolean = $shed.function(function(bool) {
        return bool.value() ? $shed.string("true") : $shed.string("false");
    }).$define("writeBoolean");
    var writeNumber = $shed.function(function(number) {
        return number.value();
    }).$define("writeNumber");
    var writeString = $shed.function(function(string) {
        return json.stringifyString(string.value());
    }).$define("writeString");
    var writeVariableReference = $shed.function(function(ref) {
        return ref.identifier();
    }).$define("writeVariableReference");
    var writeCall = $shed.function(function(call) {
        return writeWithPrecedence(call.callee(), $shed.number(2)).concat($shed.string("(")).concat(strings.join($shed.string(", "), call.args().map(write))).concat($shed.string(")"));
    }).$define("writeCall");
    var writePropertyAccess = $shed.function(function(propertyAccess) {
        return writeWithPrecedence(propertyAccess.left(), $shed.number(1)).concat($shed.string(".")).concat(propertyAccess.propertyName());
    }).$define("writePropertyAccess");
    var functionWriter = (function() {
        var $class = $shed.class(function() {
            var writeFunction = $shed.function(function(write, func) {
                return $shed.string("function(").concat(strings.join($shed.string(", "), func.formalArgs())).concat($shed.string(") {")).concat(writeIndentedStatements(func.statements())).concat($shed.string("\n}"));
            }).$define("writeFunction");
            return {
                $class: $class,
                precedence: $shed.number(20),
                write: writeFunction
            };
        });
        return $class;
    })()();
    var writeIndentedStatements = $shed.function(function(statements) {
        return strings.join($shed.string(""), statements.map(write).map($shed.function(function(statement) {
            return $shed.string("\n    ").concat(indent(statement));
        })));
    }).$define("writeIndentedStatements");
    var indent = $shed.function(function(string) {
        return string.replace($shed.string("\n"), $shed.string("\n    "));
    }).$define("indent");
    var writeObject = $shed.function(function(obj) {
        return $shed.string("{").concat(strings.join($shed.string(","), obj.properties().map(writeProperty))).concat($shed.string("\n}"));
    }).$define("writeObject");
    var andWriter = (function() {
        var $class = $shed.class(function() {
            var writeAnd = $shed.function(function(write, andNode) {
                return write(andNode.left()).concat($shed.string(" && ")).concat(write(andNode.right()));
            }).$define("writeAnd");
            return {
                $class: $class,
                precedence: $shed.number(13),
                write: writeAnd
            };
        });
        return $class;
    })()();
    var writeProperty = $shed.function(function(property) {
        return property.map($shed.function(function(name, value) {
            return $shed.string("\n    ").concat(name).concat($shed.string(": ")).concat(indent(write(value)));
        }));
    }).$define("writeProperty");
    var writeExpressionStatement = $shed.function(function(expressionStatement) {
        return write(expressionStatement.expression()).concat($shed.string(";"));
    }).$define("writeExpressionStatement");
    var writeReturn = $shed.function(function(returnStatement) {
        return $shed.string("return ").concat(write(returnStatement.value())).concat($shed.string(";"));
    }).$define("writeReturn");
    var writeVar = $shed.function(function(varDeclaration) {
        return $shed.string("var ").concat(varDeclaration.name()).concat($shed.string(" = ")).concat(write(varDeclaration.initialValue())).concat($shed.string(";"));
    }).$define("writeVar");
    var writeStatements = $shed.function(function(statements) {
        return strings.join($shed.string("\n"), statements.statements().map(write));
    }).$define("writeStatements");
    return {
        write: write
    };
});;

$shed.exportModule("shed.compiler.parsing.statements", function() {
    var rules = $shed.js.import("lop.rules");
    var results = $shed.js.import("lop.results");
    var Error = $shed.js.import("lop.error.Error");
    var nodes = $shed.js.import("shed.compiler.nodes");
    var tokenRules = $shed.js.import("shed.compiler.parsing.tokenRules");
    var statementRule = $shed.function(function(expressionRule) {
        return (function() {
            var statementTerminator = tokenRules.symbol($shed.string(";"));
            var expressionStatementRule = rules.sequence().capture(expressionRule).next(statementTerminator).map($shed.memberAccess(nodes, nodes.expressionStatement));
            var returnRule = rules.sequence().next(tokenRules.keyword($shed.string("return"))).cut().capture(expressionRule).next(statementTerminator).map($shed.memberAccess(nodes, nodes.returnStatement));
            var valRule = rules.sequence().next(tokenRules.keyword($shed.string("val"))).cut().capture(tokenRules.identifier()).next(tokenRules.symbol($shed.string("="))).capture(expressionRule).next(statementTerminator).map($shed.memberAccess(nodes, nodes.valDeclaration));
            var defRule = rules.sequence().next(tokenRules.keyword($shed.string("def"))).cut().capture(tokenRules.identifier()).capture(expressionRule).next(rules.optional(tokenRules.symbol($shed.string(";")))).map($shed.memberAccess(nodes, nodes.definition));
            return rules.firstOf($shed.string("statement"), listOf(returnRule, valRule, defRule, expressionStatementRule));
        })();
    }).$define("statementRule");
    return {
        statementRule: statementRule
    };
});;

$shed.exportModule("shed.compiler.parsing.tokenRules", function() {
    var rules = $shed.js.import("lop.rules");
    var symbol = $shed.function(function(value) {
        return rules.token($shed.string("symbol"), value);
    }).$define("symbol");
    var keyword = $shed.function(function(value) {
        return rules.token($shed.string("keyword"), value);
    }).$define("keyword");
    var identifier = $shed.function(function() {
        return rules.tokenOfType($shed.string("identifier"));
    }).$define("identifier");
    return {
        symbol: symbol,
        keyword: keyword,
        identifier: identifier
    };
});;

$shed.exportModule("shed.compiler.parsing.literals", function() {
    var rules = $shed.js.import("lop.rules");
    var nodes = $shed.js.import("shed.compiler.nodes");
    var tokenRules = $shed.js.import("shed.compiler.parsing.tokenRules");
    var numberRule = rules.map(rules.tokenOfType($shed.string("number")), $shed.memberAccess(nodes, nodes.number));
    var unitRule = rules.sequence().next(tokenRules.symbol($shed.string("("))).next(tokenRules.symbol($shed.string(")"))).map($shed.function(function() {
        return nodes.unit();
    }));
    var trueRule = rules.map(tokenRules.keyword($shed.string("true")), $shed.function(function() {
        return nodes.bool(true);
    }));
    var falseRule = rules.map(tokenRules.keyword($shed.string("false")), $shed.function(function() {
        return nodes.bool(false);
    }));
    var booleanRule = rules.firstOf($shed.string("Boolean"), listOf(trueRule, falseRule));
    var stringRule = rules.map(rules.tokenOfType($shed.string("string")), $shed.memberAccess(nodes, nodes.string));
    var literalRule = rules.firstOf($shed.string("literal"), listOf(numberRule, unitRule, booleanRule, stringRule));
    return {
        literalRule: literalRule
    };
});;

$shed.exportModule("shed.compiler.parsing.parser", function() {
    var Token = $shed.js.import("lop.token.Token");
    var Success = $shed.js.import("lop.results.Success");
    var Tokeniser = $shed.js.import("shed.compiler.tokenising.tokeniser.Tokeniser");
    var nodes = $shed.js.import("shed.compiler.nodes");
    var results = $shed.js.import("shed.compiler.results");
    var expressionRules = $shed.js.import("shed.compiler.parsing.expressions.expressionRules");
    var statementRule = $shed.js.import("shed.compiler.parsing.statements.statementRule");
    var moduleRule = $shed.js.import("shed.compiler.parsing.modules.moduleRule");
    var Parser = (function() {
        var $class = $shed.class(function() {
            var tokeniser = Tokeniser();
            var filteredParse = $shed.function(function(predicate) {
                return $shed.function(function(rule, input) {
                    return rule(tokenise(input).filter(predicate).toSequence());
                });
            }).$define("filteredParse");
            var parse = filteredParse($shed.function(function(token) {
                return not(or(token.name().equals($shed.string("whitespace")), token.name().equals($shed.string("comment"))));
            }));
            var parseWithoutEndToken = filteredParse($shed.function(function(token) {
                return not(or(token.name().equals($shed.string("whitespace")), token.name().equals($shed.string("end")), token.name().equals($shed.string("comment"))));
            }));
            var parseModule = $shed.function(function(input) {
                return (function() {
                    var parseResult = parse(parseRule(), input);
                    return parseResult.isSuccess() ? results.success(parseResult.value()) : results.failure(listOf($shed.string("Parse failed:\n").concat($shed.string("source:")).concat(input.description()).concat($shed.string("\n")).concat(represent(parseResult)).concat($shed.string("\n"))));
                })();
            }).$define("parseModule");
            var parseRule = $shed.function(function() {
                return (function() {
                    var optionalMembers = lazyFunction($shed.function(function() {
                        return expressionRules(statement).optionalMembers();
                    }));
                    var expression = lazyFunction($shed.function(function() {
                        return expressionRules(statement).expression();
                    }));
                    var statement = lazyFunction($shed.function(function() {
                        return statementRule(expression);
                    }));
                    return moduleRule(statement, optionalMembers);
                })();
            }).$define("parseRule");
            var tokenise = $shed.function(function(input) {
                return tokeniser.tokenise(input);
            }).$define("tokenise");
            return {
                $class: $class,
                parse: parse,
                parseWithoutEndToken: parseWithoutEndToken,
                parseModule: parseModule
            };
        });
        return $class;
    })().$define("Parser");
    return {
        Parser: Parser
    };
});;

$shed.exportModule("shed.compiler.parsing.modules", function() {
    var options = $shed.js.import("options");
    var rules = $shed.js.import("lop.rules");
    var nodes = $shed.js.import("shed.compiler.nodes");
    var tokenRules = $shed.js.import("shed.compiler.parsing.tokenRules");
    var moduleRule = $shed.function(function(statementRule, optionalMembersRule) {
        return (function() {
            var moduleBody = rules.sequence().capture(rules.zeroOrMore(importRule)).capture(rules.zeroOrMore(statementRule)).map($shed.function(function(imports, statements) {
                return imports.concat(statements);
            }));
            return rules.sequence().capture(rules.optional(moduleDeclaration)).capture(optionalMembersRule).capture(moduleBody).next(rules.tokenOfType($shed.string("end"))).map($shed.memberAccess(nodes, nodes.moduleNode));
        })();
    }).$define("moduleRule");
    var moduleName = rules.zeroOrMoreWithSeparator(tokenRules.identifier(), tokenRules.symbol($shed.string(".")));
    var moduleDeclaration = rules.sequence().next(tokenRules.keyword($shed.string("module"))).cut().capture(moduleName).next(tokenRules.symbol($shed.string(";"))).head();
    var importRule = rules.sequence().next(tokenRules.keyword($shed.string("import"))).cut().capture(moduleName).next(tokenRules.symbol($shed.string(";"))).map($shed.memberAccess(nodes, nodes.importStatement));
    return {
        moduleRule: moduleRule
    };
});;

$shed.exportModule("shed.compiler.parsing.expressions", function() {
    var rules = $shed.js.import("lop.rules");
    var pratt = $shed.js.import("lop.pratt");
    var nodes = $shed.js.import("shed.compiler.nodes");
    var NumberNode = $shed.js.import("shed.compiler.nodes.NumberNode");
    var UnitNode = $shed.js.import("shed.compiler.nodes.UnitNode");
    var BooleanNode = $shed.js.import("shed.compiler.nodes.BooleanNode");
    var tokenRules = $shed.js.import("shed.compiler.parsing.tokenRules");
    var literals = $shed.js.import("shed.compiler.parsing.literals");
    var variableReferenceRule = rules.map(tokenRules.identifier(), $shed.memberAccess(nodes, nodes.variableReference));
    var expressionRules = $shed.function(function(statementRule) {
        return (function() {
            var ifThenElseRule = lazyFunction($shed.function(function() {
                return rules.sequence().next(tokenRules.keyword($shed.string("if"))).cut().capture(expressionRule).next(tokenRules.keyword($shed.string("then"))).capture(expressionRule).next(tokenRules.keyword($shed.string("else"))).capture(expressionRule).map($shed.memberAccess(nodes, nodes.ifThenElse));
            }));
            var bracketedRule = lazyFunction($shed.function(function() {
                return rules.sequence().next(tokenRules.symbol($shed.string("("))).capture(expressionRule).cut().next(tokenRules.symbol($shed.string(")"))).head();
            }));
            var functionRule = lazyFunction($shed.function(function() {
                return rules.sequence().next(tokenRules.keyword($shed.string("fun"))).cut().next(rules.optional(formalTypeParametersRule)).capture(formalArgumentListRule).next(rules.optional(typeSpecifierRule)).next(tokenRules.symbol($shed.string("=>"))).capture(expressionRule).map($shed.memberAccess(nodes, nodes.func));
            }));
            var formalTypeParametersRule = lazyFunction($shed.function(function() {
                return rules.sequence().next(tokenRules.symbol($shed.string("["))).cut().next(rules.zeroOrMoreWithSeparator(formalParameterRule, tokenRules.symbol($shed.string(",")))).next(tokenRules.symbol($shed.string("]"))).next(tokenRules.symbol($shed.string("=>"))).tuple();
            }));
            var formalParameterRule = lazyFunction($shed.function(function() {
                return expressionRule;
            }));
            var formalArgumentListRule = lazyFunction($shed.function(function() {
                return rules.sequence().next(tokenRules.symbol($shed.string("("))).capture(rules.zeroOrMoreWithSeparator(formalArgumentRule, tokenRules.symbol($shed.string(",")))).next(tokenRules.symbol($shed.string(")"))).head();
            }));
            var formalArgumentRule = lazyFunction($shed.function(function() {
                return rules.sequence().capture(tokenRules.identifier()).cut().capture(typeSpecifierRule).map($shed.memberAccess(nodes, nodes.formalArgument));
            }));
            var typeSpecifierRule = lazyFunction($shed.function(function() {
                return rules.sequence().next(tokenRules.symbol($shed.string(":"))).cut().capture(expressionRule).head();
            }));
            var memberDeclarationRule = lazyFunction($shed.function(function() {
                return rules.sequence().capture(tokenRules.identifier()).capture(rules.optional(expressionRule)).map($shed.function(function(name, value) {
                    return nodes.memberDeclaration(name, value.valueOrElse($shed.function(function() {
                        return nodes.ref(name);
                    })));
                }));
            }));
            var membersRule = rules.sequence().next(tokenRules.keyword($shed.string("members"))).cut().next(tokenRules.symbol($shed.string("{"))).capture(rules.zeroOrMoreWithSeparator(memberDeclarationRule, tokenRules.symbol($shed.string(",")))).next(tokenRules.symbol($shed.string("}"))).head();
            var optionalMembersRule = rules.map(rules.optional(membersRule), $shed.function(function(value) {
                return value.valueOrElse($shed.function(function() {
                    return emptyList;
                }));
            }));
            var objectBodyRule = rules.sequence().next(tokenRules.symbol($shed.string("{"))).capture(optionalMembersRule).capture(rules.zeroOrMore(statementRule)).next(tokenRules.symbol($shed.string("}"))).map($shed.memberAccess(nodes, nodes.obj));
            var classRule = rules.sequence().next(tokenRules.keyword($shed.string("class"))).cut().next(rules.optional(formalTypeParametersRule)).capture(formalArgumentListRule).next(tokenRules.symbol($shed.string("=>"))).capture(objectBodyRule).map($shed.memberAccess(nodes, nodes.classDeclaration));
            var objectRule = rules.sequence().next(tokenRules.keyword($shed.string("object"))).cut().capture(objectBodyRule).head();
            var doBlockRule = rules.sequence().next(tokenRules.keyword($shed.string("do"))).cut().next(tokenRules.symbol($shed.string("{"))).capture(rules.zeroOrMore(statementRule)).next(tokenRules.symbol($shed.string("}"))).map($shed.memberAccess(nodes, nodes.doBlock));
            var letDeclarationRule = lazyFunction($shed.function(function() {
                return rules.sequence().next(tokenRules.keyword($shed.string("val"))).cut().capture(tokenRules.identifier()).next(tokenRules.symbol($shed.string("="))).capture(expressionRule).map($shed.memberAccess(nodes, nodes.valDeclaration));
            }));
            var letInRule = lazyFunction($shed.function(function() {
                return rules.sequence().next(tokenRules.keyword($shed.string("let"))).cut().capture(rules.zeroOrMore(letDeclarationRule)).next(tokenRules.keyword($shed.string("in"))).capture(expressionRule).map($shed.memberAccess(nodes, nodes.letIn));
            }));
            var primaryExpressionRule = rules.firstOf($shed.string("primary expression"), listOf($shed.memberAccess(literals, literals.literalRule), variableReferenceRule, ifThenElseRule, bracketedRule, functionRule, objectRule, classRule, doBlockRule, letInRule));
            var partialCallRule = lazyFunction($shed.function(function() {
                return rules.sequence().next(tokenRules.symbol($shed.string("("))).cut().capture(rules.zeroOrMoreWithSeparator(expressionRule, tokenRules.symbol($shed.string(",")))).next(tokenRules.symbol($shed.string(")"))).map($shed.function(function(args) {
                    return $shed.function(function(left) {
                        return nodes.call(left, args);
                    });
                }));
            }));
            var partialTypeApplicationRule = lazyFunction($shed.function(function() {
                return rules.sequence().next(tokenRules.symbol($shed.string("["))).cut().next(rules.zeroOrMoreWithSeparator(expressionRule, tokenRules.symbol($shed.string(",")))).next(tokenRules.symbol($shed.string("]"))).map($shed.function(function() {
                    return $shed.function(function(left) {
                        return left;
                    });
                }));
            }));
            var partialMemberAccessRule = lazyFunction($shed.function(function() {
                return rules.sequence().next(tokenRules.symbol($shed.string("."))).cut().capture(tokenRules.identifier()).map($shed.function(function(memberName) {
                    return $shed.function(function(left) {
                        return nodes.memberAccess(left, memberName);
                    });
                }));
            }));
            var partialAndRule = lazyFunction($shed.function(function() {
                return rules.sequence().next(tokenRules.symbol($shed.string("&&"))).capture(expressionParser.leftAssociative($shed.string("and"))).map($shed.function(function(right) {
                    return $shed.function(function(left) {
                        return nodes.and(left, right);
                    });
                }));
            }));
            var expressionParser = pratt.parser($shed.string("expression"), listOf(primaryExpressionRule), listOf(pratt.infix($shed.string("call"), partialCallRule), pratt.infix($shed.string("typeApplication"), partialTypeApplicationRule), pratt.infix($shed.string("memberAccess"), partialMemberAccessRule), pratt.infix($shed.string("and"), partialAndRule)));
            var expressionRule = expressionParser.rule();
            return (function() {
                var $class = $shed.class(function() {
                    return {
                        $class: $class,
                        expression: $shed.function(function() {
                            return expressionRule;
                        }),
                        membersRule: $shed.function(function() {
                            return membersRule;
                        }),
                        optionalMembers: $shed.function(function() {
                            return optionalMembersRule;
                        })
                    };
                });
                return $class;
            })()();
        })();
    }).$define("expressionRules");
    return {
        expressionRules: expressionRules
    };
});;

$shed.exportModule("shed.compiler.results", function() {
    var structs = $shed.js.import("structs");
    var Result = (function() {
        var $class = $shed.class(function() {
            return {
                $class: $class
            };
        });
        return $class;
    })().$define("Result");
    var success = $shed.function(function(value) {
        return Success(value);
    }).$define("success");
    var failure = $shed.function(function(messages) {
        return Failure(messages);
    }).$define("failure");
    var Failure = (function() {
        var $class = $shed.class(function(messages) {
            return {
                $class: $class,
                map: $shed.function(function() {
                    return Failure(messages);
                }),
                bind: $shed.function(function() {
                    return Failure(messages);
                }),
                valueOrElse: $shed.function(function(func) {
                    return func(Failure(messages));
                }),
                messages: $shed.function(function() {
                    return messages;
                }),
                isSuccess: $shed.function(function() {
                    return false;
                }),
                struct: $shed.function(function() {
                    return structs.create(Failure, listOf(messages));
                })
            };
        });
        return $class;
    })().$define("Failure");
    var Success = (function() {
        var $class = $shed.class(function(value) {
            return {
                $class: $class,
                map: $shed.function(function(func) {
                    return Success(func(value));
                }),
                bind: $shed.function(function(func) {
                    return func(value);
                }),
                valueOrElse: $shed.function(function() {
                    return value;
                }),
                value: $shed.function(function() {
                    return value;
                }),
                isSuccess: $shed.function(function() {
                    return true;
                }),
                struct: $shed.function(function() {
                    return structs.create(Success, listOf(value));
                })
            };
        });
        return $class;
    })().$define("Success");
    return {
        success: success,
        failure: failure
    };
});;

$shed.exportModule("lop.sources", function() {
    var structs = $shed.js.import("structs");
    var Range = $shed.js.import("lop.range.Range");
    var StringSource = (function() {
        var $class = $shed.class(function(string, myDescription, myRange) {
            return {
                $class: $class,
                asString: $shed.function(function() {
                    return string.substring(myRange.start(), myRange.end());
                }),
                description: $shed.function(function() {
                    return myDescription;
                }),
                indexRange: $shed.function(function() {
                    return myRange;
                }),
                range: $shed.function(function(rangeStart, rangeEnd) {
                    return StringSource(string, myDescription, Range(myRange.start().add(rangeStart), myRange.start().add(rangeEnd)));
                }),
                sliceFrom: $shed.function(function(index) {
                    return StringSource(string, myDescription, Range(myRange.start().add(index), myRange.end()));
                }),
                struct: $shed.function(function() {
                    return structs.create(StringSource, listOf(string, myDescription, myRange));
                })
            };
        });
        return $class;
    })().$define("StringSource");
    return {
        StringSource: StringSource
    };
});;

$shed.exportModule("lop.testing", function() {
    var sequences = $shed.js.import("sequences");
    var lazySequences = $shed.js.import("lazySequences");
    var strings = $shed.js.import("strings");
    var MatchResult = $shed.js.import("duck.MatchResult");
    var duck = $shed.js.import("duck");
    var Token = $shed.js.import("lop.token.Token");
    var Failure = $shed.js.import("lop.results.Failure");
    var isFailure = (function() {
        var $class = $shed.class(function() {
            var describeSelf = $shed.function(function() {
                return $shed.string("failure");
            }).$define("describeSelf");
            var matches = $shed.function(function(result) {
                return matchesWithDescription(result).matches();
            }).$define("matches");
            var describeMismatch = $shed.function(function(result) {
                return matchesWithDescription(result).mismatchDescription();
            }).$define("describeMismatch");
            var matchesWithDescription = $shed.function(function(result) {
                return result.isSuccess() ? MatchResult(false, $shed.string("was not failure, was ").concat(represent(result))) : MatchResult(true, $shed.string(""));
            }).$define("matchesWithDescription");
            return {
                $class: $class,
                describeSelf: describeSelf,
                matches: matches,
                describeMismatch: describeMismatch,
                matchesWithDescription: matchesWithDescription
            };
        });
        return $class;
    })()();
    var isFailureWithError = $shed.function(function(error) {
        return (function() {
            var $class = $shed.class(function() {
                var describeSelf = $shed.function(function() {
                    return $shed.string("failure with error: ").concat(represent(error));
                }).$define("describeSelf");
                var matches = $shed.function(function(result) {
                    return matchesWithDescription(result).matches();
                }).$define("matches");
                var describeMismatch = $shed.function(function(result) {
                    return matchesWithDescription(result).mismatchDescription();
                }).$define("describeMismatch");
                var matchesWithDescription = $shed.function(function(result) {
                    return not(result.isFailure()) ? MatchResult(false, $shed.string("was not failure, was ").concat(represent(result))) : (not(result.error().equals(error)) ? MatchResult(false, $shed.string("error was ").concat(represent(result.error()))) : MatchResult(true, $shed.string("")));
                }).$define("matchesWithDescription");
                return {
                    $class: $class,
                    describeSelf: describeSelf,
                    matches: matches,
                    describeMismatch: describeMismatch,
                    matchesWithDescription: matchesWithDescription
                };
            });
            return $class;
        })()();
    }).$define("isFailureWithError");
    var isErrorWithError = $shed.function(function(error) {
        return duck.equalTo(Failure(error, true));
    }).$define("isErrorWithError");
    var isSuccess = $shed.function(function(matcher) {
        return (function() {
            var $class = $shed.class(function() {
                var describeSelf = $shed.function(function() {
                    return $shed.string("success with value ").concat(matcher.describeSelf());
                }).$define("describeSelf");
                var matches = $shed.function(function(result) {
                    return matchesWithDescription(result).matches();
                }).$define("matches");
                var describeMismatch = $shed.function(function(result) {
                    return matchesWithDescription(result).mismatchDescription();
                }).$define("describeMismatch");
                var matchesWithDescription = $shed.function(function(result) {
                    return result.isSuccess() ? (not(matcher.matches(result.value())) ? MatchResult(false, $shed.string("value didn't match: ").concat(matcher.describeMismatch(result.value()))) : (not(sequences.isNil(result.remaining())) ? MatchResult(false, $shed.string("entire input was not consumed, remaining was: ").concat(strings.joinSequence($shed.string(", "), lazySequences.map(represent, result.remaining())))) : MatchResult(true, $shed.string("")))) : MatchResult(false, $shed.string("was not success, was ").concat(represent(result)));
                }).$define("matchesWithDescription");
                return {
                    $class: $class,
                    describeSelf: describeSelf,
                    matches: matches,
                    describeMismatch: describeMismatch,
                    matchesWithDescription: matchesWithDescription
                };
            });
            return $class;
        })()();
    }).$define("isSuccess");
    return {
        isFailure: isFailure,
        isFailureWithError: isFailureWithError,
        isErrorWithError: isErrorWithError,
        isSuccess: isSuccess
    };
});;

$shed.exportModule("lop.error", function() {
    var Error = (function() {
        var $class = $shed.class(function(expected, actual) {
            return {
                $class: $class,
                expected: $shed.function(function() {
                    return expected;
                }),
                actual: $shed.function(function() {
                    return actual;
                }),
                equals: $shed.function(function(other) {
                    return expected.equals(other.expected()) && actual.equals(other.actual());
                }),
                represent: $shed.function(function() {
                    return $shed.string("expected ").concat(expected).concat($shed.string(" but got ")).concat(actual);
                })
            };
        });
        return $class;
    })().$define("Error");
    return {
        Error: Error
    };
});;

$shed.exportModule("lop.rules", function() {
    var lazySequenceables = $shed.js.import("lazySequenceables");
    var sequenceables = $shed.js.import("sequenceables");
    var lazySequences = $shed.js.import("lazySequences");
    var sequences = $shed.js.import("sequences");
    var lists = $shed.js.import("lists");
    var tuples = $shed.js.import("tuples");
    var options = $shed.js.import("options");
    var Token = $shed.js.import("lop.token.Token");
    var ParseResult = $shed.js.import("lop.results.ParseResult");
    var Success = $shed.js.import("lop.results.Success");
    var Failure = $shed.js.import("lop.results.Failure");
    var Error = $shed.js.import("lop.error.Error");
    var results = (function() {
        var $class = $shed.class(function() {
            var success = $shed.function(function(value, remaining) {
                return Success(value, remaining);
            }).$define("success");
            var failure = $shed.function(function(expected, actual) {
                return Failure(Error(expected, actual), false);
            }).$define("failure");
            return {
                $class: $class,
                success: success,
                failure: failure
            };
        });
        return $class;
    })()();
    var Rule = (function() {
        var $class = $shed.class(function() {
            return {
                $class: $class
            };
        });
        return $class;
    })().$define("Rule");
    var firstOf = $shed.function(function(name, rules) {
        return $shed.function(function(tokens) {
            return (function() {
                var ruleResults = lazySequenceables.map($shed.function(function(rule) {
                    return rule(tokens);
                }), rules);
                var stops = lazySequenceables.filter($shed.function(function(result) {
                    return or(result.isSuccess(), result.isFatal());
                }), ruleResults);
                return sequenceables.head(stops).valueOrElse($shed.function(function() {
                    return withNextToken(tokens, $shed.function(function(token) {
                        return results.failure(name, describeToken(token));
                    }));
                }));
            })();
        });
    }).$define("firstOf");
    var tokenOfType = $shed.function(function(name) {
        return $shed.function(function(tokens) {
            return withNextToken(tokens, $shed.function(function(token) {
                return token.name().equals(name) ? (function() {
                    return results.success(token.value(), tokens.tail());
                })() : results.failure(name, describeToken(token));
            }));
        });
    }).$define("tokenOfType");
    var token = $shed.function(function(name, value) {
        return $shed.function(function(tokens) {
            return withNextToken(tokens, $shed.function(function(token) {
                return token.name().equals(name) && token.value().equals(value) ? results.success(token.value(), tokens.tail()) : results.failure(describeTokenNameAndValue(name, value), describeToken(token));
            }));
        });
    }).$define("token");
    var describeToken = $shed.function(function(token) {
        return describeTokenNameAndValue(token.name(), token.value());
    }).$define("describeToken");
    var describeTokenNameAndValue = $shed.function(function(name, value) {
        return name.concat($shed.string(" \"")).concat(value).concat($shed.string("\""));
    }).$define("describeTokenNameAndValue");
    var withNextToken = $shed.function(function(tokens, func) {
        return sequences.head(tokens).map(func).valueOrElse($shed.function(function() {
            return results.failure($shed.string("token"), $shed.string("end of token sequence"));
        }));
    }).$define("withNextToken");
    var map = $shed.function(function(rule, func) {
        return $shed.function(function(tokens) {
            return rule(tokens).map(func);
        });
    }).$define("map");
    var sequence = $shed.function(function() {
        return emptySequenceRule;
    }).$define("sequence");
    var noOpRule = $shed.function(function(tokens) {
        return results.success($shed.unit, tokens);
    });
    var SequenceRule = (function() {
        var $class = $shed.class(function(previousRule, nextRule, func, hasCut, nextCut) {
            var next = $shed.function(function(rule) {
                return append(rule, $shed.function(function(previousValues, _) {
                    return previousValues;
                }));
            }).$define("next");
            var capture = $shed.function(function(rule) {
                return append(rule, $shed.function(function(previousValues, nextValue) {
                    return previousValues.appendDestructive(nextValue);
                }));
            }).$define("capture");
            var append = $shed.function(function(rule, func) {
                return SequenceRule(tuple(), rule, func, nextCut, nextCut);
            }).$define("append");
            var cut = $shed.function(function() {
                return SequenceRule(previousRule, nextRule, func, hasCut, true);
            }).$define("cut");
            var tuple = $shed.function(function() {
                return $shed.function(function(tokens) {
                    return previousRule(tokens).bindWithRemaining($shed.function(function(previousValue, remaining) {
                        return (function() {
                            var nextResult = nextRule(remaining);
                            return nextResult.isFailure() && hasCut ? Failure(nextResult.error(), true) : nextResult.map($shed.function(function(nextValue) {
                                return func(previousValue, nextValue);
                            }));
                        })();
                    }));
                });
            }).$define("tuple");
            var sequenceMap = $shed.function(function(func) {
                return map(tuple(), pack(func));
            }).$define("sequenceMap");
            var head = $shed.function(function() {
                return map(tuple(), $shed.memberAccess(tuples, tuples.head));
            }).$define("head");
            return {
                $class: $class,
                next: next,
                capture: capture,
                cut: cut,
                tuple: tuple,
                map: sequenceMap,
                head: head
            };
        });
        return $class;
    })().$define("SequenceRule");
    var emptySequenceRule = SequenceRule(noOpRule, noOpRule, $shed.function(function(_, _2) {
        return tuple();
    }), false, false);
    var zeroOrMoreWithSeparator = $shed.function(function(rule, separator) {
        return map(zeroOrMoreWithSeparator2(rule, separator), $shed.memberAccess(lists, lists.sequenceToList));
    }).$define("zeroOrMoreWithSeparator");
    var zeroOrMoreWithSeparator2 = $shed.function(function(rule, separator) {
        return (function() {
            var separatorAndRule = map(sequence().next(separator).capture(rule).tuple(), $shed.memberAccess(tuples, tuples.head));
            return $shed.function(function(tokens) {
                return (function() {
                    var result = rule(tokens);
                    return result.isSuccess() ? (function() {
                        var remainingRule = zeroOrMore2(separatorAndRule);
                        var remainingResult = remainingRule(result.remaining());
                        return remainingResult.map($shed.function(function(remainingValues) {
                            return sequences.cons(result.value(), remainingValues);
                        }));
                    })() : failureToSuccess(result, results.success($shed.memberAccess(sequences, sequences.nil), tokens));
                })();
            });
        })();
    }).$define("zeroOrMoreWithSeparator2");
    var zeroOrMore = $shed.function(function(rule) {
        return map(zeroOrMore2(rule), $shed.memberAccess(lists, lists.sequenceToList));
    }).$define("zeroOrMore");
    var zeroOrMore2 = $shed.function(function(rule) {
        return $shed.function(function(tokens) {
            return (function() {
                var result = rule(tokens);
                return result.isSuccess() ? (function() {
                    var remainingResult = zeroOrMore2(rule)(result.remaining());
                    return remainingResult.isSuccess() ? results.success(sequences.cons(result.value(), remainingResult.value()), remainingResult.remaining()) : (remainingResult.isFatal() ? remainingResult : result.map($shed.memberAccess(sequences, sequences.singleton)));
                })() : failureToSuccess(result, results.success($shed.memberAccess(sequences, sequences.nil), tokens));
            })();
        });
    }).$define("zeroOrMore2");
    var failureToSuccess = $shed.function(function(result, success) {
        return result.isFailure() ? success : result;
    }).$define("failureToSuccess");
    var optional = $shed.function(function(rule) {
        return $shed.function(function(tokens) {
            return (function() {
                var result = rule(tokens);
                return result.isFailure() ? results.success($shed.memberAccess(options, options.none), tokens) : result.map($shed.memberAccess(options, options.some));
            })();
        });
    }).$define("optional");
    return {
        firstOf: firstOf,
        tokenOfType: tokenOfType,
        token: token,
        map: map,
        sequence: sequence,
        zeroOrMore: zeroOrMore,
        zeroOrMoreWithSeparator: zeroOrMoreWithSeparator,
        optional: optional
    };
});;

$shed.exportModule("lop.strings", function() {
    var StringSource = $shed.js.import("lop.sources.StringSource");
    var Range = $shed.js.import("lop.range.Range");
    var createStringSource = $shed.function(function(string, description) {
        return StringSource(string, description, Range($shed.number(0), string.length()));
    }).$define("createStringSource");
    return {
        createStringSource: createStringSource
    };
});;

$shed.exportModule("lop.pratt", function() {
    var lazySequences = $shed.js.import("lazySequences");
    var sequences = $shed.js.import("sequences");
    var rules = $shed.js.import("lop.rules");
    var results = $shed.js.import("lop.results");
    var Parser = (function() {
        var $class = $shed.class(function(name, prefixRules, infixRules) {
            var prefixRule = rules.firstOf(name, prefixRules);
            var leftAssociative = $shed.function(function(name) {
                return applyRules(infixRulesUntilExclusive(name));
            }).$define("leftAssociative");
            var rightAssociative = $shed.function(function(name) {
                return applyRules(infixRulesUntilInclusive(name));
            }).$define("rightAssociative");
            var rule = $shed.function(function() {
                return applyRules(infixRules.toSequence());
            }).$define("rule");
            var applyRules = $shed.function(function(applicableInfixRules) {
                return $shed.function(function(tokens) {
                    return prefixRule(tokens).bindWithRemaining(applyInfixRules(applicableInfixRules));
                });
            }).$define("applyRules");
            var applyInfixRules = $shed.function(function(applicableInfixRules) {
                return $shed.function(function(left, remaining) {
                    return (function() {
                        var applyInfixRule = $shed.function(function(infixRule) {
                            return infixRule.apply(remaining);
                        });
                        var infixResults = lazySequences.map(applyInfixRule, applicableInfixRules);
                        var terminalInfixResults = lazySequences.filter(isTerminalResult, infixResults);
                        return sequences.head(terminalInfixResults).map($shed.function(function(infixResult) {
                            return infixResult.map($shed.function(function(infix) {
                                return infix(left);
                            }));
                        })).map($shed.function(function(result) {
                            return result.bindWithRemaining(applyInfixRules(applicableInfixRules));
                        })).valueOrElse($shed.function(function() {
                            return results.success(left, remaining);
                        }));
                    })();
                });
            }).$define("applyInfixRules");
            var isTerminalResult = $shed.function(function(result) {
                return not(result.isFailure());
            }).$define("isTerminalResult");
            var infixRulesUntilInclusive = $shed.function(function(name) {
                return remainingInfixRulesUntil(name, infixRules.toSequence(), true);
            }).$define("infixRulesUntilInclusive");
            var infixRulesUntilExclusive = $shed.function(function(name) {
                return remainingInfixRulesUntil(name, infixRules.toSequence(), false);
            }).$define("infixRulesUntilExclusive");
            var remainingInfixRulesUntil = $shed.function(function(name, remainingRules, inclusive) {
                return sequences.head(remainingRules).map($shed.function(function(rule) {
                    return equal(rule.name(), name) ? (inclusive ? sequences.singleton(rule) : $shed.memberAccess(sequences, sequences.nil)) : sequences.cons(rule, remainingInfixRulesUntil(name, remainingRules.tail()));
                })).valueOrElse($shed.memberAccess(sequences, sequences.nil));
            }).$define("remainingInfixRulesUntil");
            return {
                $class: $class,
                leftAssociative: leftAssociative,
                rightAssociative: rightAssociative,
                rule: rule
            };
        });
        return $class;
    })().$define("Parser");
    var InfixRule = (function() {
        var $class = $shed.class(function(name, rule) {
            return {
                $class: $class,
                apply: rule,
                name: $shed.function(function() {
                    return name;
                })
            };
        });
        return $class;
    })().$define("InfixRule");
    return {
        parser: Parser,
        infix: InfixRule
    };
});;

$shed.exportModule("lop.range", function() {
    var Range = (function() {
        var $class = $shed.class(function(myStart, myEnd) {
            return {
                $class: $class,
                start: $shed.function(function() {
                    return myStart;
                }),
                end: $shed.function(function() {
                    return myEnd;
                }),
                equals: $shed.function(function(other) {
                    return myStart.equals(other.start()) && myEnd.equals(other.end());
                })
            };
        });
        return $class;
    })().$define("Range");
    return {
        Range: Range
    };
});;

$shed.exportModule("lop.token", function() {
    var structs = $shed.js.import("structs");
    var Token = (function() {
        var $class = $shed.class(function(name, value, source) {
            return {
                $class: $class,
                name: $shed.function(function() {
                    return name;
                }),
                value: $shed.function(function() {
                    return value;
                }),
                source: $shed.function(function() {
                    return source;
                }),
                struct: $shed.function(function() {
                    return structs.create(Token, listOf(name, value, source));
                })
            };
        });
        return $class;
    })().$define("Token");
    return {
        Token: Token
    };
});;

$shed.exportModule("lop.results", function() {
    var structs = $shed.js.import("structs");
    var ParseResult = (function() {
        var $class = $shed.class(function() {
            return {
                $class: $class
            };
        });
        return $class;
    })().$define("ParseResult");
    var success = $shed.function(function(value, remaining) {
        return Success(value, remaining);
    }).$define("success");
    var fatal = $shed.function(function(error) {
        return Failure(error, true);
    }).$define("fatal");
    var Failure = (function() {
        var $class = $shed.class(function(error, isFatal) {
            return {
                $class: $class,
                map: $shed.function(function() {
                    return Failure(error, isFatal);
                }),
                bindWithRemaining: $shed.function(function(func) {
                    return Failure(error, isFatal);
                }),
                isSuccess: $shed.function(function() {
                    return false;
                }),
                isFailure: $shed.function(function() {
                    return not(isFatal);
                }),
                isFatal: $shed.function(function() {
                    return isFatal;
                }),
                error: $shed.function(function() {
                    return error;
                }),
                struct: $shed.function(function() {
                    return structs.create(Failure, listOf(error, isFatal));
                })
            };
        });
        return $class;
    })().$define("Failure");
    var Success = (function() {
        var $class = $shed.class(function(myValue, myRemaining) {
            return {
                $class: $class,
                value: $shed.function(function() {
                    return myValue;
                }),
                remaining: $shed.function(function() {
                    return myRemaining;
                }),
                map: $shed.function(function(func) {
                    return Success(func(myValue), myRemaining);
                }),
                bindWithRemaining: $shed.function(function(func) {
                    return func(myValue, myRemaining);
                }),
                isSuccess: $shed.function(function() {
                    return true;
                }),
                isFailure: $shed.function(function() {
                    return false;
                }),
                isFatal: $shed.function(function() {
                    return false;
                }),
                struct: $shed.function(function() {
                    return structs.create(Success, listOf(myValue, myRemaining));
                })
            };
        });
        return $class;
    })().$define("Success");
    return {
        ParseResult: ParseResult,
        success: success,
        fatal: fatal,
        Failure: Failure,
        Success: Success
    };
});;

$shed.exportModule("duck", function() {
    var some = $shed.js.import("options.some");
    var none = $shed.js.import("options.none");
    var lists = $shed.js.import("lists");
    var sequenceables = $shed.js.import("sequenceables");
    var lazySequenceables = $shed.js.import("lazySequenceables");
    var strings = $shed.js.import("strings");
    var results = $shed.js.import("hat.results");
    var Matcher = (function() {
        var $class = $shed.class(function() {
            return {
                $class: $class
            };
        });
        return $class;
    })().$define("Matcher");
    var assertThat = $shed.function(function(value, matcher) {
        return matcher.matches(value) ? results.success() : results.failure($shed.string("Expected ").concat(matcher.describeSelf()).concat($shed.string("\nbut ")).concat(matcher.describeMismatch(value)));
    }).$define("assertThat");
    var EqualTo = (function() {
        var $class = $shed.class(function(value) {
            var describeSelf = $shed.function(function() {
                return represent(value);
            }).$define("describeSelf");
            var matches = $shed.function(function(other) {
                return equal(value, other);
            }).$define("matches");
            var describeMismatch = $shed.function(function(other) {
                return $shed.string("was ").concat(represent(other));
            }).$define("describeMismatch");
            var matchesWithDescription = $shed.function(function(other) {
                return MatchResult(matches(other), describeMismatch(other));
            }).$define("matchesWithDescription");
            return {
                $class: $class,
                describeSelf: describeSelf,
                matches: matches,
                describeMismatch: describeMismatch,
                matchesWithDescription: matchesWithDescription
            };
        });
        return $class;
    })().$define("EqualTo");
    var IsList = (function() {
        var $class = $shed.class(function(matchers) {
            var describeSelf = $shed.function(function() {
                return (function() {
                    var descriptions = matchers.map($shed.function(function(matcher) {
                        return matcher.describeSelf();
                    }));
                    return $shed.string("listOf(").concat(strings.join($shed.string(", "), descriptions)).concat($shed.string(")"));
                })();
            }).$define("describeSelf");
            var matches = $shed.function(function(other) {
                return matchesWithDescription(other).matches();
            }).$define("matches");
            var describeMismatch = $shed.function(function(other) {
                return matchesWithDescription(other).mismatchDescription();
            }).$define("describeMismatch");
            var matchesWithDescription = $shed.function(function(other) {
                return not(matchers.length().equals(other.length())) ? MatchResult(false, $shed.string("list was of length ").concat(other.length().toString()).concat($shed.string("\nwas: ")).concat(represent(other))) : matchesElementsWithDescription(other);
            }).$define("matchesWithDescription");
            var matchesElementsWithDescription = $shed.function(function(other) {
                return (function() {
                    var matchResults = lazySequenceables.map(pack(execMatcher), lists.zip(listRange($shed.number(0), matchers.length()), matchers, other));
                    var mismatches = lazySequenceables.concat(matchResults);
                    return sequenceables.head(mismatches).map($shed.function(function(mismatch) {
                        return MatchResult(false, mismatch);
                    })).valueOrElse($shed.function(function() {
                        return MatchResult(true, $shed.string(""));
                    }));
                })();
            }).$define("matchesElementsWithDescription");
            var execMatcher = $shed.function(function(index, matcher, other) {
                return matcher.matches(other) ? none : (function() {
                    var description = $shed.string("element at index ").concat(index.toString()).concat($shed.string(" did not match:")).concat($shed.string("\n  ")).concat(matcher.describeMismatch(other)).concat($shed.string("\n  expected ")).concat(matcher.describeSelf());
                    return some(description);
                })();
            }).$define("execMatcher");
            return {
                $class: $class,
                describeSelf: describeSelf,
                matches: matches,
                describeMismatch: describeMismatch,
                matchesWithDescription: matchesWithDescription
            };
        });
        return $class;
    })().$define("IsList");
    var anything = (function() {
        var $class = $shed.class(function() {
            return {
                $class: $class,
                describeSelf: $shed.function(function() {
                    return $shed.string("<anything>");
                }),
                matches: $shed.function(function(other) {
                    return true;
                }),
                describeMismatch: $shed.function(function(other) {
                    return $shed.string("");
                }),
                matchesWithDescription: $shed.function(function(other) {
                    return MatchResult(true, $shed.string(""));
                })
            };
        });
        return $class;
    })()();
    var MatchResult = (function() {
        var $class = $shed.class(function(matches, mismatchDescription) {
            return {
                $class: $class,
                matches: $shed.function(function() {
                    return matches;
                }),
                mismatchDescription: $shed.function(function() {
                    return mismatchDescription;
                })
            };
        });
        return $class;
    })().$define("MatchResult");
    return {
        Matcher: Matcher,
        assertThat: assertThat,
        MatchResult: MatchResult,
        equalTo: EqualTo,
        isList: IsList,
        anything: anything
    };
});;

$shed.exportModule("hat", function() {
    var promises = $shed.js.import("promises");
    var TestResult = (function() {
        var $class = $shed.class(function(errors) {
            var isSuccess = $shed.function(function() {
                return errors.isEmpty();
            }).$define("isSuccess");
            var getErrors = $shed.function(function() {
                return errors;
            }).$define("getErrors");
            return {
                $class: $class,
                isSuccess: isSuccess,
                getErrors: getErrors
            };
        });
        return $class;
    })().$define("TestResult");
    var AssertionError = (function() {
        var $class = $shed.class(function(description) {
            var getDescription = $shed.function(function() {
                return description;
            }).$define("getDescription");
            return {
                $class: $class,
                getDescription: getDescription
            };
        });
        return $class;
    })().$define("AssertionError");
    var results = (function() {
        var $class = $shed.class(function() {
            var success = $shed.function(function() {
                return TestResult(emptyList);
            }).$define("success");
            var failure = $shed.function(function(description) {
                return (function() {
                    var error = AssertionError(description);
                    return TestResult(listOf(error));
                })();
            }).$define("failure");
            var all = $shed.function(function(results) {
                return (function() {
                    var getErrors = $shed.function(function(result) {
                        return result.getErrors();
                    });
                    var concat = $shed.function(function(first, second) {
                        return first.concat(second);
                    });
                    var errors = results.map(getErrors).foldLeft(emptyList, concat);
                    return TestResult(errors);
                })();
            }).$define("all");
            return {
                $class: $class,
                success: success,
                failure: failure,
                all: all
            };
        });
        return $class;
    })()();
    var TestCase = (function() {
        var $class = $shed.class(function(description, func) {
            var getDescription = $shed.function(function() {
                return description;
            }).$define("getDescription");
            var run = $shed.function(function() {
                return func();
            }).$define("run");
            return {
                $class: $class,
                getDescription: getDescription,
                run: run
            };
        });
        return $class;
    })().$define("TestCase");
    var assertTrue = $shed.function(function(value) {
        return value ? results.success() : results.failure($shed.string("Expected true, got false"));
    }).$define("assertTrue");
    var assertFalse = $shed.function(function(value) {
        return not(value) ? results.success() : results.failure($shed.string("Expected false, got true"));
    }).$define("assertFalse");
    var assertEquals = $shed.function(function(expected, actual) {
        return expected.equals(actual) ? (function() {
            return results.success();
        })() : (function() {
            var message = $shed.string("Expected ").concat(represent(expected)).concat($shed.string(", got ")).concat(represent(actual));
            return results.failure(message);
        })();
    }).$define("assertEquals");
    var TestResults = (function() {
        var $class = $shed.class(function(results) {
            var add = $shed.function(function(result) {
                return TestResults(results.append(result));
            }).$define("add");
            var isSuccess = $shed.function(function() {
                return failures().isEmpty();
            }).$define("isSuccess");
            var numberOfTests = $shed.function(function() {
                return results.length();
            }).$define("numberOfTests");
            var failures = $shed.function(function() {
                return results.filter($shed.function(function(result) {
                    return not(result.isSuccess());
                }));
            }).$define("failures");
            return {
                $class: $class,
                add: add,
                isSuccess: isSuccess,
                numberOfTests: numberOfTests,
                failures: failures
            };
        });
        return $class;
    })().$define("TestResults");
    var runTestCases = $shed.function(function(testCases) {
        return (function() {
            var resultsPromise = promises.combineList(testCases.map(runTestCase));
            return resultsPromise.map($shed.function(function(results) {
                return results.foldLeft(TestResults(emptyList), combineResults);
            }));
        })();
    }).$define("runTestCases");
    var combineResults = $shed.function(function(results, result) {
        return results.add(result);
    }).$define("combineResults");
    var greenCode = $shed.string("\u001b[32m");
    var redCode = $shed.string("\u001b[31m");
    var blackCode = $shed.string("\u001b[39m");
    var runTestCase = $shed.function(function(testCase) {
        return (function() {
            var description = testCase.getDescription();
            var result = testCase.run();
            var resultPromise = promises.isPromise(result) ? result : promises.createFulfilledPromise(result);
            return resultPromise.map($shed.function(function(result) {
                return (function() {
                    result.isSuccess() ? (function() {
                        print(greenCode);
                        print($shed.string("✔ "));
                    })() : (function() {
                        print(redCode);
                        print($shed.string("✖ "));
                    })();
                    print(description);
                    print($shed.string(" "));
                    print(blackCode);
                    print($shed.string("\n"));
                    result.getErrors().forEach($shed.function(function(error) {
                        return (function() {
                            print(error.getDescription());
                            print($shed.string("\n\n"));
                        })();
                    }));
                    return result;
                })();
            }));
        })();
    }).$define("runTestCase");
    var run = $shed.function(function(argv) {
        return argv.forEach($shed.function(function(testModuleName) {
            return (function() {
                print($shed.string("Running tests: ").concat(testModuleName).concat($shed.string("\n")));
                var testCases = runtimeImport(testModuleName);
                var resultsPromise = runTestCases(testCases);
                resultsPromise.map($shed.function(function(results) {
                    return (function() {
                        results.isSuccess() ? printSuccess(results) : printFailure(results);
                        print($shed.string("\n"));
                    })();
                }));
            })();
        }));
    }).$define("run");
    var printSuccess = $shed.function(function(results) {
        return (function() {
            print(greenCode);
            print($shed.string("✔ "));
            print(results.numberOfTests().toString());
            print($shed.string(" test(s) passed\n"));
            print(blackCode);
        })();
    }).$define("printSuccess");
    var printFailure = $shed.function(function(results) {
        return (function() {
            var failures = results.failures();
            print(redCode);
            print($shed.string("✖ "));
            print(failures.length().toString());
            print($shed.string(" test failures\n"));
            print(blackCode);
        })();
    }).$define("printFailure");
    return {
        TestResult: TestResult,
        AssertionError: AssertionError,
        results: results,
        TestCase: TestCase,
        assertTrue: assertTrue,
        assertFalse: assertFalse,
        assertEquals: assertEquals,
        runTestCases: runTestCases,
        run: run
    };
});

$shed.js.import("shed.compiler.compilation.main")($shed.lists.createFromArray(process.argv.slice(2).map($shed.string)));
