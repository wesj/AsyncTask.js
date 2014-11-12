(function() {

window.AsyncTask = function (fun, name, progress) {
    if (!name) name = "fun";
    if (!progress) progress = "progress";

    this.func = "var " + progress + " = " + this._internalProgress.toString() + "\n" +
           "var onError = " + this._internalOnError.toString() + "\n" +
           "var " + name + " = " + fun.toString() + "\n" +
           "var onmessage = " + this._internalOnMessage.toString().replace(/__name__/g, name) + "\n";

    if (Worker && this.WORKERS_ENABLED) {
        var uri = "data:text/javascript;base64," + btoa(this.func);
        this.worker = new Worker(uri);
        this.worker.onmessage = this.onMessage.bind(this);
    } else {
        this.fun = fun;
    }

    this._progressListeners = [];
}

window.AsyncTask.prototype = {
    WORKERS_ENABLED: true,

    _internalProgress: function(msg) {
      //console.log("_internalProgress: " + msg);
        var s = { status: 'progress', res: msg};
        postMessage(s);
    },

    _internalOnError: function(ex) {
        var s = { status: 'complete' };
        s.status = 'error';
        s.errorType = ex.name;
        s.error = ex.message || ex;
        postMessage(s);
    },

    _internalOnMessage: function(msg) {
        var s = { status: 'complete' };
        try {
            Promise.all([__name__.apply(null, msg.data)])
                .then(function(res) {
                   s.res = res[0];
                   postMessage(s);
               }).catch(function(ex) {
                   onError(ex);
               });
        } catch (ex) {
            onError(ex);
        }
    },

    onMessage: function(msg) {
        var status = msg.data.status;
        if (status === "progress") {
            this._progressListeners.forEach(function(listener) {
                listener(msg.data.res);
            });
        } else if (status === "complete") {
            this.resolve(msg.data.res);
        } else if (status === "error") {
            if (msg.data.errorType) {
                this.reject(new window[msg.data.errorType](msg.data.error));
            } else {
                this.reject(new Error(msg.data.error));
            }
        }
    },

    _internalPostMessage: function(msg) {
        var event = new Event('message');
        event.data = msg;
        finalPostMessage(event);
    },

    execute: function() {
        var self = this;
        var args = arguments;
        var p = new Promise(function(resolve, reject) {
            self.resolve = resolve;
            self.reject = reject;

            var a = [];
            for (var i = 0; i < args.length; i++) {
              // Try to do some work to make the sync apis work like the Worker ones. Can't be perfect, but we can try!
              if (args[i] instanceof HTMLElement || args[i] instanceof HTMLDocument) {
                // console.log("Don't pass elements...");
              } else {
                a.push(args[i]);
              }
            }

            if (self.worker && self.WORKERS_ENABLED) {
                self.worker.postMessage(a);
            } else if (self.fun) {
                setTimeout((function() {
                  var f = this.func + "\n" +
                       "var document = null;\n" + // Can't access the document in workers or here...
                       "var postMessage = " + this._internalPostMessage.toString() + "\n" +
                       "var finalPostMessage = (" + self.onMessage.toString() + ").bind(self);\n" +
                       "var event = new Event('message')\n" +
                       "event.data = a\n" +
                       "onmessage(event);";
                  eval(f);
                }).bind(self), 0);
            } else {
                throw "We don't seem to have anything to run...";
            }
        });

        p.progress = function(listener) {
            self._progressListeners.push(listener);
            return p;
        }

        return p;
    }
}

var testFun1 = function(endVar, prog) {
    for (var i = 0; i < endVar; i++) {
        if (i % prog === 0) {
            progress(i);
        }
    }
    return "DONE!";
}

var failures = 0;
var passes = 0;
function pass(msg) {
    passes++;
}

function fail(msg) {
    console.log("FAIL: " + msg);    
    failures++;
}

function ok(a, msg) {
    if (a) pass(msg);
    else fail(msg);
}

function is(a, b, msg) {
    if (a === b) pass(msg);
    else fail(msg + "(Got '" + a + "' expected '" + b + "')");
}

function runTests() {
    var progressCount = 0;
    var prev = -1;
    var foo = function() { return 10; }

    return Promise.all([
        new AsyncTask(testFun1).execute(10000000, 100000)
            .progress(function(msg) {
                progressCount++;
                is(msg % 10, 0, "Progress messages are correct");
                ok(msg > prev, "Progress messages are increasing: " + msg + " > " + prev);
                prev = msg;
            }).then(function(d) {
                is(d, "DONE!", "Got expected message");
                is(progressCount, 100, "Got expected progress events");
                ok(true, "Completed");
            }).catch(function(d) { ok(false, "Should not have failed: " + d); }),

        new AsyncTask(function() { throw ("This should fail"); })
            .execute()
            .then(function(d) { ok(false, "Should have failed 10"); })
            .catch(function(d) {
                ok(true, "Should have failed 1");
                is(d.toString(), "Error: This should fail", "Failure message is correct");
                ok(d instanceof Error, "Failure message is an error");
            }),

        new AsyncTask(function() { document.getElementById("Foo"); })
            .execute()
            .then(function(d) { ok(false, "Should have failed 9"); })
            .catch(function(d) {
                ok(true, "Should have failed 2");
                // is(d.toString(), "ReferenceError: document is not defined", "Failure message is correct");
                ok(d instanceof Error, "Failure message is an error");
            }),

        new AsyncTask(function(doc) { doc.getElementById("Foo"); })
            .execute(document)
            .then(function(d) { ok(false, "Should have failed 8"); })
            .catch(function(d) {
                ok(true, "Should have failed 3");
                //is(d.toString(), "DataCloneError: The object could not be cloned.", "Failure message is correct");
                ok(d instanceof Error, "Failure message is an error");
          }),

        new AsyncTask(function() { return foo(); })
            .execute()
            .then(function(d) { ok(false, "Should have failed 7"); })
            .catch(function(d) {
                ok(true, "Should have failed 4");
                is(d.toString(), "ReferenceError: foo is not defined", "Failure message is correct");
                ok(d instanceof ReferenceError, "Failure message is an error");
            }),

        new AsyncTask(function() {
            return new Promise(function(resolve, reject) {
                setTimeout(resolve, 100, "DONE!");
            });
        }).execute()
          .then(function(d) {
              is(d, "DONE!", "Got expected message");
              ok(true, "Completed");
          }).catch(function(d) { ok(false, "Should not have failed"); }),

        new AsyncTask(function() {
            return new Promise(function(resolve, reject) {
                setTimeout(reject, 100, "This should fail");
            });
        }).execute()
          .then(function(d) { ok(false, "Should have failed 5"); })
          .catch(function(d) {
              ok(true, "Should have failed 6");
              is(d.toString(), "Error: This should fail", "Failure message is correct");
              ok(d instanceof Error, "Failure message is an error");
          }),
    ]);
}

if (true) {
    console.log("Starting tests");
	AsyncTask.prototype.WORKERS_ENABLED = true;
	runTests().then(function() {
	    AsyncTask.prototype.WORKERS_ENABLED = false;
	    return runTests();
	}).then(function() {
	    console.log("Tests finished. " + passes + " Passed. " + failures + " Failed.");
	});
}

})();