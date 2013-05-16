
"use strict";

var spawn = require('child_process').spawn;
var fs = require('fs');

var ensureCertificate = function( privateFile, publicFile, done ) {
    ensurePrivateKey( privateFile, function( err ) {
        if( err ) { return done( err ); }
        ensurePublicKey( privateFile, publicFile, done );
    });
};

var ensurePrivateKey = function( privateFile, done ) {
    fs.exists( privateFile, function( exists ) {
        if( exists ) { return done(); }

        var proc = 'openssl';
        var args = [ 'genrsa', '-out', privateFile, '1024' ];
        var openssl = spawn( proc, args );

        openssl.on( 'exit', function( code, signal ) {
            if( code !== 0 ) {
                return done( new Error(
                    'Failed to generate certificate request.' +
                    '\nArguments: ' + args.join(' ') +
                    '\nExit code: ' + code ) );
            }

            done();
        });

        openssl.stdout.pipe( process.stdout );

    });
};

var ensurePublicKey = function( privateFile, publicFile, done ) {
    fs.exists( publicFile, function( exists ) {
        if( exists ) { return done(); }

        ensureCsr( privateFile, publicFile + '.csr', function( err ) {
            if( err ) { return done( err ); }

            // Create certificate request
            var proc = 'openssl';
            var args = [ 'x509', '-req', '-in', publicFile + '.csr', '-signkey', privateFile, '-out', publicFile ];
            var openssl = spawn( proc, args );

            openssl.on( 'exit', function( code, signal ) {
                if( code !== 0 ) {
                    return done( new Error(
                        'Failed to generate certificate request.' +
                        '\nArguments: ' + args.join(' ') +
                        '\nExit code: ' + code ) );
                }

                fs.unlink( publicFile + '.csr' );
                done();
            });

            openssl.stdout.pipe( process.stdout );
        });
    });
};

var ensureCsr = function( privateFile, csrFile, done ) {

    // Create certificate request
    var proc = 'openssl';
    var args = [ 'req', '-new',
        '-subj', '/CN=Debugger',
        '-key', privateFile,
        '-out', csrFile ];
    var openssl = spawn( proc, args );

    openssl.on( 'exit', function( code, signal ) {
        if( code !== 0 ) {
            return done( new Error(
                'Failed to generate certificate request.' +
                '\nArguments: ' + args.join(' ') +
                '\nExit code: ' + code ) );
        }

        done();
    });

    openssl.stdout.pipe( process.stdout );
};

module.exports = {
    ensureCertificate: ensureCertificate,
    ensurePrivateKey: ensurePrivateKey,
    ensurePublicKey: ensurePublicKey,
    ensureCsr: ensureCsr
};
