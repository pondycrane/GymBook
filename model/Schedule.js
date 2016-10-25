var mongoose = require('mongoose'); 
var Schema = mongoose.Schema;
 
const Schedule = new Schema({
    name    : String,
    year     : Number,
    month      : Number,
    date      : Date
});

export default Schedule; 