'use strict';

const 
  bodyParser = require('body-parser'),
  config = require('config'),
  crypto = require('crypto'),
  express = require('express'),
  https = require('https'),  
  request = require('request'), 
  mongoose = require('mongoose'), 
  moment = require('moment');

mongoose.connect('mongodb://localhost:27017/gym_book');
var Schema = mongoose.Schema;
 
const Schedule = new Schema({
    name : String,
    ind: Number, 
    date : Date, 
    machine: String
});

var myModel = mongoose.model('Schedule', Schedule); 

//create new model
/*
var post = new myModel({name: "Hank", ind: 1, date: new Date()});

//save model to MongoDB
post.save(function (err) {
  if (err) {
		return err;
  }
  else {
  	console.log("Post saved");
  }
});
*/

var app = express();

app.set('port', process.env.PORT || 5000);
app.use(bodyParser.json({ verify: verifyRequestSignature }));
app.use(express.static('public'));

/*
 * Be sure to setup your config values before running this code. You can 
 * set them using environment variables or modifying the config file in /config.
 *
 */

// App Secret can be retrieved from the App Dashboard
const APP_SECRET = (process.env.MESSENGER_APP_SECRET) ? 
  process.env.MESSENGER_APP_SECRET :
  config.get('appSecret');

// Arbitrary value used to validate a webhook
const VALIDATION_TOKEN = (process.env.MESSENGER_VALIDATION_TOKEN) ?
  (process.env.MESSENGER_VALIDATION_TOKEN) :
  config.get('validationToken');

// Generate a page access token for your page from the App Dashboard
const PAGE_ACCESS_TOKEN = (process.env.MESSENGER_PAGE_ACCESS_TOKEN) ?
  (process.env.MESSENGER_PAGE_ACCESS_TOKEN) :
  config.get('pageAccessToken');

if (!(APP_SECRET && VALIDATION_TOKEN && PAGE_ACCESS_TOKEN)) {
  console.error("Missing config values");
  process.exit(1);
}

/*
 * Use your own validation token. Check that the token used in the Webhook 
 * setup is the same token used here.
 *
 */
app.get('/webhook', function(req, res) {
  console.log('getting webhook');
  if (req.query['hub.mode'] === 'subscribe' &&
    req.query['hub.verify_token'] === 'actgenomics-gym') {
    console.log("Validating webhook");
    res.status(200).send(req.query['hub.challenge']);
  } else {
    console.error("Failed validation. Make sure the validation tokens match.");
    res.sendStatus(403);          
  }  
});


/*
 * All callbacks for Messenger are POST-ed. They will be sent to the same
 * webhook. Be sure to subscribe your app to your page to receive callbacks
 * for your page. 
 * https://developers.facebook.com/docs/messenger-platform/implementation#subscribe_app_pages
 *
 */
app.post('/webhook', function (req, res) {

  var data = req.body;
  // Make sure this is a page subscription
  if (data.object == 'page') {
    // Iterate over each entry
    // There may be multiple if batched
    data.entry.forEach(function(pageEntry) {
      var pageID = pageEntry.id;
      var timeOfEvent = pageEntry.time;

      // Iterate over each messaging event
      pageEntry.messaging.forEach(function(messagingEvent) {
        
        if (messagingEvent.optin) {
          receivedAuthentication(messagingEvent);
        } else if (messagingEvent.message) {
          receivedMessage(messagingEvent);
        } else if (messagingEvent.delivery) {
          receivedDeliveryConfirmation(messagingEvent);
        } else if (messagingEvent.postback) {
          receivedPostback(messagingEvent);
        } else {
          console.log("Webhook received unknown messagingEvent: ", messagingEvent);
        }
      });
    });

    // Assume all went well.
    //
    // You must send back a 200, within 20 seconds, to let us know you've 
    // successfully received the callback. Otherwise, the request will time out.
    res.sendStatus(200);
  }
});

/*
 * Verify that the callback came from Facebook. Using the App Secret from 
 * the App Dashboard, we can verify the signature that is sent with each 
 * callback in the x-hub-signature field, located in the header.
 *
 * https://developers.facebook.com/docs/graph-api/webhooks#setup
 *
 */
