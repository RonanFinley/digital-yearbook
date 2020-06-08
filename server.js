require('dotenv').config();
// server.js
// where your node app starts

// init project
const express = require("express");
const bodyParser = require("body-parser");
const session = require('express-session')
const ejs = require('ejs');
const app = express();
app.use(session({secret: process.env.SECRET, resave: true, saveUninitialized: true}));
const fs = require("fs");
const bcrypt = require("bcryptjs");
const mail = require("./apis/email.js");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.set('view engine', 'ejs');

// we've started you off with Express,
// but feel free to use whatever libs or frameworks you'd like through `package.json`.

// http://expressjs.com/en/starter/static-files.html
app.use(express.static("public"));

//mail.sendAuth("ronan.finley@s.stemk12.org", "test");

// init sqlite db
const dbFile = "./.data/sqlite.db";
const exists = fs.existsSync(dbFile);
const Database = require("better-sqlite3");
const db = new Database(dbFile, { verbose: console.log });

// http://expressjs.com/en/starter/basic-routing.html
app.get("/", (request, response) => {
  var isigned = [];
  var mybook = [];
  if(request.session.hasOwnProperty('acct') && request.session.loggedin==true) {
    isigned = db.prepare("SELECT * FROM signatures INNER JOIN users ON owner = users.id WHERE author = ?;").all(request.session.acct.id);
    mybook = db.prepare("SELECT * FROM signatures INNER JOIN users ON author = users.id WHERE owner = ?;").all(request.session.acct.id)
  }
  
  response.render('index', {login: request.session, loginerror: null, isigned: isigned, mybook: mybook});
});

//handle submissions
app.post("/submit", (request, response) => {
  if(!request.body.tof || !request.body.tol) {
    response.status(400).send("Fields were not entered correctly. Try again");
    return;
  }
  if(request.session.loggedin!=true) {
    response.redirect('/');
    return;
  }
  
  //verify user
  var usr = db.prepare("SELECT * FROM users WHERE Lower(fname) = Lower(?) AND Lower(lname) = Lower(?)").get(request.body.tof,request.body.tol);
  if(usr!==undefined) {
    //user exists
    db.prepare("INSERT INTO signatures(owner, author, comment) VALUES(?,?,?)").run(usr.id,request.session.acct.id,(!request.body.comment?null:request.body.comment));
    response.redirect(`/profile/${usr.fname}/${usr.lname}/`);
  } else {
    response.status(400).send("User does not exist or is not signed up");
  }
});

//handle reports
app.get("/report/:owner/:author/", (request, response) => {
  response.render('report', {author: request.params.author, owner: request.params.owner});
});
app.post("/submitReport", (request, response) => {
  if(!request.body.owner||!request.body.author||!request.body.reason) {
    response.status(400).send("Fields were not entered correctly. Try again");
    return;
  }
  db.prepare("INSERT INTO reports(owner, author, reason) VALUES(?,?,?)").run(request.body.owner,request.body.author,request.body.reason);
  response.send("Report submitted! Thank you for keeping the Yearbooks safe! <a href=\"/\">Dashboard</a>");
});

app.post("/search", (request, response) => {
  if(!request.body.email) {
    response.status(400).send("Fields were not entered correctly. Try again");
    return;
  }
  var findUser = db.prepare("SELECT * FROM users WHERE Lower(email) = Lower(?)").get(request.body.email);
  if(findUser==undefined) {
    response.status(200).send("User does not exist or is not signed up. Go invite them!");
  } else {
    response.redirect(`/profile/${findUser.fname}/${findUser.lname}`);
  }
});

//handle settings
app.post("/settings", (request, response) => {
  if(!request.session.loggedin) {
    response.redirect(`/`);
    return;
  }
  console.log(request.body)
  var publicProfile = request.body.hasOwnProperty('publicProfile')&&request.body.publicProfile=='on'?1:0;
  var publicComments = request.body.hasOwnProperty('publicComments')&&request.body.publicComments=='on'?1:0;
  db.prepare("UPDATE users SET publicComments = ?, publicProfile = ? WHERE id = ?").run(publicComments, publicProfile, request.session.acct.id);
  request.session.acct.publicComments = publicComments;
  request.session.acct.publicProfile = publicProfile;
  response.redirect(`/`);
});

//handle profiles
app.get('/profile/:fname/:lname/', (request, response) => {
  console.log(request.session);
  var prof = request.params;
  if(prof.fname&&prof.lname) {
    var profile = db.prepare('SELECT * FROM users WHERE Lower(fname) = Lower(?) AND Lower(lname) = Lower(?)').get(prof.fname, prof.lname);
    if(!profile) {
      response.status(404).send("User does not exist or is not signed up");
      return;
    }
    var comments = false;
    if(profile.publicProfile===1 || request.session.acct.student==0) {
      comments = db.prepare('SELECT * FROM signatures LEFT JOIN users ON users.id = signatures.author WHERE signatures.owner = ?').all(profile.id);
    } else {
      comments = db.prepare('SELECT * FROM signatures WHERE signatures.owner = ?').all(profile.id).length;
    }
    
    var alreadySigned = -1;
    if(request.session.loggedin==true)
      alreadySigned = db.prepare('SELECT * FROM signatures WHERE owner = ? AND author = ?').get(profile.id, request.session.acct.id)?true:false;
    
    response.render('profile', {profile: profile, viewer: request.session, comments: comments, signed: alreadySigned});
    
  } else {
    response.status(400).send("Something went wrong. You may have typed the link incorrectly.");
  }
});


