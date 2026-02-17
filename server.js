const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;

// CORS configuration - allow all origins
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'ngrok-skip-browser-warning'],
  credentials: false
}));

app.use(express.json());

// PostgreSQL connection pool
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'sparc_db',
  password: 'Ash@$^vath19',
  port: 5432,
});

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to the database:', err.stack);
  } else {
    console.log('✅ Successfully connected to PostgreSQL database');
    release();
  }
});

// Create patient_intake table if it doesn't exist
const createTableQuery = `
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
`;

pool.query(createTableQuery)
  .then(() => console.log('✅ patient_intake table ready'))
  .catch(err => console.error('Error creating table:', err));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'SPARC Backend API is running',
    database: 'Connected'
  });
});

// Patient intake endpoint
app.post('/api/patients/intake', async (req, res) => {
  try {
    console.log('📥 Received patient intake data');
    
    // Extract data from nested structure
    const {
      basicInfo = {},
      clinicalInfo = {},
      preferences = {},
      prioritization = {},
      consentGiven,
      submittedAt,
      status
    } = req.body;

    // Validate required fields
    if (!basicInfo.age || !basicInfo.sex || !basicInfo.cancerType || !basicInfo.diseaseStage) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required basic information fields' 
      });
    }

    if (!consentGiven) {
      return res.status(400).json({ 
        success: false, 
        error: 'Consent must be given to submit data' 
      });
    }

    // Insert data into database
    const insertQuery = `
      INSERT INTO patient_intake (
        age, sex, cancer_type, disease_stage, performance_status,
        biomarkers, prior_treatments, comorbidities,
        survival_benefit, quality_of_life, toxicity_tolerance, 
        cost_sensitivity, convenience_preference,
        ranked_goals, consent_given, submitted_at, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING id;
    `;

    const values = [
      basicInfo.age,
      basicInfo.sex,
      basicInfo.cancerType,
      basicInfo.diseaseStage,
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
    const patientId = result.rows[0].id;

    console.log(`✅ Patient data saved with ID: ${patientId}`);

    res.status(201).json({
      success: true,
      message: 'Patient data submitted successfully',
      patientId: patientId
    });

  } catch (error) {
    console.error('❌ Error saving patient data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save patient data',
      details: error.message
    });
  }
});

// Start server
// ============================================
// DOCTOR CONSOLE ENDPOINTS
// ============================================

// Get all patients with their latest AI recommendations
app.get('/api/doctor/patients', async (req, res) => {
  console.log('📊 Doctor Console: Fetching all patients');
  
  try {
    const query = `
      SELECT 
        pi.id,
        pi.age,
        pi.sex,
        pi.cancer_type,
        pi.disease_stage,
        pi.performance_status,
        pi.created_at,
        ps.id as suggestion_id,
        ps.ai_model,
        ps.ai_recommendation,
        ps.confidence_score,
        ps.doctor_review_status,
        ps.guideline_sources,
        ps.created_at as recommendation_date
      FROM patient_intake pi
      LEFT JOIN LATERAL (
        SELECT * FROM patient_suggestions 
        WHERE patient_intake_id = pi.id 
        ORDER BY created_at DESC 
        LIMIT 1
      ) ps ON true
      ORDER BY pi.created_at DESC;
    `;
    
    const result = await pool.query(query);
    
    console.log(`✅ Found ${result.rows.length} patients`);
    
    res.json({ 
      success: true, 
      patients: result.rows,
      total: result.rows.length
    });
    
  } catch (error) {
    console.error('❌ Error fetching patients:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get detailed view of a single patient
app.get('/api/doctor/patients/:id', async (req, res) => {
  console.log(`📋 Fetching patient details for ID: ${req.params.id}`);
  
  try {
    const { id } = req.params;
    
    const patientQuery = `SELECT * FROM patient_intake WHERE id = $1`;
    const suggestionsQuery = `
      SELECT * FROM patient_suggestions 
      WHERE patient_intake_id = $1 
      ORDER BY created_at DESC
    `;
    
    const patientResult = await pool.query(patientQuery, [id]);
    const suggestionsResult = await pool.query(suggestionsQuery, [id]);
    
    if (patientResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Patient not found' 
      });
    }
    
    console.log(`✅ Found patient with ${suggestionsResult.rows.length} recommendations`);
    
    res.json({
      success: true,
      patient: patientResult.rows[0],
      suggestions: suggestionsResult.rows
    });
    
  } catch (error) {
    console.error('❌ Error fetching patient details:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Update review status
app.put('/api/doctor/suggestions/:id/status', async (req, res) => {
  console.log(`🔄 Updating suggestion ${req.params.id} status to: ${req.body.status}`);
  
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const validStatuses = ['pending', 'approved', 'rejected', 'needs_revision'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid status value' 
      });
    }
    
    const query = `
      UPDATE patient_suggestions 
      SET doctor_review_status = $1
      WHERE id = $2
      RETURNING *;
    `;
    
    const result = await pool.query(query, [status, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Suggestion not found' 
      });
    }
    
    console.log('✅ Status updated successfully');
    
    res.json({ 
      success: true, 
      suggestion: result.rows[0] 
    });
    
  } catch (error) {
    console.error('❌ Error updating status:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get statistics for dashboard
app.get('/api/doctor/stats', async (req, res) => {
  console.log('📈 Fetching dashboard statistics');
  
  try {
    const statsQuery = `
      SELECT 
        COUNT(DISTINCT pi.id) as total_patients,
        COUNT(ps.id) FILTER (WHERE ps.doctor_review_status = 'pending') as pending_reviews,
        COUNT(ps.id) FILTER (WHERE ps.doctor_review_status = 'approved') as approved_count,
        ROUND(AVG(ps.confidence_score)::numeric, 2) as avg_confidence
      FROM patient_intake pi
      LEFT JOIN patient_suggestions ps ON pi.id = ps.patient_intake_id;
    `;
    
    const result = await pool.query(statsQuery);
    
    res.json({
      success: true,
      stats: result.rows[0]
    });
    
  } catch (error) {
    console.error('❌ Error fetching stats:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});
app.listen(port, () => {
  console.log(`🔗 Endpoints:`);
console.log(`   - GET  /health`);
console.log(`   - POST /api/patients/intake`);
console.log(`   - GET  /api/doctor/patients`);
console.log(`   - GET  /api/doctor/patients/:id`);
console.log(`   - PUT  /api/doctor/suggestions/:id/status`);
console.log(`   - GET  /api/doctor/stats`);
});