function verifyRequestSignature(req, res, buf) {
  var signature = req.headers["x-hub-signature"];

  if (!signature) {
    // For testing, let's log an error. In production, you should throw an 
    // error.
    console.error("Couldn't validate the signature.");
  } else {
    var elements = signature.split('=');
    var method = elements[0];
    var signatureHash = elements[1];

    var expectedHash = crypto.createHmac('sha1', APP_SECRET)
                        .update(buf)
                        .digest('hex');

    if (signatureHash != expectedHash) {
      throw new Error("Couldn't validate the request signature.");
    }
  }
}

/*
 * Authorization Event
 *
 * The value for 'optin.ref' is defined in the entry point. For the "Send to 
 * Messenger" plugin, it is the 'data-ref' field. Read more at 
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference#auth
 *
 */
function receivedAuthentication(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfAuth = event.timestamp;

  // The 'ref' field is set in the 'Send to Messenger' plugin, in the 'data-ref'
  // The developer can set this to an arbitrary value to associate the 
  // authentication callback with the 'Send to Messenger' click event. This is
  // a way to do account linking when the user clicks the 'Send to Messenger' 
  // plugin.
  var passThroughParam = event.optin.ref;

  console.log("Received authentication for user %d and page %d with pass " +
    "through param '%s' at %d", senderID, recipientID, passThroughParam, 
    timeOfAuth);

  // When an authentication is received, we'll send a message back to the sender
  // to let them know it was successful.
  sendTextMessage(senderID, "Authentication successful");
}


/*
 * Message Event
 *
 * This event is called when a message is sent to your page. The 'message' 
 * object format can vary depending on the kind of message that was received.
 * Read more at https://developers.facebook.com/docs/messenger-platform/webhook-reference#received_message
 *
 * For this example, we're going to echo any text that we get. If we get some 
 * special keywords ('button', 'generic', 'receipt'), then we'll send back
 * examples of those bubbles to illustrate the special message bubbles we've 
 * created. If we receive a message with an attachment (image, video, audio), 
 * then we'll simply confirm that we've received the attachment.
 * 
 */
 
 
function receivedMessage(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfMessage = event.timestamp;
  var message = event.message;
  console.log('\n\n\n\n\receiving message!!!\n\n\n\n\n\n')

  console.log("Received message for user %d and page %d at %d with message:", 
    senderID, recipientID, timeOfMessage);
  console.log(JSON.stringify(message));

  var isEcho = message.is_echo;
  var messageId = message.mid;
  var appId = message.app_id;
  var metadata = message.metadata;
  var messageText = message.text;
  var messageAttachments = message.attachments;
  var quick_reply = message.quick_reply; 
  
  if (isEcho) {
    // Just logging message echoes to console
    console.log("Received echo for message %s and app %d with metadata %s", 
      messageId, appId, metadata);
    return;
  } else if (quick_reply) {
    var payloads = quick_reply.payload.split('|')
    console.log(payloads); 
    
    switch(payloads[0]) {
      case 'DATE_SELECT' : 
        sendQuickRepliesTime(senderID, payloads[1], payloads[2], payloads[3]);
        break;
      
      case 'TIME_SELECT' : 
        var date = new moment(payloads[4]).toDate(); 
        var name = payloads[6]
        var machine = payloads[5]
        console.log(payloads[4])
        console.log(date)
        var post = new myModel({
          name: name, 
          ind: payloads[3], 
          date: date, 
          machine: machine
        });
        
        //save model to MongoDB
        post.save(function (err) {
          if (err) {
        		return err;
          }
          else {
          	sendTextMessage(senderID, name+" booked "+machine+" at "+payloads[1]+", "+payloads[2]+", "+date);
          }
        });
        break;
    }
    
    return
  } 
  
  if (messageText) {
      switch (messageText) {
        case 'image':
          sendImageMessage(senderID);
          break;
  
        case 'button':
          sendButtonMessage(senderID);
          break;
  
        case 'generic':
          sendGenericMessage(senderID);
          break;
  
        case 'receipt':
          sendReceiptMessage(senderID);
          break;
  
        case 'help': 
          sendHelp(senderID);
          break;
  
  
        default:
          sendTextMessage(senderID, messageText);
      }
    } else if (messageAttachments) {
      sendTextMessage(senderID, "Message with attachment received");
    }
}


/*
 * Delivery Confirmation Event
 *
 * This event is sent to confirm the delivery of a message. Read more about 
 * these fields at https://developers.facebook.com/docs/messenger-platform/webhook-reference#message_delivery
 *
 */