let crypto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

app.post("/signup", handleSignup);
app.get("/signup", handleSignup);

function handleSignup( request, response ) {
  console.log(request.body);
  if(request.body.passwd) {
    if( ( request.body.fname && ( request.body.fname.length<2 || request.body.fname.length>20 ) ) || request.body.passwd.length<8 || !request.body.key) {
      response.status(400).send("Something went wrong. Make sure you filled out the form correctly.");
      return;
    }
    //get data from database by key
    var user = db.prepare("SELECT * FROM emails WHERE key = ?").get(request.body.key);
    if(!user) {
      response.status(400).send("Something went wrong. The link may have expired or been used");
      return;
    }
    var name = user.email.substring(0,user.email.indexOf("@")).split(".");
    var fname;
    if(!request.body.fname) {
      fname = name[0].split("");
    } else {
      fname = request.body.fname.split("");
    }
    fname[0] = fname[0].toUpperCase();
    fname = fname.join("");
    
    var lname = name[1].split("");
    lname[0] = lname[0].toUpperCase();
    lname = lname.join("");
    
    var student = 1;
    if(/\w+\.\w+@s\.stemk12.org/.test(request.body.email)) {
      student = 0;
    }
    //hash pass
    bcrypt.hash(request.body.passwd, 10, function(err, hash) {
      //insert into database
      var id = db.prepare("INSERT INTO users(fname, lname, email, password, student, publicProfile, publicComments) VALUES(?,?,?,?,?,?,?)").run(fname, lname, user.email, hash, student, 0, 1).lastInsertRowid;
      request.session.id = id;
      request.session.fname = request.body.fname;
      request.session.lname = user.lname;
      request.session.student = (student==1);
      request.session.publicComments = 1;
      request.session.publicProfile = 2;
      request.session.loggedin = true;
      db.prepare("DELETE FROM emails WHERE key = ?").run(request.body.key);
      response.redirect('/');
    });
    
    
  } else if(request.body.email) {
    //double check STEM email
    if(!/\w+\.\w+@(s\.)?stemk12.org/.test(request.body.email)) {
      response.render('index', {login: null, loginerror:null});
      return;
    }
    
    //check if email is already registered
    if(db.prepare('SELECT * FROM users WHERE email = ?').get(request.body.email)) {
      response.render('email', {login: true});
      return;
    }
    
    //generate key
    var key = "";
    for (var i = 0; i < 40; i++)
      key += crypto.charAt(Math.floor(Math.random() * crypto.length));
    
    //insert into database for second step of signup
    db.prepare("INSERT INTO emails(email, key, date) VALUES(?,?,?)").run(request.body.email, key, Date.now());
    
    //dispatch email
    if(!process.env.testing) mail.sendAuth(request.body.email, key);
    
    //tell the user to check their email
    response.render('email', {login: null});
    console.log("Dispatch email for " + request.body.email + " on key " + key);
    
  } else if(request.query.key) {
    //quick verify
    if(request.query.key.length!==40) {
      response.status(400).send("Something went wrong. Verify you copied the link correctly.");
      return;
    }
    
    //just get the row. we delete it later.
    var user = db.prepare("SELECT * FROM emails WHERE key = ?").get(request.query.key);
    if(!user) {
      response.status(400).send("Something went wrong. The link may have expired or been used");
      return;
    }
    //calculate name from email address
    var name = user.email.substring(0,user.email.indexOf("@")).split(".");
    var fname = name[0].split("");
    fname[0] = fname[0].toUpperCase();
    fname = fname.join("");
    var lname = name[1].split("");
    lname[0] = lname[0].toUpperCase();
    lname = lname.join("");
    
    //we don't need to save too much server side because we can recalculate it from data we have, and if the user messes with data on their end, it just will break for them (we still use key)
    //send signup completion data
    response.render('signup', {email: user.email, fname: fname, lname:lname, key: request.query.key});
  } else {
    response.status(400).send("Something went wrong");
  }
}

app.post('/login', (request, response) => {
  if(!request.body.passwd||!request.body.email) {
    response.render('index', {login: null, loginerror: "Missing Email/Password"});
    return;
  }
  var acct = db.prepare('SELECT * FROM users WHERE Lower(email) = Lower(?)').get(request.body.email);
  if(!acct) {
    response.render('index', {login: null, loginerror: "Incorrect Email"});
    return;
  }
  bcrypt.compare(request.body.passwd, acct.password).then(function(result) {
    if(result==true) {
      request.session.acct = acct;
      request.session.loggedin = true;
      response.redirect('/');
      
  console.log(request.session);
    } else {
      response.render('index', {login: null, loginerror: "Incorrect Password"});
    }
  });
  
});

// listen for requests :)
var listener = app.listen(process.env.PORT, () => {
  console.log(`Your app is listening on port ${listener.address().port}`);
});
const https = require("https");
const options = {
	key: fs.readFileSync("/etc/letsencrypt/live/yearbook.incode-labs.com/privkey.pem"),
	cert: fs.readFileSync("/etc/letsencrypt/live/yearbook.incode-labs.com/fullchain.pem")
}
https.createServer(options, app).listen(443);
