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
})();