function receivedDeliveryConfirmation(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var delivery = event.delivery;
  var messageIDs = delivery.mids;
  var watermark = delivery.watermark;
  var sequenceNumber = delivery.seq;

  if (messageIDs) {
    messageIDs.forEach(function(messageID) {
      console.log("Received delivery confirmation for message ID: %s", 
        messageID);
    });
  }

  console.log("All message before %d were delivered.", watermark);
}


/*
 * Postback Event
 *
 * This event is called when a postback is tapped on a Structured Message. Read
 * more at https://developers.facebook.com/docs/messenger-platform/webhook-reference#postback
 * 
 */
function receivedPostback(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfPostback = event.timestamp;

  // The 'payload' param is a developer-defined field which is set in a postback 
  // button for Structured Messages. 
  var payloads = event.postback.payload.split('|');

  console.log("Received postback for user %d and page %d with payload '%s' " + 
    "at %d", senderID, recipientID, payloads, timeOfPostback);

  // When a postback is called, we'll send a message back to the sender to 
  // let them know it was successful
  switch (payloads[0]) {
    case 'NEW_BOOKING' : 
      callUserProfileAPI(senderID, {
        mode: 'NEW_BOOKING'
      })
      break; 
    case 'VIEW_BOOKING' : 
      //callUserProfileAPI(senderID, {
      //  mode: 'VIEW_BOOKING'
      //})
      console.log('whatever')
    case 'MACHINE_SELECT': 
      sendQuickRepliesDate(senderID, payloads[1], payloads[2])
      break; 
    case 'MACHINE_CHECK': 
      callUserProfileAPI(senderID, {
        mode: 'MACHINE_CHECK', 
        machine: payloads[1]
      })
      break; 
  }
}


/*
 * Send a message with an using the Send API.
 *
 */
function sendImageMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "image",
        payload: {
          url: "http://i.imgur.com/zYIlgBl.png"
        }
      }
    }
  };

  callSendAPI(messageData);
}

/*
 * Send a text message using the Send API.
 *
 */
function sendTextMessage(recipientId, messageText) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: messageText
    }
  };

  callSendAPI(messageData);
}

var machineTrans = {
  "TREADMILL": "跑步機", 
  "STAIR": "踏步機", 
  "BIKE1": "左邊那台腳踏車", 
  "BIKE2": "右邊那台腳踏車", 
  "SHAKE": "震動機", 
  "ABS": "腹肌王"
}

function sendMachineOptions(recipientId, userProfile) {
  var userName = userProfile.first_name + ' ' + userProfile.last_name; 
  
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: [{
            title: machineTrans["TREADMILL"],
            subtitle: "會跑得很累",
            image_url: "http://shop.lifefitness.com/UserFiles/Club-Series-Treadmill-l.png",
            buttons: [{
              type: "postback",
              title: "馬上預約!!",
              payload: "MACHINE_SELECT|TREADMILL|"+userName,
            }, {
              type: "postback",
              title: "查看預約時間",
              payload: "MACHINE_CHECK|TREADMILL|"+userName,
            }],
          }, {
            title: machineTrans["STAIR"],
            subtitle: "會踩得很累",
            image_url: "https://www.filepicker.io/api/file/jLVvoJOQgG5JPSQbyNxG",
            buttons: [{
              type: "postback",
              title: "馬上預約!!",
              payload: "MACHINE_SELECT|STAIR|"+userName,
            }, {
              type: "postback",
              title: "查看預約時間",
              payload: "MACHINE_CHECK|STAIR|"+userName,
            }]
          }, {
            title: machineTrans["BIKE1"],
            subtitle: "騎車!!",
            image_url: "https://www.filepicker.io/api/file/ykwFacrsTKG62OSXY1gn",
            buttons: [{
              type: "postback",
              title: "馬上預約!!",
              payload: "MACHINE_SELECT|BIKE1|"+userName,
            }, {
              type: "postback",
              title: "查看預約時間",
              payload: "MACHINE_CHECK|BIKE1|"+userName,
            }]
          }, {
            title: machineTrans["BIKE2"],
            subtitle: "騎車!!",
            image_url: "https://www.filepicker.io/api/file/l2L7aPerSFWffW6srEmM",
            buttons: [{
              type: "postback",
              title: "馬上預約!!",
              payload: "MACHINE_SELECT|BIKE2|"+userName,
            }, {
              type: "postback",
              title: "查看預約時間",
              payload: "MACHINE_CHECK|BIKE2|"+userName,
            }]
          }, {
            title: machineTrans["SHAKE"],
            subtitle: "非常晃",
            image_url: "https://www.filepicker.io/api/file/BFKoeODLTNuEpyEpVvp6",
            buttons: [{
              type: "postback",
              title: "馬上預約!!",
              payload: "MACHINE_SELECT|SHAKE|"+userName,
            }, {
              type: "postback",
              title: "查看預約時間",
              payload: "MACHINE_CHECK|SHAKE|"+userName,
            }]
          }, {
            title: machineTrans["ABS"],
            subtitle: "肚子酸",
            image_url: "https://www.filepicker.io/api/file/iKCv0r2QCKhpQ32SnGZg",
            buttons: [{
              type: "postback",
              title: "馬上預約!!",
              payload: "MACHINE_SELECT|ABS|"+userName,
            }, {
              type: "postback",
              title: "查看預約時間",
              payload: "MACHINE_CHECK|ABS|"+userName,
            }]
          }
          ]
        }
      }
    }
  };  

  callSendAPI(messageData);
}

