const nodemailer = require('nodemailer')

var transporter = nodemailer.createTransport({
  host: "smtp.ipage.com", //change this to your SMTP server
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL,
    pass: process.env.EMAIL_PASS
  }
});

exports.sendAuth = function(email, key) {
  var name = email.slice(0,email.indexOf("@"));
  if(name.indexOf('.')!==-1)
    name = name.slice(0,name.indexOf('.'));
  name = name.split("");
  name[0] = name[0].toUpperCase();
  name = name.join("");
  
  var mailOptions = {
    from: process.env.EMAIL,
    to: email,
    subject: name+', finish signup for the Digital Yearbook',
    html: `<em>If you did not request this email, you may safely ignore it.</em><br/><br/>Hey! Thanks for confirming your email address. Are you ready to start your yearbook? Click here to complete signup: <a href="${process.env.DOMAIN}/signup?key=${key}">${process.env.DOMAIN}/signup?key=${key}</a>`
  };
  console.log(JSON.stringify(mailOptions));
  transporter.sendMail(mailOptions, function(error, info){
    if (error) {
      console.log(error);
    } else {
      console.log('Email sent: ' + info.response);
    }
  }); /**/
}
