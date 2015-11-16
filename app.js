var express = require('express'),
    app = express();
var bodyParser = require('body-parser');
var multer = require('multer');


app.use(bodyParser.json());
// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: true }));
// parse multipart/form-data



app.set('views', __dirname+ '/public');
app.set('view engine', 'ejs');
var getServer = require('./lib/getServerStatus');

// get the dashboard running

app.get('/',getServer.getResult,function(req,res,next){
    console.log("result : "+ JSON.stringify(req.result));
    res.render("test.ejs", {"result" : req.result});
    //res.send(req.result);
});

app.post('/reset', function(req,res,next){
console.log(JSON.stringify(req.body));
    var server = req.body.server || undefined;
    var host = req.body.host || undefined;
    getServer.resetServer(server,host,function(err,status){
        if(err) {
            console.log("reset", "error : "+ err);
        }
        res.send("ok");
    });
});

app.listen("7777",function(){
    //console.log("listening to port 7777");
});