function sendQuickRepliesDate(recipientID, machine, userName) {
  myModel.find({}, function (err, docs) {
    var date = moment();
    
    var messageData = {
      recipient: {
        id: recipientID
      },
      "message":{
        "text":"What Date? ?",
        "quick_replies":[
        ]
      }
    };
    for (var i=0; i<7; i++) {
      //var title = (date.getUTCMonth() + 1) +'/'+ date.getUTCDate();
      var dateString = date.format('l')
      messageData.message.quick_replies.push(
          {
            "content_type":"text",
            "title": dateString,
            "payload": "DATE_SELECT|"+dateString+'|'+machine+'|'+userName
          }
        )
      date.add(1, 'days');  
    }
    callSendAPI(messageData);
    return; 
  });
  

}

function sendQuickRepliesTime(recipientID, day, machine, userName) {
  var temp = day.split('/'); 
  var tempDate = moment([temp[2], parseInt(temp[0])-1 , temp[1]]); 
  var startDate = tempDate.toDate(); 
  tempDate.add(1, 'days'); 
  var endDate = tempDate.toDate(); 
  myModel.find({
    date: {
        $gte: startDate,
        $lt: endDate
    }, 
    machine: machine
  }).sort('-date').limit(5).exec(function(err, docs){
    var allInd = docs.map(function(datum) {return datum.ind})
    var date = moment([temp[2], parseInt(temp[0])-1 , temp[1], '7', '0']); 
  
    var messageData = {
      recipient: {
        id: recipientID
      },
      "message":{
        "text":"What Time? ?",
        "quick_replies":[
        ]
      }
    };
    
    for (var i=0; i<10; i++) {
      if (i == 4) {
        date.add(9, 'hours'); 
      }
      
      if (allInd.indexOf(i) < 0) {
        var title = date.format('LT'); 
        messageData.message.quick_replies.push(
              {
                "content_type":"text",
                "title": title,
                "payload": "TIME_SELECT|"+day+"|"+title+"|"+i+"|"+date.format()+'|'+machine+'|'+userName
              }
            )
      }
      date.add(0.5, 'hours'); 
    }
    callSendAPI(messageData);
  });
}

function sendHelp(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: 'schedule - show booking schedule\nbook - book the time you want'
    }
  };

  callSendAPI(messageData);
}

/*
 * Send a button message using the Send API.
 *
 */
function sendButtonMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "This is test text",
          buttons:[{
            type: "web_url",
            url: "https://www.oculus.com/en-us/rift/",
            title: "Open Web URL"
          }, {
            type: "postback",
            title: "Call Postback",
            payload: "Developer defined postback"
          }]
        }
      }
    }
  };  

  callSendAPI(messageData);
}

/*
 * Send a Structured Message (Generic Message type) using the Send API.
 *
 */
function sendGenericMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: [{
            title: "rift",
            subtitle: "Next-generation virtual reality",
            item_url: "https://www.oculus.com/en-us/rift/",               
            image_url: "http://messengerdemo.parseapp.com/img/rift.png",
            buttons: [{
              type: "web_url",
              url: "https://www.oculus.com/en-us/rift/",
              title: "Open Web URL"
            }, {
              type: "postback",
              title: "Call Postback",
              payload: "Payload for first bubble",
            }],
          }, {
            title: "touch",
            subtitle: "Your Hands, Now in VR",
            item_url: "https://www.oculus.com/en-us/touch/",               
            image_url: "http://messengerdemo.parseapp.com/img/touch.png",
            buttons: [{
              type: "web_url",
              url: "https://www.oculus.com/en-us/touch/",
              title: "Open Web URL"
            }, {
              type: "postback",
              title: "Call Postback",
              payload: "Payload for second bubble",
            }]
          }]
        }
      }
    }
  };  

  callSendAPI(messageData);
}


