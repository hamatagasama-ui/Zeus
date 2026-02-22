const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }, // В будущем зашифруем
    balance: {
        lightning: { type: Number, default: 0 }, // Твои "Молнии"
        stars: { type: Number, default: 0 }     // "Звезды" из ТГ
    }
});

module.exports = mongoose.model('User', UserSchema);
