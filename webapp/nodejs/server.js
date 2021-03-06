var express = require('express');
var http    = require('http');
var path    = require('path');
var cluster = require('cluster');
var mysql   = require('mysql');
var filters = require('./filters');
var routes  = require('./routes');
var config  = require('./config');
var partials = require('express-partials');
var workers = 1;

global.users = {};
global.memos = {};

if (cluster.isMaster) {

    for (var i = 0, childProcesses = []; i < workers; i++) {
        childProcesses[i] = cluster.fork();
    }

    var signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
    for (s in signals) {
        process.on(signals[s], function() {
            for (var j in childProcesses) {
                childProcesses[j].process.kill();
            }
            process.exit(1);
        });
    }

    cluster.on('exit', function(worker) {
        console.log('worker %s died. restart...', worker.pid);
        // add child process
        var child = cluster.fork();
        childProcesses.push(child);
    });

} else {
    var app = express();

    app.configure('development', function () {
        app.use(express.logger('dev'));
        app.use(express.errorHandler());
    });

    app.configure(function () {
        var RedisStore = require('connect-redis')(express);
        var pool = mysql.createPool(config.database);
        app.set('port', process.env.PORT || 5000);
        app.set('view engine', 'ejs');
        app.use(partials());
        app.use(express.favicon());
        app.use(express.bodyParser());
        app.use(express.methodOverride());
        app.use('/favicon.ico', express.static(path.join(__dirname, 'public')));
        app.use('/css', express.static(path.join(__dirname, 'public/css')));
        app.use('/img', express.static(path.join(__dirname, 'public/img')));
        app.use('/js', express.static(path.join(__dirname, 'public/js')));
        app.use(express.cookieParser());
        app.use(express.session({
            secret: 'powawa',
            key: 'isucon_session',
            store: new RedisStore({})
        }));
        app.use(function(req, res, next) {
            pool.getConnection(function(err, connection) {
              res.locals.mysql = connection;
              next();
            });
        });
        app.use(function(req, res, next) {
          
          if (Object.keys(global.memos).length === 0) {
            res.locals.mysql.query('SELECT * FROM memos WHERE is_private=0 ORDER BY created_at DESC', function(err, _memos) {
              if (err) return next(err);
              global.memos = _memos;
              next();
            });
          }
          else {
            next();
          }
        });
        app.use(function(req, res, next) {
          if (Object.keys(global.users).length === 0) {
            res.locals.mysql.query('SELECT id, username FROM users', function(err, _users) {
              if (err) return next(err);
              _users.forEach(function(u) {
                users[u.id] = u.username;
              });
              next();
            });
          }
          else {
            next();
          }
        });
        app.use(function(req, res, next) {
            res.locals.uri_for = function(path) {
                var scheme = req.protocol;
                var host = req.get('X-Forwarded-Host');
	            if (!host) { host = req.get('Host'); }
                var base = scheme + '://' + host;
                return base + path;
            };
            next();
        });
        app.use(function(req, res, next) {
            res.is_halt = false;
            res.halt = function(status) {
                res.locals.mysql.release();
                res.is_halt = true;
                res.send(status);
            };
            next();
        });
        app.use(filters.session);
        app.use(filters.get_user);
        app.use(filters.require_user);
        app.use(filters.anti_csrf);
        app.use(app.router);
        app.locals.pretty = true;

        app.locals.greeting = 'Hello!';
        app.locals.site_name = "";
    });

    app.get('/', routes.index);
    app.get('/recent/:page', routes.recent);
    app.get('/signin', routes.signin);
    app.get('/mypage', routes.mypage);
    app.get('/memo/:id', routes.memo);

    app.post('/signin', routes.request_signin);
    app.post('/signout', routes.signout);
    app.post('/memo', routes.post_memo);

    http.createServer(app).listen(app.get('port'), function () {
        console.log("Express server listening on port " + app.get('port'));
    });
    
    process.on('uncaughtException', function(err) {
      console.log(err);
    });
}