/*
 * Send a receipt message using the Send API.
 *
 */
function sendReceiptMessage(recipientId) {
  // Generate a random receipt ID as the API requires a unique ID
  var receiptId = "order" + Math.floor(Math.random()*1000);

  var messageData = {
    recipient: {
      id: recipientId
    },
    message:{
      attachment: {
        type: "template",
        payload: {
          template_type: "receipt",
          recipient_name: "Peter Chang",
          order_number: receiptId,
          currency: "USD",
          payment_method: "Visa 1234",        
          timestamp: "1428444852", 
          elements: [{
            title: "Oculus Rift",
            subtitle: "Includes: headset, sensor, remote",
            quantity: 1,
            price: 599.00,
            currency: "USD",
            image_url: "http://messengerdemo.parseapp.com/img/riftsq.png"
          }, {
            title: "Samsung Gear VR",
            subtitle: "Frost White",
            quantity: 1,
            price: 99.99,
            currency: "USD",
            image_url: "http://messengerdemo.parseapp.com/img/gearvrsq.png"
          }],
          address: {
            street_1: "1 Hacker Way",
            street_2: "",
            city: "Menlo Park",
            postal_code: "94025",
            state: "CA",
            country: "US"
          },
          summary: {
            subtotal: 698.99,
            shipping_cost: 20.00,
            total_tax: 57.67,
            total_cost: 626.66
          },
          adjustments: [{
            name: "New Customer Discount",
            amount: -50
          }, {
            name: "$100 Off Coupon",
            amount: -100
          }]
        }
      }
    }
  };

  callSendAPI(messageData);
}

/*
 * Call the Send API. The message data goes in the body. If successful, we'll 
 * get the message id in a response 
 *
 */
function callSendAPI(messageData) {
  request({
    uri: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: PAGE_ACCESS_TOKEN },
    method: 'POST',
    json: messageData

  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var recipientId = body.recipient_id;
      var messageId = body.message_id;

      console.log("Successfully sent generic message with id %s to recipient %s", 
        messageId, recipientId);
    } else {
      console.error("Unable to send message.");
      console.error(response);
      console.error(error);
    }
  });  
}

function callUserProfileAPI(userID, payload) {
  request({
    uri: "https://graph.facebook.com/v2.6/"+userID+"?fields=first_name,last_name,profile_pic,locale,timezone,gender&access_token="+PAGE_ACCESS_TOKEN ,
    method: 'GET'
  }, function (error, response) {
    if (!error && response.statusCode == 200) {
      console.log("successful requesting user profile");
      if (payload.mode == 'NEW_BOOKING') {
          sendMachineOptions(userID, JSON.parse(response.body)); 
      } else if (payload.mode == 'VIEW_BOOKING') {
        var temp = JSON.parse(response.body); 
        var userName = temp.first_name + ' ' + temp.last_name; 
        myModel.find({name: userName}).sort('-date').limit(5).exec(function(err, docs){
          var allData = []
          for (var i=0; i<docs.length; i++) {
            var date = moment(docs[i].date)
            allData.push(docs[i].name + ' starting from '+date.format('LLLT')+' for 30 mins')
          }
          sendTextMessage(userID, allData.join('\n')); 
        });
      } else if (payload.mode == 'MACHINE_CHECK') {
        var temp = JSON.parse(response.body); 
        var userName = temp.first_name + ' ' + temp.last_name; 
        myModel.find({machine: payload.machine}).sort('-date').limit(8).exec(function(err, docs){
          var allData = []
          for (var i=0; i<docs.length; i++) {
            var date = moment(docs[i].date)
            allData.push(docs[i].name + ', from '+date.format('LLLT')+' for 30 mins')
          }
          sendTextMessage(userID, allData.join('\n')); 
        });
      }  else {
        return response.body
      }
    } else {
      console.error("Unable to send message.");
      console.error(response);
      console.error(error);
      return false; 
    }
  });  
}

// Start server
// Webhooks must be available via SSL with a certificate signed by a valid 
// certificate authority.
app.listen(app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
});

module.exports = app;