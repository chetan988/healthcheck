var fs = require('fs');
var Client = require('ssh2').Client;

var serverinfo = JSON.parse(fs.readFileSync(__dirname + "/../config/serverlist.json"));

console.log("server info : "+ JSON.stringify(serverinfo));

var serverList = Object.keys(serverinfo);

var result = {};
var server_obj = {};
var host_map = JSON.parse(fs.readFileSync(__dirname + "/../config/host_mapping.json")).host_map;

//intitialize the result

for(var i=0; i< serverList.length; i++) {
    result[serverList[i]] = {};
    result[serverList[i]].server_name = serverinfo[serverList[i]].nodename;
    result[serverList[i]].driver_node = {};
    result[serverList[i]].consumer_node = {};
    result[serverList[i]].api_node = {};
    server_obj[serverList[i]] = {};
    server_obj[serverList[i]].ssh_obj = {};
    server_obj[serverList[i]].pid_obj = {};
    createConnection(serverList[i],function(){});
}

function createConnection(serverKey,callback) {
    var conn = new Client();
    serverdetail = serverinfo[serverKey];
    //console.log("Connecting : "+ JSON.stringify(serverdetail)+ "  serverKey:  "+ serverKey);
    conn.connect({
        host: serverdetail.nodename,
        port: serverdetail.port,
        username: serverdetail.username,
        password: serverdetail.password
    });
    conn.on('ready',function(){
        console.log("connected successfully to server "+ serverdetail.username + "@"+ serverdetail.nodename+ ":"+serverdetail.port);
        server_obj[serverKey].ssh_obj= conn;
        result[serverKey].ssh_connection = true;
        callback();
        //console.log("conn: "+ JSON.stringify(conn));
        //console.log("result : "+ JSON.stringify(result));
    });

}


function getServerHealth(serverKey) {
    ssh = server_obj[serverKey].ssh_obj;
    if(ssh == undefined)
        return;
    //var command = "uptime";
    getDriverNodeHealth(serverKey,ssh);
    getApiNodeHealth(serverKey,ssh);
    getConsumerNodeHealth(serverKey,ssh);
    getMemoryUsed(serverKey,ssh);
    getPidForAllServer(serverKey,ssh);
    getCPUAndMemInfo(serverKey,ssh);
    getSocketUsage(serverKey,ssh);
    getDriverNodeHealth(serverKey,ssh);
    getApiNodeHealth(serverKey,ssh);
}

function getSocketUsage (serverKey,ssh) {
    if(server_obj[serverKey].pid_obj.device_handler)
        _getSocketUsage('driver_node',server_obj[serverKey].pid_obj.device_handler);
    if(server_obj[serverKey].pid_obj.consumer_app)
        _getSocketUsage('consumer_node',server_obj[serverKey].pid_obj.consumer_app);
    if(server_obj[serverKey].pid_obj.api_server)
        _getSocketUsage('api_node', server_obj[serverKey].pid_obj.api_server);


    function _getSocketUsage(server_name, pid) {
            var command = "lsof | grep " + pid + " | grep TCP | wc -l";
            ssh.exec(command, function (err, stream) {
                if (err) {
                    console.error("Error in _getSocketUsage : "+ err);
                    if(err.toString() == "Error: (SSH) Channel open failure: open failed" || err.toString() == "Error: No response from server") {
                        //ssh.end();
                        createConnection(serverKey, function() {
                            console.log("calling again");
                            getSocketUsage(serverKey, server_obj[serverKey].ssh_obj);
                        });
                    }
                    result[serverKey][server_name].open_TCP_file_desc = "NA";
                    result[serverKey][server_name].open_TCP_file_desc_threshold = "NA";
                    return;
                }

                stream.on("data", function (data) {
                    //console.log("*********data : " + data);
                    var socket_count = data.toString().trim()
                    result[serverKey][server_name].open_TCP_file_desc = socket_count;
                    if(parseInt(socket_count,10) > parseInt(serverinfo[serverKey].file_descriptor_threshold)) {
                        result[serverKey][server_name].open_TCP_file_desc_threshold = "CRITICAL";
                    }
                    else {
                        result[serverKey][server_name].open_TCP_file_desc_threshold = "UNDER THRESHOLD";
                    }
                });
                stream.on("close", function (code, signal) {
                    //ssh.end();
                    //console.log("code : "+ code + "  signal : "+ signal);
                });
            });

    }
}


