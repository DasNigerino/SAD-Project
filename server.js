require('dotenv').config();
const express = require('express');
const db = require('./db/database');
const bodyParser = require('body-parser');
const path=require("path");
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const Joi = require('joi');

const app = express();
app.use(cors()); // Autorise toutes les origines (peut être personnalisé)
app.use(bodyParser.json());
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(express.static('public'));
app.use(express.static(path.join(__dirname,'public')));
const port = process.env.PORT || 9000;
const secretKey = process.env.SECRET_KEY || 'defaultSecretKey';

// Middleware global pour capturer les erreurs
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send({ message: 'Erreur interne du serveur.' });
});

// Schéma de validation pour l'inscription et la connexion
const registerSchema = Joi.object({
    adi: Joi.string().required(),
    soyadi: Joi.string().required(),
    eposta: Joi.string().email().required(),
    sifre: Joi.string().min(6).required()
});

const loginSchema = Joi.object({
    eposta: Joi.string().email().required(),
    sifre: Joi.string().required()
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Route pour l'inscription
app.post('/register', async (req, res, next) => {
    const { error } = registerSchema.validate(req.body);
    if (error) return res.status(400).send({ message: error.details[0].message });

    const { adi, soyadi, eposta, sifre } = req.body;

    try {
        const hashedPassword = await bcrypt.hash(sifre, 10);
        const sql = 'INSERT INTO kullanicilar (adi, soyadi, eposta, sifre) VALUES (?, ?, ?, ?)';
        db.query(sql, [adi, soyadi, eposta, hashedPassword], (err) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(400).send({ message: 'Email déjà utilisé.' });
                }
                return next(err);
            }
            res.status(201).send({ message: 'Utilisateur ajouté avec succès.' });
        });
    } catch (err) {
        next(err);
    }
});

