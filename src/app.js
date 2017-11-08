//Authentication Service
//Entry Point
var secret = process.env.JWT_SECRET;
//imports
var restify = require('restify'),
Logger = require('bunyan'),
corsMiddleware = require('restify-cors-middleware'),
verifyToken = require('restify-jwt'),
jwt = require('jsonwebtoken'),
userHelper = require('./helpers/user.helper.js');

//
//
//Logging setup
//
//
var log = new Logger.createLogger({
  name:'MAIN',
  //define where to write each log
  streams:[
    {
      level:'info',
      path: __dirname + '/logs/info.log'
    },
    {
      level:'error',
      path: __dirname + '/logs/error.log'
    },
    {
      level:'fatal',
      path: __dirname + '/logs/error.log'
    },
    {
      level:'warn',
      path: __dirname + '/logs/error.log'
    },
    {
      level:'debug',
      stream: process.stdout
    },
    {
      level:'trace',
      path: __dirname + '/logs/trace.log'
    }
  ],
  //how to serialise messages
  serializers: {
    req: Logger.stdSerializers.req,
    res: Logger.stdSerializers.res,
  }
});


//
//
//Server Setup
//
//
var server = restify.createServer({
  name:'user',
  version:'0.0.2',
  //certificate:fs.readFileSync('../certificate'),
  //key:fs.readFileSync('../key')
  log:log
});

//use body parser to deal with JSON
server.use(restify.bodyParser());
server.use(restify.queryParser());
server.use(restify.fullResponse());


const cors = corsMiddleware({
  preflighMaxAge: 5,
  origins: ['*'],
  allowHeaders: ['authorization']
});
server.pre(cors.preflight);
server.use(cors.actual);


//
//
//Server routes
//
//
//version request
//return latest default version
server.get("/version", function(req,res,next){
  server.log.info("Version Request");
  res.send(server.name + " is TESTING running on v" + server.versions);
});


var grpc = require("grpc");
var accountDescriptor = grpc.load(__dirname + '/proto/account.proto').account;
var accountClient = new accountDescriptor.AccountService('service.account:1295', grpc.credentials.createInsecure());

var premisesDescriptor = grpc.load(__dirname + '/proto/premises.proto').premises;
var premisesClient = new premisesDescriptor.PremisesService('service.premises:1295', grpc.credentials.createInsecure());

var paymentDescriptor = grpc.load(__dirname + '/proto/payment.proto').payment;
var paymentClient = new paymentDescriptor.PaymentService('service.payment:1295', grpc.credentials.createInsecure());

var menuDescriptor = grpc.load(__dirname + '/proto/menu.proto').menu;
var menuClient = new menuDescriptor.MenuService('service.menu:1295', grpc.credentials.createInsecure());


//
//
//Login Request
//
server.post("/login", function(req,res,next){
  //check if a username and password have been supplied
  if( req.body && req.body.username && req.body.password ){
    req.body.accountType = "CLIENT";
    accountClient.authenticate(req.body, function(err, response){
      if(err)
      {
        server.log.error(err);
        res.status(401);
        res.send(err);
      }else{
        res.send(response);
      }
    });
  }else{
    var error = {message:'Username or Password was not supplied', code: '0006'};
    res.status(400);
    server.log.error(error);
    res.send(error);
  }
});

//
//
//Create user request
//
server.post("/", function(req,res,next){
  //res.send("Create user - Not Implemented");
  if( req.body
    && req.body.username
    && req.body.password
    && req.body.email ){
      var userToCreate = {};
      userToCreate.username = req.body.username;
      userToCreate.password = req.body.password;
      userToCreate.email = req.body.email;
      userToCreate.accountType = "CLIENT";

    accountClient.create(userToCreate, function(err, response){
      if(err){
        server.log.error(err);
        res.status(400);
        res.send(err);
      }else{
        res.send(response);
      }
    });
  }else{
    var error = {message:'Not all parameters were supplied', code: '0007'};
    res.status = 400;
    server.log.error(error);
    res.send(error);
  }
});

