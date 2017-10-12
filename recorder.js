var WORKER_PATH = './recorderWorker.js';

var Recorder = function(source, cfg){
  var config = cfg || {};
  var bufferLen = config.bufferLen || 4096;
  this.context = source.context;
  this.node = (this.context.createScriptProcessor ||
               this.context.createJavaScriptNode).call(this.context,
                                                       bufferLen, 2, 2);
  var worker = new Worker(WORKER_PATH);
  worker.onmessage = function(e){
    var blob = e.data;
    currCallback(blob);
  }

  var oldSampleRate = this.context.sampleRate;
  var newSampleRate = config.sampleRate || oldSampleRate;
    
  worker.postMessage({
    command: 'init',
    config: {
      sampleRate: newSampleRate
    }
  });
  var recording = false,
    currCallback;

  this.node.onaudioprocess = function(e){
    var leftData = e.inputBuffer.getChannelData(0);
    var rightData = e.inputBuffer.getChannelData(1);
    leftData = interpolateArray(leftData, leftData.length * (newSampleRate/oldSampleRate));
    rightData = interpolateArray(rightData, rightData.length * (newSampleRate/oldSampleRate));
    if (!recording) return;
    worker.postMessage({
      command: 'record',
      buffer: [
        leftData,
        rightData
      ]
    });
  };
  
  function interpolateArray(data, fitCount) {
    var linearInterpolate = function (before, after, atPoint) {
        return before + (after - before) * atPoint;
    };
    
    var newData = new Array();
    var springFactor = new Number((data.length - 1) / (fitCount - 1));
    newData[0] = data[0]; // for new allocation
    for ( var i = 1; i < fitCount - 1; i++) {
      var tmp = i * springFactor;
      var before = new Number(Math.floor(tmp)).toFixed();
      var after = new Number(Math.ceil(tmp)).toFixed();
      var atPoint = tmp - before;
      newData[i] = linearInterpolate(data[before], data[after], atPoint);
    }
    newData[fitCount - 1] = data[data.length - 1]; // for new allocation
    return newData;
  };

  this.configure = function(cfg){
    for (var prop in cfg){
      if (cfg.hasOwnProperty(prop)){
        config[prop] = cfg[prop];
      }
    }
  }

  this.record = function(){
    recording = true;
  }

  this.stop = function(){
    recording = false;
  }

  this.clear = function(){
    worker.postMessage({ command: 'clear' });
  }

  this.getBuffer = function(cb) {
    currCallback = cb || config.callback;
    worker.postMessage({ command: 'getBuffer' })
  }

  this.exportWAV = function(cb, type){
    currCallback = cb || config.callback;
    type = type || config.type || 'audio/wav';
    if (!currCallback) throw new Error('Callback not set');
    worker.postMessage({
      command: 'exportWAV',
      type: type
    });
  }

  source.connect(this.node);
  this.node.connect(this.context.destination);    //this should not be necessary
};

Recorder.forceDownload = function(blob, filename){
  var url = (window.URL || window.webkitURL).createObjectURL(blob);
  var link = window.document.createElement('a');
  link.href = url;
  link.download = filename || 'output.wav';
  var click = document.createEvent("Event");
  click.initEvent("click", true, true);
  link.dispatchEvent(click);
}

module.exports = Recorder;