// Route pour la connexion
app.post('/login', async (req, res, next) => {
    const { error } = loginSchema.validate(req.body);
    if (error) return res.status(400).send({ message: error.details[0].message });

    const { eposta, sifre } = req.body;

    try {
        const sql = 'SELECT * FROM kullanicilar WHERE eposta = ?';
        db.query(sql, [eposta], async (err, results) => {
            if (err) return next(err);
            if (results.length === 0) return res.status(401).send({ message: 'Utilisateur non trouvé.' });

            const kullanici = results[0];
            const isMatch = await bcrypt.compare(sifre, kullanici.sifre);

            if (!isMatch) return res.status(401).send({ message: 'Mot de passe incorrect.' });

            const token = jwt.sign(
                { id: kullanici.id, rol: kullanici.rol },
                secretKey,
                { expiresIn: '1h' }
            );
            res.status(200).send({ message: 'Connexion réussie.', token });
        });
    } catch (err) {
        next(err);
    }
});
// Endpoint pour les statistiques du tableau de bord
app.get('/api/dashboard-data', (req, res) => {
    const query = `
      SELECT 
        SUM(r.gelir) AS Toplam_Gelir,
        COUNT(r.id) AS Toplam_Rezervasyonlar,
        SUM(CASE WHEN a.durum = 'Kiralandi' THEN 1 ELSE 0 END) AS Kiralandi_Arabalar,
        SUM(CASE WHEN a.durum = 'Mevcut' THEN 1 ELSE 0 END) AS Mevcut_Arabalar
      FROM rezervasyonlari r
      JOIN Araclar a ON r.id_araclar = a.id;
    `;
  
    db.query(query, (err, results) => {
      if (err) {
        console.error('Erreur lors de la récupération des données du tableau de bord:', err.message);
        console.error('Détails complets de l\'erreur:', err);
        return res.status(500).json({ error: 'Erreur du serveur.' });
      }
      res.json(results[0]);
    });
});

  // Endpoint pour les données des graphiques
  app.get('/api/graph-data', (req, res) => {
    const query = `
      SELECT 
        MONTH(r.rezervasyon_tarihi) AS month, 
        SUM(r.gelir) AS gelir
      FROM rezervasyonlari r
      GROUP BY month
      ORDER BY month;
    `;
  
    db.query(query, (err, results) => {
      if (err) {
        console.error('Erreur lors de la récupération des données des graphiques:', err);
        return res.status(500).json({ error: 'Erreur du serveur.' });
      }
      res.json(results);
    });
  });
  

  // Endpoint pour les données de disponibilité des voitures
  app.get('/api/car-availability', (req, res) => {
    const carId = req.query.carId;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
  
    const query = `
  SELECT DATE(r.rezervasyon_tarihi) AS date,
         COUNT(CASE WHEN a.durum = 'Mevcut' THEN 1 ELSE NULL END) AS availableCars
  FROM rezervasyonlari r
  LEFT JOIN Araclar a ON r.id_araclar = a.id
  WHERE a.id = ? AND r.rezervasyon_tarihi = ?
  GROUP BY DATE(r.rezervasyon_tarihi)
  ORDER BY DATE(r.rezervasyon_tarihi)
`;
    db.query(query, [carId, startDate, endDate], (err, results) => {
      if (err) {
        console.error('Erreur SQL:', err);
        return res.status(500).json({ error: 'Erreur du serveur.' });
      }
      console.log('Résultats SQL:', results); // Log des résultats pour déboguer
      res.json(results); // Envoyer les résultats au frontend
    });
  });

  
  // Endpoint pour les données des types de voitures
  app.get('/api/car-type-data', (req, res) => {
    const query = `
        SELECT Araclar.model AS type, COUNT(*) AS count
        FROM Araclar
        GROUP BY Araclar.model;
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error('Erreur lors de la récupération des données des types de voitures:', err);
            return res.status(500).json({ error: 'Erreur du serveur.' });
        }
        res.json(results); // Renvoie les données directement au format JSON
    });
});

  // Endpoint pour les données du statut des réservations
 // Endpoint pour les données du statut des réservations
app.get('/api/booking-status', (req, res) => {
  const query = `
    SELECT 
  Araclar.durum AS durum,
  COUNT(*) AS count
FROM rezervasyonlari
JOIN Araclar ON rezervasyonlari.id_araclar = Araclar.id
GROUP BY Araclar.durum;

  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error('Erreur lors de la récupération des données du statut des réservations:', err);
      return res.status(500).json({ error: 'Erreur du serveur.' });
    }
    res.json(results);
  });
});
// Endpoint : Récupérer les statistiques du tableau de bord
app.get('/api/stats', async (req, res) => {
  try {
      const [stats] = await pool.execute('SELECT * FROM istatistikleri');
      res.json(stats);
  } catch (error) {
      res.status(500).json({ error: error.message });
  }
});


// Endpoint : Liste des véhicules
//app.get('/api/araclar', async (req, res) => {
 //   try {
   //     const [vehicles] = await pool.execute('SELECT * FROM Araclar');
     //   res.json(vehicles);
  //  } catch (error) {
    //    res.status(500).json({ error: error.message });
    //}
//});

// Endpoint : Réservations par client
//
//app.get('/api/rezervasyonlari', async (req, res) => {
 //   try {
   ////     const [bookings] = await pool.execute('SELECT r.id, r.baslangic_tarihi, r.bitis_tarihi, r.toplam_fiyat, a.model, a.marka, m.adi, m.soyadi FROM rezervasyonlari r JOIN Araclar a ON r.id_araclar = a.id JOIN musterileri m ON r.id_musterileri = m.id');
       // res.json(bookings);
    //} catch (error) {
      //  res.status(500).json({ error: error.message });
    //}
//});


// Route pour récupérer les statistiques
//app.get('/istatistikleri', (req, res, next) => {
   // const sql = `
     //   SELECT Araclar.model, COUNT(rezervasyonlari.id) AS toplam_rezervasyonlari,
       //        SUM(rezervasyonlari.toplam_fiyat) AS toplam_gelir
        //FROM rezervasyonlari
        //JOIN Araclar ON rezervasyonlari.id_Araclar = Araclar.id
        //GROUP BY Araclar.model;
    //`;
    //db.query(sql, (err, results) => {
      //  if (err) return next(err);
        //res.status(200).send(results);
    //});
//});

// Démarrage du serveur
app.listen(port, () => {
    console.log(`Serveur démarré sur le port ${port}`);
})