function getCPUAndMemInfo (serverKey,ssh) {
    if(server_obj[serverKey].pid_obj.device_handler)
        _getCPUAndMemInfo('driver_node',server_obj[serverKey].pid_obj.device_handler);
    if(server_obj[serverKey].pid_obj.consumer_app)
        _getCPUAndMemInfo('consumer_node',server_obj[serverKey].pid_obj.consumer_app);
    if(server_obj[serverKey].pid_obj.api_server)
        _getCPUAndMemInfo('api_node',server_obj[serverKey].pid_obj.api_server);

    function _getCPUAndMemInfo(server_name, pid) {
        var command = "top -bn1 | grep " + pid  + " | awk '{print $9 ,$10}'";
        ssh.exec(command, function (err, stream) {
            if (err) {
                console.error("Error in _getCPUAndMemInfo : "+ err);
                if(err.toString() == "Error: (SSH) Channel open failure: open failed" || err.toString() == "Error: No response from server") {
                    //ssh.end();
                    createConnection(serverKey, function() {
                        getCPUAndMemInfo(serverKey, server_obj[serverKey].ssh_obj);
                    });
                }
                result[serverKey][server_name].cpu_usage = "NA";
                result[serverKey][server_name].memory_usage = "NA";
                result[serverKey][server_name].cpu_usage_threshold = "NA";
                result[serverKey][server_name].memory_usage_threshold = "NA"
                return;
            }
            stream.on("data", function (data) {
               // console.log("data : "+ data + "  serverKey : "+ serverKey + " server_name:  "+ server_name);
                data = data.toString().trim();
                result[serverKey][server_name].cpu_usage = data.split(" ")[0];
                result[serverKey][server_name].memory_usage = data.split(" ")[1];

                if(parseFloat(result[serverKey][server_name].cpu_usage) > parseFloat(serverinfo[serverKey].cpu_usage_threshold)) {
                    result[serverKey][server_name].cpu_usage_threshold = "CRITICAL";
                } else {
                    result[serverKey][server_name].cpu_usage_threshold = "UNDER THRESHOLD"
                }
                if(parseFloat(result[serverKey][server_name].memoru_usage) > parseFloat(serverinfo[serverKey].memory_usage_threshold)) {
                    result[serverKey][server_name].memory_usage_threshold = "CRITICAL";
                } else {
                    result[serverKey][server_name].memory_usage_threshold = "UNDER THRESHOLD"
                }
            });
            stream.on  ("close", function (code, signal) {
                //ssh.end();
                //console.log("code : "+ code + "  signal : "+ signal);
            });
        });
    }
}

function getPidForAllServer (serverKey,ssh) {
    var command = "ps -ef | grep node | grep -v forever | grep -v grep | awk '{print $2, $9}'";
    ssh.exec(command,function(err,stream){
        if(err) {
            console.error("Error in getPidForAllServer : "+ err);
            if(err.toString() == "Error: (SSH) Channel open failure: open failed" || err.toString() == "Error: No response from server") {
                //ssh.end();
                createConnection(serverKey, function() {
                    getPidForAllServer(serverKey,server_obj[serverKey].ssh_obj);
                });
            }
            return;
        }
        stream.on("data",function(data){
            //console.log("data : "+ data);
            var dataArr = data.toString().split("\n");
            for(var i=0; i< dataArr.length; i++) {
                if(dataArr[i].indexOf('device_handler') > -1) {
                    server_obj[serverKey].pid_obj.device_handler = dataArr[i].split(" ")[0];
                }
                else if(dataArr[i].indexOf('consumer_app') > -1) {
                    server_obj[serverKey].pid_obj.consumer_app = dataArr[i].split(" ")[0];
                }
                else if(dataArr[i].indexOf('api_server') > -1) {
                    server_obj[serverKey].pid_obj.api_server = dataArr[i].split(" ")[0];
                }
            }
            //console.log("server_obj : " + JSON.stringify(server_obj[serverKey].pid_obj) );

        });
        stream.on("close",function(code,signal){
            //ssh.end();
            //console.log("code : "+ code + "  signal : "+ signal);
        });
    });
}


function getMemoryUsed (serverKey,ssh){
    var command = "df -h";
    ssh.exec(command,function(err,stream){
        if(err) {

            console.error("Error in getMemoryUsed : "+ err);
            if(err.toString() == "Error: (SSH) Channel open failure: open failed" || err.toString() == "Error: No response from server") {
                createConnection(serverKey, function() {
                    getMemoryUsed(serverKey,server_obj[serverKey].ssh_obj);
                });
            }
            result[serverKey].disk_usage = "Unable to get Info";
            return;
        }
        stream.on("data",function(data){
            data = data.toString();
            var primary_disk = serverinfo[serverKey].primary_disk;
            data = data.substring(data.indexOf(primary_disk),data.indexOf("\n",data.indexOf(primary_disk)));
            data = data.replace(/\s+/g, function(x){ return " "});
            var dataArr = data.split(" ");
            //console.log("data :  "+ dataArr);
            result[serverKey].disk_check = {};
            result[serverKey].disk_check.disk_name = dataArr[0];
            result[serverKey].disk_check.total_memory = dataArr[1];
            result[serverKey].disk_check.used_memory = dataArr[2];
            result[serverKey].disk_check.free_momory = dataArr[3];
            result[serverKey].disk_check.percentage_use = dataArr[4];
            if(parseInt(dataArr[4]) >=  serverinfo[serverKey].disk_usage_threshold) {
                result[serverKey].disk_check.disk_usage = "CRITICAL";
            }
            else {
                result[serverKey].disk_check.disk_usage = "UNDER THRESHOLD";
            }
        });
        stream.on("close",function(code,signal){
            //ssh.end();
            //console.log("code : "+ code + "  signal : "+ signal);
        });
    });
}

