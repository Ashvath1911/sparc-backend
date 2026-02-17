const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
  credentials: false
}));

app.use(express.json());

// ✅ FIXED: Use DATABASE_URL for Render, fallback to localhost
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    })
  : new Pool({
      user: 'postgres',
      host: 'localhost',
      database: 'sparc_db',
      password: 'Ash@$^vath19',
      port: 5432,
      ssl: false
    });

pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Error connecting to database:', err.stack);
  } else {
    console.log('✅ Successfully connected to PostgreSQL database');
    release();
  }
});

const createTablesQuery = `
  CREATE TABLE IF NOT EXISTS patient_intake (
    id SERIAL PRIMARY KEY,
    age INTEGER,
    sex VARCHAR(50),
    cancer_type VARCHAR(255),
    disease_stage VARCHAR(100),
    performance_status INTEGER,
    biomarkers JSONB,
    prior_treatments JSONB,
    comorbidities JSONB,
    survival_benefit INTEGER,
    quality_of_life INTEGER,
    toxicity_tolerance INTEGER,
    cost_sensitivity INTEGER,
    convenience_preference INTEGER,
    ranked_goals JSONB,
    consent_given BOOLEAN,
    submitted_at TIMESTAMP,
    status VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS patient_suggestions (
    id SERIAL PRIMARY KEY,
    patient_intake_id INTEGER REFERENCES patient_intake(id),
    ai_model VARCHAR(100),
    ai_recommendation TEXT,
    guideline_sources TEXT,
    confidence_score INTEGER,
    doctor_review_status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`;

pool.query(createTablesQuery)
  .then(() => console.log('✅ Tables ready'))
  .catch(err => console.error('Error creating tables:', err));

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'SPARC Backend API is running',
    database: 'Connected'
  });
});

app.post('/api/patients/intake', async (req, res) => {
  try {
    console.log('📥 Received patient intake data');
    const {
      basicInfo = {},
      clinicalInfo = {},
      preferences = {},
      prioritization = {},
      consentGiven,
      submittedAt,
      status
    } = req.body;

    if (!basicInfo.age || !basicInfo.sex || !basicInfo.cancerType || !basicInfo.diseaseStage) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    if (!consentGiven) {
      return res.status(400).json({ success: false, error: 'Consent required' });
    }

    const insertQuery = `
      INSERT INTO patient_intake (
        age, sex, cancer_type, disease_stage, performance_status,
        biomarkers, prior_treatments, comorbidities,
        survival_benefit, quality_of_life, toxicity_tolerance,
        cost_sensitivity, convenience_preference,
        ranked_goals, consent_given, submitted_at, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      RETURNING id;
    `;

    const values = [
      basicInfo.age, basicInfo.sex, basicInfo.cancerType, basicInfo.diseaseStage,
      basicInfo.performanceStatus || 0,
      JSON.stringify(clinicalInfo.biomarkers || {}),
      JSON.stringify(clinicalInfo.priorTreatments || []),
      JSON.stringify(clinicalInfo.comorbidities || []),
      preferences.survivalBenefit || 3,
      preferences.qualityOfLife || 3,
      preferences.toxicityTolerance || 3,
      preferences.costSensitivity || 3,
      preferences.conveniencePreference || 3,
      JSON.stringify(prioritization.rankedGoals || []),
      consentGiven,
      submittedAt || new Date().toISOString(),
      status || 'submitted'
    ];

    const result = await pool.query(insertQuery, values);
    console.log(`✅ Patient saved with ID: ${result.rows[0].id}`);
    res.status(201).json({
      success: true,
      message: 'Patient data submitted successfully',
      patientId: result.rows[0].id
    });

  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/doctor/patients', async (req, res) => {
  try {
    const query = `
      SELECT 
        pi.id, pi.age, pi.sex, pi.cancer_type, pi.disease_stage,
        pi.performance_status, pi.created_at,
        ps.id as suggestion_id, ps.ai_model, ps.ai_recommendation,
        ps.confidence_score, ps.doctor_review_status,
        ps.guideline_sources, ps.created_at as recommendation_date
      FROM patient_intake pi
      LEFT JOIN LATERAL (
        SELECT * FROM patient_suggestions 
        WHERE patient_intake_id = pi.id 
        ORDER BY created_at DESC LIMIT 1
      ) ps ON true
      ORDER BY pi.created_at DESC;
    `;
    const result = await pool.query(query);
    res.json({ success: true, patients: result.rows, total: result.rows.length });
  } catch (error) {
    console.error('❌ Error fetching patients:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/doctor/patients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const patientResult = await pool.query('SELECT * FROM patient_intake WHERE id = $1', [id]);
    const suggestionsResult = await pool.query(
      'SELECT * FROM patient_suggestions WHERE patient_intake_id = $1 ORDER BY created_at DESC', [id]
    );
    if (patientResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }
    res.json({
      success: true,
      patient: patientResult.rows[0],
      suggestions: suggestionsResult.rows
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/doctor/suggestions/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const validStatuses = ['pending', 'approved', 'rejected', 'needs_revision'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    const result = await pool.query(
      'UPDATE patient_suggestions SET doctor_review_status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Suggestion not found' });
    }
    res.json({ success: true, suggestion: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/doctor/stats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(DISTINCT pi.id) as total_patients,
        COUNT(ps.id) FILTER (WHERE ps.doctor_review_status = 'pending') as pending_reviews,
        COUNT(ps.id) FILTER (WHERE ps.doctor_review_status = 'approved') as approved_count,
        ROUND(AVG(ps.confidence_score)::numeric, 2) as avg_confidence
      FROM patient_intake pi
      LEFT JOIN patient_suggestions ps ON pi.id = ps.patient_intake_id;
    `);
    res.json({ success: true, stats: result.rows[0] });
  } catch (error) {
    console.error('❌ Error fetching stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(port, () => {
  console.log(`🚀 SPARC Backend API running on http://localhost:${port}`);
  console.log(`✅ Database: ${process.env.DATABASE_URL ? 'Render Cloud' : 'Local'}`);
  console.log(`🔗 All endpoints ready`);
});