
"use strict";

/**
 * Module dependencies.
 */

var fs = require('fs');
var express = require('express');
var path = require('path');
var http = require('http');
var Session = require('./lib/Session');
var ssl = require('./lib/ssl');

var app = express();
var server = http.createServer(app);
var io = require('socket.io').listen( server );

// all environments
app.set('port', process.env.PORT || 3333);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' === app.get('env')) {
  app.use(express.errorHandler());
}

io.sockets.on('connection', function(socket) {
    var s = new Session( socket );
});

ssl.ensureCertificate( 'certificate.key', 'certificate.cert', function ( err ) {
    if( err ) { throw err; }

    server.listen(app.get('port'), function(){
      console.log('Express server listening on port ' + app.get('port'));
    });
});
