var config  = require('../config');
var filters = require('../filters');
var async   = require('async');
var crypto  = require('crypto');
var marked    = require('marked');

exports.index = function(req, res) {
    if (res.is_halt) { return; }

    var memos = global.memos.slice(0, 100);
    memos.forEach(function(memo) {
      memo.username = global.users[memo.user];
    });

    res.locals.mysql.release();
    res.render('index.ejs', {
        memos: memos,
        page:  0,
        total: global.memos.length
    });
};

exports.recent = function(req, res) {
    if (res.is_halt) { return; }

    var page = req.params.page;

    var memos = global.memos.slice(page * 100, page * 100 + 100);
    memos.forEach(function(memo) {
      memo.username = global.users[memo.user];
    });

    res.locals.mysql.release();
    res.render('index.ejs', {
        memos: memos,
        page:  0,
        total: global.memos.length
    });
};

exports.signin = function(req, res) {
    if (res.is_halt) { return; }

    res.locals.mysql.release();
    res.render('signin.ejs');
};

exports.signout = function(req, res) {
    if (res.is_halt) { return; }

    req.session.user_id = null;
    res.locals.mysql.release();
    res.cookie('isucon_session', '', { expires: new Date(Date.now() - 10), httpOnly: true });
    res.redirect('/');
};

exports.request_signin = function(req, res) {
    if (res.is_halt) { return; }

    var client = res.locals.mysql;
    var username = req.body.username;
    var password = req.body.password;

    client.query(
        'SELECT id, username, password, salt FROM users WHERE username=?',
        [ username ],
        function(err, results) {
            if (err) { throw err; }
            var user = results[0];

            if (user && user.password ==
                crypto.createHash('sha256').update(user.salt + password).digest("hex")){
                req.session.regenerate(function(err) {
                    if (err) { throw err; }
                    req.session.user_id = user.id;
                    req.session.token = crypto.createHash('sha256').
                        update(Math.random().toString()).digest("hex");
                    req.session.save(function(err) {
                        if (err) { throw err; }
                        client.query(
                            'UPDATE users SET last_access=now() WHERE id=?',
                            [ user.id ],
                            function(err, results) {
                                if (err) { throw err; }
                                res.locals.mysql.release();
                                res.redirect('/mypage');
                            }
                        );
                    });
               });
            } else {
                res.locals.mysql.release();
                res.redirect('/signin');
            }
        }
    );
};


exports.mypage = function(req, res) {
    if (res.is_halt) { return; }

    var client = res.locals.mysql;
    client.query(
        'SELECT id, content, is_private, created_at, updated_at FROM memos WHERE user=? ORDER BY created_at DESC',
        [ res.locals.user.id ],
        function(err, results) {
            if (err) { throw err; }
            res.locals.mysql.release();
            res.render('mypage.ejs', { memos: results });
        }
    );
};

exports.post_memo = function(req, res) {
    if (res.is_halt) { return; }

    var client = res.locals.mysql;
    client.query(
        'INSERT INTO memos (user, content, is_private, created_at) VALUES (?, ?, ?, now())',
        [
            res.locals.user.id,
            req.body.content,
            req.body.is_private != 0 ? 1 : 0
        ],
        function(err, info) {
            if (err) { throw err; }
            var memo_id = info.insertId;
            client.query('select * from memos where id=?', [memo_id], function(err, memo) {
              if (memo[0].is_private === 0) {
                global.memos.unshift(memo[0]);
              }
              res.locals.mysql.release();
              res.redirect('/memo/' + memo_id);
            });
        }
    );
};

exports.memo = function(req, res) {
    if (res.is_halt) { return; }

    var user = res.locals.user;
    var client = res.locals.mysql;
    var memo;
    async.waterfall([
        function(cb) {
            client.query(
                'SELECT id, user, content, is_private, created_at, updated_at FROM memos WHERE id=?',
                [ req.params.id ],
                cb
            );
        },
        function(results, fields, cb) {
            memo = results[0];
            if (!memo) {
                res.halt(404);
                return;
            }
            if (memo.is_private) {
                if ( !user || user.id != memo.user ) {
                    res.halt(404);
                    return;
                }
            }

            cb(null, marked(memo.content));
        },
        function(html, cb) {
            if (res.is_halt) {
                cb();
                return;
            }
            memo.content_html = html;
            memo.username = global.users[memo.user];

            var cond;
            if (user && user.id == memo.user) {
                cond = "";
            } else {
                cond = "AND is_private=0";
            }

            client.query(
                "SELECT * FROM memos WHERE user=? " + cond + " ORDER BY created_at",
                [ memo.user ],
                cb
            );
        },
        function(results, fields, cb) {
            if (res.is_halt) {
                cb();
                return;
            }
            var memos = results;

            var newer;
            var older;
            memos.forEach(function(e, i) {

                if (memos[i].id == memo.id) {
                    if (i > 0) {
                      older = memos[i - 1];
                    }
                    if (i < memos.length) {
                      newer = memos[i + 1];
                    }
                }
            });


            res.locals.mysql.release();
            res.render('memo.ejs', {
                memo:  memo,
                older: older,
                newer: newer
            });
        }
    ]);
};