server.post("/recover", function(req,res,next){
  //res.send("Create user - Not Implemented");
  if( req.body
    && req.body.email ){
      var existingUser = {};
      existingUser.email = req.body.email;

    accountClient.recover(existingUser, function(err, response){
      if(err){
        server.log.error(err);
        res.status(400);
        res.send(err);
      }else{
        res.send(response);
      }
    });
  }else{
    var error = {message:'Not all parameters were supplied', code: '0007'};
    res.status = 400;
    server.log.error(error);
    res.send(error);
  }
});

server.post("/reset", function(req,res,next){
  if(req.body
    && req.body.verification
    && req.body.password){
      var passwordReset = {};
      passwordReset.verfication = call.body.verification;
      passwordReset.password = call.body.password;

      accountClient.resetPassword(passwordReset, function(err, response){
        if(err){
          server.log.error(err);
          res.status(400);
          res.send(err);
        }else{
          res.send(response);
        }
      });
    }
});

server.get("/setup", verifyToken({secret:secret}), function(req, res, next){
  var premisesExists = false;
  var paymentInfoExists = false;
  //need to verify that the account is setup
  //check premises exists, check payment info exists, menu, active menu
  var token = req.header('Authorization');
  userHelper.getTokenContent(token, secret, function(err, decodedToken){
    if(err){
      res.status(400);
      res.send(err);
      return;
    }

    var metadata = new grpc.Metadata();
    metadata.add('authorization', userHelper.getRawToken(token));

    var requests = [];

    var premisesCall = function(metadata){
      return new Promise(function(resolve, reject){
        premisesClient.get({}, metadata, function(err, results){
          if(err){return reject(err);}
          if(results){
            return resolve(true);
          }
          return resolve(false);
        });
      });
    }
    var paymentCall = function(metadata){
      return new Promise(function(resolve, reject){
        paymentClient.get({}, metadata, function(err, results){
          if(err){return reject(err);}
          if(results){
            return resolve(true);
          }
          return resolve(false);
        });
      });
    }
    var menuCall = function(metadata){
      return new Promise(function(resolve, reject){
        menuClient.getAll({}, metadata, function(err, results){
            if(err){return reject(err)}
            var hasActive = false;
            var hasMenu = false;
            console.log(results);
            if(results.length != 0){
              hasMenu = true;
              for(var menuKey in results){
                if(results[menuKey].active){
                  hasActive = true;
                  break;
                }
              }
            }

            return resolve({menu: hasMenu, active: hasActive});
        });
      });
    }


    requests[requests.length] = premisesCall(metadata);
    requests[requests.length] = paymentCall(metadata);
    requests[requests.length] = menuCall(metadata);
    Promise.all(requests).then(allData => {
      var returnObj = {};
      returnObj.premises = allData[0];
      returnObj.payment = allData[1];
      returnObj.menu = allData[2].menu;
      returnObj.active = allData[2].active;
      res.send(returnObj);
    }, error => {
      res.send(error);
    })
  });
});





//
//
//Delete user request
//
server.del("/:_id", verifyToken({secret:secret}), function(req,res,next){
  res.send("Delete User - Not Implemented");
});

//
//
//Update User
//
server.put("/:_id", verifyToken({secret:secret}), function(req,res,next){
  res.send("Update User - Not Implemented");
});

//
//
//Get User
//
server.get("/", verifyToken({secret: secret}), function(req,res,next){
  var token = req.header('Authorization');
  userHelper.getTokenContent(token, secret, function(err, decodedToken){
    if(err){
      res.status(400);
      res.send(err);
      return;
    }

    var metadata = new grpc.Metadata();
    metadata.add('authorization', userHelper.getRawToken(token));
    accountClient.get({}, metadata, function(err, result){
      if(err){
        res.send(err)
      }else{
        res.send(result);
      }
    });
  });
});

//
//
//
//
//


//
//
//
//begin listening on port 8080
//
//
server.listen(8080, function(){
  console.log(server.name + " listening on ", server.url);
});
