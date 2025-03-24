var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
//var logger = require('morgan');

const jsonFile = require('jsonfile');
const config = jsonFile.readFileSync('./config.json');

process.env.PORT = config.port;
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
console.log("Running on port:", process.env.PORT);

const wsSrv = require('./ws-server');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
const apiRouter = require('./routes/api');
const apiMarket = require('./routes/market');

var app = express();

app.disable('x-powered-by');

app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

//app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);

app.use('/api', apiRouter);
app.use('/market', apiMarket);

module.exports = app;
