var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

const jsonFile = require('jsonfile');
const config = jsonFile.readFileSync('./config.json');

process.env.PORT = config.port;
console.log("Running on port:", process.env.PORT);

const wsSrv = require('./ws-server');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
const apiRouter = require('./routes/api');

var app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);

app.use('/api', apiRouter);

module.exports = app;
