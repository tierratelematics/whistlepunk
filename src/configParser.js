var colors = require( "colors" );
var _ = require( "lodash" );
var fs = require( "fs" );
var path = require( "path" );
var when = require( "when" );

//var builtIn = getAdapters();

function defaultConstraint( config ) {
	return function levelConstraint( data ) {
		return data.level <= config.level;
	};
}

function getAdapters() {
	var adapterPath = path.resolve( __dirname, "./adapters" );
	var files = fs.readdirSync( adapterPath );
	return _.reduce( files, function( acc, file ) {
		acc[ file.split( "." )[ 0 ] ] = path.join( adapterPath, file );
		return acc;
	}, {} );
}

function timeFormatter( config, data ) {
	var time = config.timestamp;
	if ( time ) {
		if ( time.local ) {
			data.utc.local();
		}
		return data.utc.format( time.format || "YYYY-MM-DDTHH:mm:ss.SSSZ" );
	} else {
		return data.timestamp;
	}
	return config.timeformat ? data.raw.format( config.format ) : data.timestamp;
}

function wireUp( adapterFsm, config, channel, adapter ) {

	var fsm;
	var init;
	var handler = adapter.onLog;

	if ( _.isFunction( adapter.init ) ) {
		init = adapter.init();

		if ( init && init.then ) {
			adapterFsm.register( adapter, init );
			handler = adapterFsm.onLog.bind( adapterFsm, adapter );
		}
	}

	var topics;
	if ( config.topic && _.isArray( config.topic ) ) {
		topics = config.topic;
	} else {
		topics = ( config.topic || "#" ).split( "," );
	}
	var subscriptions = _.map( topics, function( topic ) {
		return channel
			.subscribe( topic, handler )
			.constraint( adapter.constraint || defaultConstraint( config ) );
	} );
	if ( adapter.subscriptions ) {
		_.each( adapter.subscriptions, function( subscription ) {
			subscription.unsubscribe();
		} );
	}
	adapter.subscriptions = subscriptions;
}

var adapter, lastConfig;
function configure( config, formatter ) {
	if( adapter && lastConfig && _.eq( lastConfig, config ) ) {
		return;
	}
	lastConfig = config;
	var envDebug = !!process.env.DEBUG;

	var theme = _.extend( {
		info: "green",
		warn: "yellow",
		debug: "blue",
		error: "red"
	}, config.theme );

	var logType = {
		info: "info",
		warn: "warn",
		debug: "log",
		error: "error"
	};

	colors.setTheme( theme );

	return {
		onLog: function( data ) {
			var msg;
			if ( data.msg.toString() === "[object Object]" ) {
				msg = config.formatJSON ? JSON.stringify( data.msg, null, 2 ) : JSON.stringify( data.msg );
			} else {
				msg = data.msg;
			}
			var timestamp = formatter( config, data );
			console[logType[data.type]]( colors[ data.type ]( timestamp, "[" + data.namespace + "]" || "", msg ) );
		},
		constraint: function( data ) {
			return data.level <= config.level && ( !config.bailIfDebug || ( config.bailIfDebug && !envDebug ) );
		}
	};
}


module.exports = function( channel, config, fount ) {
	var adapterFsm = require( "./adapter.fsm" );

	return _.map( config.adapters, function( adapterCfg, name ) {
/*
		var adapterPath;
		if ( /[\/]/.test( name ) ) {
			adapterPath = require.resolve( path.resolve( process.cwd(), name ) );
		} else {
			adapterPath = builtIn[ name ] || require.resolve( name );
		}
*/
		var adapter = configure( adapterCfg, timeFormatter, fount );

		wireUp( adapterFsm, adapterCfg, channel, adapter );

		return adapter;
	} );
};