function getConsumerNodeHealth (serverKey,ssh){
    var command = "curl http://localhost:8881/";
    ssh.exec(command,function(err,stream){
        if(err) {
            console.error("Error in getConsumerNodeHealth : "+ err);
            if(err.toString() == "Error: (SSH) Channel open failure: open failed" || err.toString() == "Error: No response from server") {
                //ssh.end();
                createConnection(serverKey, function() {
                    getConsumerNodeHealth(serverKey,server_obj[serverKey].ssh_obj);
                });
            }
            result[serverKey].consumer_node_health = "unable to connect";
            return;
        }
        stream.on("data",function(data){
            //console.log("data : "+ data);
            if(data == "IOS Push Notification Provision") {
                result[serverKey].consumer_node.health = "OK";
                //console.log("result : "+ JSON.stringify(result));
            }
        });
        stream.on("close",function(code,signal){
            //ssh.end();
            //console.log("code : "+ code + "  signal : "+ signal);
        });
    });
}


function getApiNodeHealth (serverKey,ssh){
    var command = "curl http://localhost:9090/";
    ssh.exec(command,function(err,stream){
        if(err) {
            console.error("Error in getApiNodeHealth : "+ err);
            if(err.toString() == "Error: (SSH) Channel open failure: open failed" || err.toString() == "Error: No response from server") {
                //ssh.end();
                createConnection(serverKey, function() {
                    getApiNodeHealth(serverKey,server_obj[serverKey].ssh_obj);
                });
            }
            result[serverKey].api_node_health = "unable to connect";
            return;
        }
        stream.on("data",function(data){
            //console.log("data : "+ data);
            if(data == "success") {
                result[serverKey].api_node.health = "OK";
                //console.log("result : "+ JSON.stringify(result));
            }
        });
        stream.on("close",function(code,signal){
            //ssh.end();
            //console.log("code : "+ code + "  signal : "+ signal);
        });
    });
}

function getDriverNodeHealth (serverKey,ssh){
    var command = "curl http://localhost:9999/";
    ssh.exec(command,function(err,stream){
        if(err) {
            console.error("Error in getDriverNodeHealth : "+ err);
            if(err.toString() == "Error: (SSH) Channel open failure: open failed" || err.toString() == "Error: No response from server") {
                //ssh.end();
                createConnection(serverKey, function() {
                    getDriverNodeHealth(serverKey,server_obj[serverKey].ssh_obj);
                });
            }
            result[serverKey].driver_node_health = "unable to connect";
            return;
        }
        stream.on("data",function(data){
            //console.log("data : "+ data);
            if(data == "success driver") {
                result[serverKey].driver_node.health = "OK";
                //console.log("result : "+ JSON.stringify(result));
            }
        });
        stream.on("close",function(code,signal){
            //ssh.end();
           // console.log("code : "+ code + "  signal : "+ signal);
        });
    });
}

function doServerRestart(server, host, callback) {
        host = host_map[host];
        if(serverinfo[host].isSudoUser) {

        } else {
            var command = "su - " + serverinfo[host].nodeUser + " -c 'forever restart "
                + serverinfo[host].tfs_loc + server + "/app.js'";
           // console.log("_doServerRestart", "command : " + command);
            var ssh = server_obj[host].ssh_obj || undefined;
            if (ssh == undefined)
                return callback("ssh object not found", false);
            else {
                ssh.exec(command, {pty: true}, function (err, stream) {
                    if (err) {
                        console.error("Error in getDriverNodeHealth : " + err);
                        if (err.toString() == "Error: (SSH) Channel open failure: open failed" || err.toString() == "Error: No response from server") {
                            //ssh.end();
                            createConnection(host, function () {
                                doServerRestart(host);
                            });
                        }
                        return callback("error while executing", false);
                    }
                    stream.on("data", function (data) {
                        //console.log("data : "+ data);
                        if (data.toString().trim() == "Password:") {
                            console.log("_doServerRestart", "password data : " + data);
                            stream.write(serverinfo[host].nodePassword + '\n');
                        }
                    });
                    stream.on("close", function (code, signal) {
                        //ssh.end();
                        console.log("code : " + code + "  signal : " + signal);
                        if (code != 0)
                            return callback("something went wrong", true);
                        else
                            return callback(null, true);
                    });
                });
            }
        }
}
var utility = {
    getResult : function (req,res,next) {
        req.result = result;
        next();
    },
    resetServer : function(server,host, callback) {
        if(server == undefined || host == undefined)
            return callback(null,true);
        doServerRestart(server,host, function(err,status){
            return callback(err,status);
        })
    }
};

setInterval(function(){
    for(var i=0; i< serverList.length; i++) {
        getServerHealth(serverList[i]);
    }
},10000);

module.exports = utility;

