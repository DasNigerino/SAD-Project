const mysql = require('mysql2');
require('dotenv/config')
const db = mysql.createConnection({
    user:process.env.MYSQL_USER,
    password:process.env.MYSQL_PASSWORD,
    database:process.env.MYSQL_DB_NAME,
    host:process.env.MYSQL_INSTANCE_NAME,
});

db.connect((err) => {
    if (err) {
        console.error('Erreur de connexion :', err.message);
    } else {
        console.log('Connecté à la base de données MySQL');
    }
});

module.exports = db;