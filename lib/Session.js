
var fs = require('fs');
var mumble = require('mumble');

var CODECS = {
    '0': 'Celt 0.7.0',
    '1': 'Ping - NOT VOICE',
    '2': 'Speex',
    '3': 'CELT 0.11.0',
    '4': 'Opus'
};

var mumbleConnections = {};
var mumbleOptions = null;

var Session = function( sio, id ) {
    this.socket = sio;
    this.voiceSession = {};

    sio.on('disconnect', this.disconnect.bind(this) );
    sio.on('url', this.url.bind(this) );
    sio.on('attach', this.attach.bind(this) );

    var self = this;
    sio.on('disconnect-mumble', function () {
        if( self.client ) {
            self.client.disconnect();
            self.client = null;
        }
    });
};

var getMumbleOptions = function() {
    if( mumbleOptions ) { return mumbleOptions; }

    mumbleOptions = {
        key: fs.readFileSync( 'certificate.key' ),
        cert: fs.readFileSync( 'certificate.cert' ),
        celtVersions: [
            mumble.celtVersions.v0_7_0,
            mumble.celtVersions.v0_11_0
        ]
    };

    return mumbleOptions;
}

Session.prototype.attach = function( id, callback ) {
    if( id && mumbleConnections[ id ]) {
        this.client = mumbleConnections[ id ];
        this.client.references++;

        callback({ key: id, users: this.client.users, state: this.client.state });
        this.registerHandlers();
    } else {
        this.socket.emit( 'error', 'Unknown session ID: ' + id );
    }
}

Session.prototype.url = function( url ) {
    var self = this;
    mumble.connect( url, getMumbleOptions(), function ( err, connection ) {
        if( err ) { return self.socket.emit( 'error', err ); }

        var id = Date.now();
        mumbleConnections[ id ] = connection;
        connection.references = 1;
        connection.state = {};
        connection.id = id;
        self.client = connection;
        if( !connection.authSent ) {
            connection.authenticate('Debugger');
        }

        self.socket.emit( 'mumble-connected', { key: id, users: self.client.users, state: self.client.state });
        self.registerHandlers();
    });
};

Session.prototype.disconnect = function() {
    if( this.client ) {
        this.client.references--;
        if( this.client.references <= 0 ) {
            console.log( "Last connection closed. Disconnecting client." );
            this.client.disconnect();
            delete mumbleConnections[ this.client.id ];
        }
    }
};

Session.prototype.registerHandlers = function () {
    var self = this;

    this.client.on( 'disconnect', function() {
        self.client.state['(Disconnected)'] = true;
        self.socket.emit( 'mumble-disconnected' ); 
        self.socket.emit( 'state-update', self.client.state );
    });

    this.client.on( 'user-update', function( user ) {
        console.dir( user );
        self.socket.emit( 'user-update', user );
    });
    this.client.on( 'protocol-in', function ( evt ) {
        if( evt.type === 'Ping' ) { return; }

        self.updateState( evt.type, evt.message );
        self.socket.emit( 'protocol-in', evt );
    });
    this.client.on( 'protocol-out', function ( evt ) {
        if( evt.type === 'Ping' ) { return; }
        self.socket.emit( 'protocol-out', evt );
    });

    this.client.on( 'voice-end', this.endVoiceSession.bind( this ) );
    this.client.on( 'voice-frame', this.updateVoiceSession.bind( this ) );

    this.client.on( 'error', function ( evt ) {
        self.socket.emit( 'error', evt.type + ': ' + evt.reason );
    });

    // We'll emit the voice-start by ourselves when we create a new voice session.
    // this.client.on( 'voice-start', this.socket.emit.bind( this.socket ) );
};

Session.prototype.updateState = function( type, data ) {
    switch( type ) {
        case 'CodecVersion':
            this.client.state.CodecCeltAlpha = data.alpha;
            this.client.state.CodecCeltBeta = data.beta;
            this.client.state.CodecPreferAlpha = data.preferAlpha;
            break;
        case 'Version':
            this.client.state.Version = '0x' + data.version.toString(16);
            this.client.state.VersionRelease = data.release;
            this.client.state.VersionOS = data.os;
            this.client.state.VersionOSVersion = data.osVersion;
            break;
        case 'ServerConfig':
            this.client.state.ConfigHTML = data.allowHtml;
            this.client.state.ConfigMessageLength = data.messageLength;
            this.client.state.ConfigImageLength = data.imageMessageLength;
            break;

        default:
            return;
    }

    this.socket.emit( 'state-update', this.client.state );
};

Session.prototype.updateVoiceSession = function( frames ) {
    for( var f in frames ) {
        var session = frames[f].session;
        var codec = frames[f].codec;
        var vs = this.voiceSession[ session ];

        // If there is a current voice session with different codec, finish that one.
        if( vs && vs.codec !== codec ) {
            this.endVoiceSession({ session: session });
            vs = null;
        }

        if( !vs ) {
            this.voiceSession[ session ] = { length: 1, codec: codec };
            this.socket.emit( 'voice-start', {
                session: session,
                codec: codec,
                codecName: CODECS[ '' + codec ] || 'Unknown',
                name: this.client.users[ session ].name,
                talking: true
            });
        } else {
            // This is part of ongoing voice session. Increment the length.
            vs.length++;
        }
    }
};

Session.prototype.endVoiceSession = function( event ) {
    var session = event.session;
    var voiceSession = this.voiceSession[ session ];

    var duration = voiceSession.length * this.client.FRAME_LENGTH;
    var type = voiceSession.type;
    this.socket.emit( 'voice-end', {
        session: session,
        name: this.client.users[ session ].name,
        duration: duration,
        talking: false,
    });

    delete this.voiceSession[ session ];
};

module.exports = Session;

