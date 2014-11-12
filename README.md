AsyncTask.js
============

An AsyncTask implementation for Javascript, similar to Android's AsyncTask. This lets you run functions on a worker thread without going through some of the normal hoops involved with doing so.

Example:
<pre>new AsyncTask(function(foo) {
  // Long running task
}).execute("bar");</pre>

'execute' returns a Promise that will resolve when the task does (and receives the value from the resolved function):
<pre>new AsyncTask(function(foo) {
  // Long running task
  return foo + "_inner";
}).execute("bar").then(function(foo) {
  // foo == "bar_inner" here
}).catch(function(err) {
  // Errors throw in the worker will appear here
});</pre>

You can also return a Promise in your worker if you need to do something not just long running, but also async:
<pre>new AsyncTask(function(foo) {
  // Long running task
  return new Promise(function(res, rej) { res(foo + "_inner"); }
}).execute("bar").then(function(foo) {
  // foo == "bar_inner" here
});</pre>

There is also a "progress" function injected into your worker's scope. Calls to it will post messages back to a listener registered in the ui-thread:
<pre>new AsyncTask(function(foo) {
  // Long running task
  progress(25);
  // Long running task
  progress(50);
  // Long running task
  progress(75);
  return new Promise(function(res, rej) { res(foo + "_inner"); }
}).progress(function(val) {
  document.getElementById("progress").setAttribute("value", val);
}).then(...).catch(...);</pre>

