const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const streamifier = require('streamifier');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

// PostgreSQL setup with NEW Neon DB connection string
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_hMv2YDGg0VoT@ep-late-band-ade3oc4m-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: {
    rejectUnauthorized: false
  }
});

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Error connecting to Neon database:', err.stack);
  } else {
    console.log('✅ Successfully connected to Neon database');
    release();
  }
});

// Cloudinary Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Multer Configuration - Memory Storage for Cloudinary
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { 
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Video upload configuration
const videoStorage = multer.memoryStorage();
const videoUpload = multer({ 
  storage: videoStorage,
  limits: { 
    fileSize: 100 * 1024 * 1024 // 100MB limit for videos
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are allowed!'), false);
    }
  }
});

// Nodemailer setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Helper Functions
const sendEmail = (subject, htmlContent) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_RECIVER,
    subject,
    html: htmlContent
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      return console.error('Error sending email:', error);
    }
    console.log('Email sent:', info.response);
  });
};

const formatAsTable = (dataObj) => {
  return `
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse;">
      ${Object.entries(dataObj).map(([key, value]) =>
        `<tr><th align="left">${key}</th><td>${value}</td></tr>`).join('')}
    </table>
  `;
};

// Cloudinary Upload Helper
const uploadToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'payana_news',
        resource_type: 'auto',
        transformation: [
          { width: 1200, height: 800, crop: 'limit' },
          { quality: 'auto:good' }
        ]
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }
    );
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

// Video upload to Cloudinary
const uploadVideoToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'payana_testimonials',
        resource_type: 'video',
        eager: [
          { width: 1280, height: 720, crop: 'limit', format: 'mp4' }
        ],
        eager_async: false,
        transformation: [
          { quality: 'auto:good' }
        ]
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }
    );
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

// ==================== DATABASE INITIALIZATION ====================

// Create all necessary tables
const initializeTables = async () => {
  try {
    // Study table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS study (
        id SERIAL PRIMARY KEY,
        country VARCHAR(100),
        qualification VARCHAR(50),
        age VARCHAR(20),
        education_topic VARCHAR(100),
        cgpa VARCHAR(20),
        budget VARCHAR(50),
        needs_loan BOOLEAN,
        name VARCHAR(100),
        email VARCHAR(100),
        phone VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Study table ready');

    // Work profiles table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS work_profiles (
        id SERIAL PRIMARY KEY,
        occupation VARCHAR(100),
        education VARCHAR(100),
        experience VARCHAR(100),
        name VARCHAR(100),
        email VARCHAR(100),
        phone VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Work profiles table ready');

    // Invest table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS invest (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        email VARCHAR(100),
        country VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Invest table ready');

    // News articles table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS news_articles (
        id SERIAL PRIMARY KEY,
        image_url TEXT NOT NULL,
        cloudinary_id VARCHAR(255),
        date VARCHAR(50) NOT NULL,
        time VARCHAR(50) NOT NULL,
        description JSONB NOT NULL,
        tag VARCHAR(100) NOT NULL,
        views INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by VARCHAR(100) DEFAULT 'admin',
        updated_by VARCHAR(100)
      )
    `);
    console.log('✅ News articles table ready');

    // Testimonials table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS testimonials (
        id SERIAL PRIMARY KEY,
        video_url TEXT NOT NULL,
        cloudinary_id VARCHAR(255),
        name VARCHAR(100) NOT NULL,
        prefix VARCHAR(10) DEFAULT 'None',
        views INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        display_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by VARCHAR(100) DEFAULT 'admin',
        updated_by VARCHAR(100)
      )
    `);
    console.log('✅ Testimonials table ready');

    // Ads table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ads (
        id SERIAL PRIMARY KEY,
        image_url TEXT NOT NULL,
        cloudinary_id VARCHAR(255),
        is_active BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by VARCHAR(100) DEFAULT 'admin',
        updated_by VARCHAR(100)
      )
    `);
    console.log('✅ Ads table ready');

    console.log('🎉 All tables initialized successfully!');

  } catch (err) {
    console.error('❌ Error initializing tables:', err);
  }
};

// Initialize database
initializeTables();

// ==================== FORM SUBMISSION ROUTES ====================

// Study form submission
app.post('/submit-form', async (req, res) => {
  const formData = req.body;
  console.log('📚 Received study form data:', formData);

  const query = `
    INSERT INTO study (
      country, qualification, age, education_topic, cgpa, budget,
      needs_loan, name, email, phone
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *
  `;

  const values = [
    formData.selectedCountry,
    formData.selectedQualification,
    formData.selectedAge,
    formData.selectedEducationTopic,
    formData.currentCgpa,
    formData.selectedBudget,
    formData.needsLoan,
    formData.name,
    formData.email,
    formData.phone
  ];

  try {
    const result = await pool.query(query, values);
    console.log('✅ Study data inserted successfully');

    // Send email
    const emailSubject = '🎓 New Study Abroad Inquiry';
    const emailBody = `
      <h2>Study Abroad Inquiry</h2>
      <p>A new student wants to study abroad. Here are their details:</p>
      ${formatAsTable({
        'Country': formData.selectedCountry,
        'Qualification': formData.selectedQualification,
        'Age': formData.selectedAge,
        'Education Topic': formData.selectedEducationTopic,
        'CGPA': formData.currentCgpa,
        'Budget': formData.selectedBudget,
        'Needs Loan': formData.needsLoan ? 'Yes' : 'No',
        'Name': formData.name,
        'Email': formData.email,
        'Phone': formData.phone
      })}
    `;
    sendEmail(emailSubject, emailBody);

    res.status(200).json({
      success: true,
      message: 'Form submitted successfully',
      data: result.rows[0]
    });
  } catch (err) {
    console.error('❌ Error inserting study data:', err);
    res.status(500).json({
      success: false,
      message: 'Database error',
      error: err.message
    });
  }
});

// Work form submission
app.post('/submit-work-form', async (req, res) => {
  const formData = req.body;
  console.log('💼 Received work profile data:', formData);

  const query = `
    INSERT INTO work_profiles (
      occupation, education, experience, name, email, phone
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `;

  const values = [
    formData.occupation,
    formData.education,
    formData.experience,
    formData.name,
    formData.email,
    formData.phone
  ];

  try {
    const result = await pool.query(query, values);
    console.log('✅ Work profile data inserted successfully');

    // Send email
    const emailSubject = '💼 New Work Abroad Inquiry';
    const emailBody = `
      <h2>Work Abroad Inquiry</h2>
      <p>A new candidate wants to work abroad. Here are their details:</p>
      ${formatAsTable({
        'Occupation': formData.occupation,
        'Education': formData.education,
        'Experience': formData.experience,
        'Name': formData.name,
        'Email': formData.email,
        'Phone': formData.phone
      })}
    `;
    sendEmail(emailSubject, emailBody);

    res.status(200).json({
      success: true,
      message: 'Work profile saved successfully',
      data: result.rows[0]
    });
  } catch (err) {
    console.error('❌ Error inserting work data:', err);
    res.status(500).json({
      success: false,
      message: 'Database error',
      error: err.message
    });
  }
});

// Invest form submission
app.post('/submit-invest-form', async (req, res) => {
  const { name, email, country } = req.body;
  console.log('💰 Received investment inquiry:', { name, email, country });

  const query = `
    INSERT INTO invest (name, email, country)
    VALUES ($1, $2, $3)
    RETURNING *
  `;

  try {
    const result = await pool.query(query, [name, email, country]);
    console.log('✅ Investment data inserted successfully');

    // Send email
    const emailSubject = '💰 New Investment Inquiry';
    const emailBody = `
      <h2>Investment Abroad Inquiry</h2>
      <p>A new investor wants to invest abroad. Here are their details:</p>
      ${formatAsTable({ 
        'Name': name, 
        'Email': email, 
        'Country': country 
      })}
    `;
    sendEmail(emailSubject, emailBody);

    res.status(200).json({
      success: true,
      message: 'Investment inquiry submitted successfully',
      data: result.rows[0]
    });
  } catch (err) {
    console.error('❌ Error inserting investment data:', err);
    res.status(500).json({
      success: false,
      message: 'Database error',
      error: err.message
    });
  }
});

// ==================== ADMIN LEADS ROUTES ====================

// GET study leads (for admin)
app.get('/admin/leads/study', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM study ORDER BY created_at DESC'
    );
    
    res.json({ 
      success: true, 
      data: result.rows
    });
  } catch (err) {
    console.error('❌ Error fetching study leads:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET work leads (for admin)
app.get('/admin/leads/work', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM work_profiles ORDER BY created_at DESC'
    );
    
    res.json({ 
      success: true, 
      data: result.rows
    });
  } catch (err) {
    console.error('❌ Error fetching work leads:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET investment leads (for admin)
app.get('/admin/leads/invest', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM invest ORDER BY created_at DESC'
    );
    
    res.json({ 
      success: true, 
      data: result.rows
    });
  } catch (err) {
    console.error('❌ Error fetching invest leads:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== NEWS MANAGEMENT ROUTES ====================

// GET all active news articles (for public website)
app.get('/news', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM news_articles WHERE is_active = true ORDER BY created_at DESC'
    );
    
    res.json({ 
      success: true, 
      data: result.rows.map(article => ({
        id: article.id,
        image: article.image_url,
        date: article.date,
        time: article.time,
        description: article.description,
        tag: article.tag,
        views: article.views
      }))
    });
  } catch (err) {
    console.error('❌ Error fetching news:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET all news articles (for admin portal)
app.get('/admin/news', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM news_articles ORDER BY created_at DESC'
    );
    
    res.json({ 
      success: true, 
      data: result.rows
    });
  } catch (err) {
    console.error('❌ Error fetching admin news:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST - Create new news article
app.post('/news', upload.single('image'), async (req, res) => {
  try {
    const { date, time, description, tag } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Image is required' });
    }

    if (!date || !time || !description || !tag) {
      return res.status(400).json({ 
        success: false, 
        message: 'All fields are required' 
      });
    }

    console.log('📸 Uploading image to Cloudinary...');
    const cloudinaryResult = await uploadToCloudinary(req.file.buffer);
    console.log('✅ Image uploaded:', cloudinaryResult.secure_url);

    // Parse description
    let descArray = [];
    if (typeof description === 'string') {
      try {
        descArray = JSON.parse(description);
      } catch {
        descArray = description.split('\n').filter(d => d.trim());
      }
    }

    const query = `
      INSERT INTO news_articles (
        image_url, cloudinary_id, date, time, description, tag
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const values = [
      cloudinaryResult.secure_url,
      cloudinaryResult.public_id,
      date,
      time,
      JSON.stringify(descArray),
      tag
    ];

    const result = await pool.query(query, values);
    console.log('✅ News article created successfully');

    res.json({ 
      success: true, 
      message: 'Article created successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error creating news:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT - Update news article
app.put('/news/:id', upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const { date, time, description, tag } = req.body;
    
    const checkQuery = 'SELECT * FROM news_articles WHERE id = $1';
    const checkResult = await pool.query(checkQuery, [id]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Article not found' });
    }

    const currentArticle = checkResult.rows[0];
    let imageUrl = currentArticle.image_url;
    let cloudinaryId = currentArticle.cloudinary_id;

    // If new image uploaded
    if (req.file) {
      console.log('📸 Uploading new image to Cloudinary...');
      
      // Delete old image from Cloudinary if exists
      if (cloudinaryId) {
        try {
          await cloudinary.uploader.destroy(cloudinaryId);
          console.log('🗑️ Old image deleted from Cloudinary');
        } catch (err) {
          console.log('⚠️ Could not delete old image:', err.message);
        }
      }

      const cloudinaryResult = await uploadToCloudinary(req.file.buffer);
      imageUrl = cloudinaryResult.secure_url;
      cloudinaryId = cloudinaryResult.public_id;
      console.log('✅ New image uploaded:', imageUrl);
    }

    let descArray = currentArticle.description;
    if (description) {
      try {
        descArray = JSON.parse(description);
      } catch {
        descArray = description.split('\n').filter(d => d.trim());
      }
    }

    const updateQuery = `
      UPDATE news_articles 
      SET image_url = $1, 
          cloudinary_id = $2,
          date = $3, 
          time = $4, 
          description = $5, 
          tag = $6,
          updated_at = CURRENT_TIMESTAMP,
          updated_by = $7
      WHERE id = $8
      RETURNING *
    `;

    const values = [
      imageUrl,
      cloudinaryId,
      date || currentArticle.date,
      time || currentArticle.time,
      JSON.stringify(descArray),
      tag || currentArticle.tag,
      'admin',
      id
    ];

    const result = await pool.query(updateQuery, values);
    console.log('✅ News article updated successfully');

    res.json({ 
      success: true,
      message: 'Article updated successfully', 
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error updating news:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE - Delete news article
app.delete('/news/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const checkQuery = 'SELECT * FROM news_articles WHERE id = $1';
    const checkResult = await pool.query(checkQuery, [id]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Article not found' });
    }

    const article = checkResult.rows[0];

    // Delete from Cloudinary if exists
    if (article.cloudinary_id) {
      try {
        await cloudinary.uploader.destroy(article.cloudinary_id);
        console.log('🗑️ Image deleted from Cloudinary');
      } catch (err) {
        console.log('⚠️ Could not delete image from Cloudinary:', err.message);
      }
    }

    await pool.query('DELETE FROM news_articles WHERE id = $1', [id]);
    console.log('✅ News article deleted successfully');

    res.json({ success: true, message: 'Article deleted successfully' });
  } catch (error) {
    console.error('❌ Error deleting news:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH - Toggle article active status
app.patch('/news/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'UPDATE news_articles SET is_active = NOT is_active WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Article not found' });
    }

    res.json({ 
      success: true, 
      message: `Article ${result.rows[0].is_active ? 'activated' : 'deactivated'}`,
      data: { is_active: result.rows[0].is_active }
    });
  } catch (error) {
    console.error('❌ Error toggling article status:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST - Increment article views
app.post('/news/:id/view', async (req, res) => {
  try {
    const { id } = req.params;
    
    await pool.query(
      'UPDATE news_articles SET views = views + 1 WHERE id = $1',
      [id]
    );

    res.json({ success: true, message: 'View counted' });
  } catch (error) {
    console.error('❌ Error incrementing views:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET - News statistics
app.get('/admin/news/stats', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_articles,
        COUNT(*) FILTER (WHERE is_active = true) as active_articles,
        COUNT(*) FILTER (WHERE is_active = false) as inactive_articles,
        COALESCE(SUM(views), 0) as total_views,
        COALESCE(AVG(views), 0) as avg_views_per_article
      FROM news_articles
    `);

    const topArticles = await pool.query(`
      SELECT id, tag, views, date
      FROM news_articles
      ORDER BY views DESC
      LIMIT 5
    `);

    res.json({ 
      success: true, 
      data: {
        stats: stats.rows[0],
        top_articles: topArticles.rows
      }
    });
  } catch (error) {
    console.error('❌ Error fetching stats:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== TESTIMONIAL ROUTES ====================

// GET all active testimonials
app.get('/testimonials', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, video_url, name, prefix, views FROM testimonials WHERE is_active = true ORDER BY display_order ASC, created_at DESC'
    );
    
    res.json({ 
      success: true, 
      data: result.rows
    });
  } catch (err) {
    console.error('❌ Error fetching testimonials:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET all testimonials (for admin)
app.get('/admin/testimonials', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM testimonials ORDER BY display_order ASC, created_at DESC'
    );
    
    res.json({ 
      success: true, 
      data: result.rows
    });
  } catch (err) {
    console.error('❌ Error fetching admin testimonials:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST - Create new testimonial
app.post('/testimonials', videoUpload.single('video'), async (req, res) => {
  try {
    const { name, prefix } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Video is required' });
    }

    if (!name) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name is required' 
      });
    }

    console.log('📹 Uploading video to Cloudinary...');
    const cloudinaryResult = await uploadVideoToCloudinary(req.file.buffer);
    console.log('✅ Video uploaded:', cloudinaryResult.secure_url);

    // Get the highest display_order
    const maxOrderResult = await pool.query(
      'SELECT COALESCE(MAX(display_order), 0) as max_order FROM testimonials'
    );
    const nextOrder = parseInt(maxOrderResult.rows[0].max_order) + 1;

    const query = `
      INSERT INTO testimonials (
        video_url, cloudinary_id, name, prefix, display_order
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const values = [
      cloudinaryResult.secure_url,
      cloudinaryResult.public_id,
      name,
      prefix || 'None',
      nextOrder
    ];

    const result = await pool.query(query, values);
    console.log('✅ Testimonial created successfully');

    res.json({ 
      success: true, 
      message: 'Testimonial created successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error creating testimonial:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT - Update testimonial
app.put('/testimonials/:id', videoUpload.single('video'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, prefix } = req.body;
    
    const checkQuery = 'SELECT * FROM testimonials WHERE id = $1';
    const checkResult = await pool.query(checkQuery, [id]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Testimonial not found' });
    }

    const currentTestimonial = checkResult.rows[0];
    let videoUrl = currentTestimonial.video_url;
    let cloudinaryId = currentTestimonial.cloudinary_id;

    // If new video uploaded
    if (req.file) {
      console.log('📹 Uploading new video to Cloudinary...');
      
      // Delete old video from Cloudinary if exists
      if (cloudinaryId) {
        try {
          await cloudinary.uploader.destroy(cloudinaryId, { resource_type: 'video' });
          console.log('🗑️ Old video deleted from Cloudinary');
        } catch (err) {
          console.log('⚠️ Could not delete old video:', err.message);
        }
      }

      const cloudinaryResult = await uploadVideoToCloudinary(req.file.buffer);
      videoUrl = cloudinaryResult.secure_url;
      cloudinaryId = cloudinaryResult.public_id;
      console.log('✅ New video uploaded:', videoUrl);
    }

    const updateQuery = `
      UPDATE testimonials 
      SET video_url = $1, 
          cloudinary_id = $2,
          name = $3, 
          prefix = $4,
          updated_at = CURRENT_TIMESTAMP,
          updated_by = $5
      WHERE id = $6
      RETURNING *
    `;

    const values = [
      videoUrl,
      cloudinaryId,
      name || currentTestimonial.name,
      prefix || currentTestimonial.prefix,
      'admin',
      id
    ];

    const result = await pool.query(updateQuery, values);
    console.log('✅ Testimonial updated successfully');

    res.json({ 
      success: true,
      message: 'Testimonial updated successfully', 
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error updating testimonial:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE - Delete testimonial
app.delete('/testimonials/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const checkQuery = 'SELECT * FROM testimonials WHERE id = $1';
    const checkResult = await pool.query(checkQuery, [id]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Testimonial not found' });
    }

    const testimonial = checkResult.rows[0];

    // Delete from Cloudinary if exists
    if (testimonial.cloudinary_id) {
      try {
        await cloudinary.uploader.destroy(testimonial.cloudinary_id, { resource_type: 'video' });
        console.log('🗑️ Video deleted from Cloudinary');
      } catch (err) {
        console.log('⚠️ Could not delete video from Cloudinary:', err.message);
      }
    }

    await pool.query('DELETE FROM testimonials WHERE id = $1', [id]);
    console.log('✅ Testimonial deleted successfully');

    res.json({ success: true, message: 'Testimonial deleted successfully' });
  } catch (error) {
    console.error('❌ Error deleting testimonial:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH - Toggle testimonial active status
app.patch('/testimonials/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'UPDATE testimonials SET is_active = NOT is_active WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Testimonial not found' });
    }

    res.json({ 
      success: true, 
      message: `Testimonial ${result.rows[0].is_active ? 'activated' : 'deactivated'}`,
      data: { is_active: result.rows[0].is_active }
    });
  } catch (error) {
    console.error('❌ Error toggling testimonial status:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT - Reorder testimonials
app.put('/testimonials/reorder', async (req, res) => {
  try {
    const { order } = req.body;
    
    if (!order || !Array.isArray(order)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Order array is required' 
      });
    }

    const updatePromises = order.map((item) => {
      return pool.query(
        'UPDATE testimonials SET display_order = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [item.order, item.id]
      );
    });

    await Promise.all(updatePromises);
    
    console.log('✅ Testimonials reordered successfully');
    res.json({ 
      success: true, 
      message: 'Order updated successfully' 
    });
  } catch (error) {
    console.error('❌ Error updating order:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update order',
      error: error.message 
    });
  }
});

// POST - Increment testimonial views
app.post('/testimonials/:id/view', async (req, res) => {
  try {
    const { id } = req.params;
    
    await pool.query(
      'UPDATE testimonials SET views = views + 1 WHERE id = $1',
      [id]
    );

    res.json({ success: true, message: 'View counted' });
  } catch (error) {
    console.error('❌ Error incrementing views:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET - Testimonial statistics
app.get('/admin/testimonials/stats', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_testimonials,
        COUNT(*) FILTER (WHERE is_active = true) as active_testimonials,
        COUNT(*) FILTER (WHERE is_active = false) as inactive_testimonials,
        COALESCE(SUM(views), 0) as total_views,
        COALESCE(AVG(views), 0) as avg_views_per_testimonial
      FROM testimonials
    `);

    const topTestimonials = await pool.query(`
      SELECT id, name, prefix, views
      FROM testimonials
      ORDER BY views DESC
      LIMIT 5
    `);

    res.json({ 
      success: true, 
      data: {
        stats: stats.rows[0],
        top_testimonials: topTestimonials.rows
      }
    });
  } catch (error) {
    console.error('❌ Error fetching testimonial stats:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== ADS ROUTES ====================

// GET active ad
app.get('/ads/active', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, image_url FROM ads WHERE is_active = true LIMIT 1'
    );
    
    res.json({ 
      success: true, 
      data: result.rows[0] || null
    });
  } catch (err) {
    console.error('❌ Error fetching active ad:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET all ads (for admin)
app.get('/admin/ads', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM ads ORDER BY created_at DESC'
    );
    
    res.json({ 
      success: true, 
      data: result.rows
    });
  } catch (err) {
    console.error('❌ Error fetching admin ads:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST - Create new ad
app.post('/ads', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Image is required' });
    }

    console.log('📸 Uploading ad image to Cloudinary...');
    const cloudinaryResult = await uploadToCloudinary(req.file.buffer);
    console.log('✅ Ad image uploaded:', cloudinaryResult.secure_url);

    const query = `
      INSERT INTO ads (
        image_url, cloudinary_id, is_active
      ) VALUES ($1, $2, false)
      RETURNING *
    `;

    const values = [
      cloudinaryResult.secure_url,
      cloudinaryResult.public_id
    ];

    const result = await pool.query(query, values);
    console.log('✅ Ad created successfully');

    res.json({ 
      success: true, 
      message: 'Ad created successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error creating ad:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT - Update ad
app.put('/ads/:id', upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    
    const checkQuery = 'SELECT * FROM ads WHERE id = $1';
    const checkResult = await pool.query(checkQuery, [id]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ad not found' });
    }

    const currentAd = checkResult.rows[0];
    let imageUrl = currentAd.image_url;
    let cloudinaryId = currentAd.cloudinary_id;

    // If new image uploaded
    if (req.file) {
      console.log('📸 Uploading new ad image to Cloudinary...');
      
      // Delete old image from Cloudinary if exists
      if (cloudinaryId) {
        try {
          await cloudinary.uploader.destroy(cloudinaryId);
          console.log('🗑️ Old ad image deleted from Cloudinary');
        } catch (err) {
          console.log('⚠️ Could not delete old image:', err.message);
        }
      }

      const cloudinaryResult = await uploadToCloudinary(req.file.buffer);
      imageUrl = cloudinaryResult.secure_url;
      cloudinaryId = cloudinaryResult.public_id;
      console.log('✅ New ad image uploaded:', imageUrl);
    }

    const updateQuery = `
      UPDATE ads 
      SET image_url = $1, 
          cloudinary_id = $2,
          updated_at = CURRENT_TIMESTAMP,
          updated_by = $3
      WHERE id = $4
      RETURNING *
    `;

    const values = [
      imageUrl,
      cloudinaryId,
      'admin',
      id
    ];

    const result = await pool.query(updateQuery, values);
    console.log('✅ Ad updated successfully');

    res.json({ 
      success: true,
      message: 'Ad updated successfully', 
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error updating ad:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE - Delete ad
app.delete('/ads/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const checkQuery = 'SELECT * FROM ads WHERE id = $1';
    const checkResult = await pool.query(checkQuery, [id]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ad not found' });
    }

    const ad = checkResult.rows[0];

    // Delete from Cloudinary if exists
    if (ad.cloudinary_id) {
      try {
        await cloudinary.uploader.destroy(ad.cloudinary_id);
        console.log('🗑️ Ad image deleted from Cloudinary');
      } catch (err) {
        console.log('⚠️ Could not delete image from Cloudinary:', err.message);
      }
    }

    await pool.query('DELETE FROM ads WHERE id = $1', [id]);
    console.log('✅ Ad deleted successfully');

    res.json({ success: true, message: 'Ad deleted successfully' });
  } catch (error) {
    console.error('❌ Error deleting ad:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH - Set ad as active
app.patch('/ads/:id/set-active', async (req, res) => {
  try {
    const { id } = req.params;
    
    // First, deactivate all ads
    await pool.query('UPDATE ads SET is_active = false');
    
    // Then activate the selected ad
    const result = await pool.query(
      'UPDATE ads SET is_active = true WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ad not found' });
    }

    res.json({ 
      success: true, 
      message: 'Ad activated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error activating ad:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH - Deactivate all ads
app.patch('/ads/deactivate-all', async (req, res) => {
  try {
    await pool.query('UPDATE ads SET is_active = false');
    
    res.json({ 
      success: true, 
      message: 'All ads deactivated'
    });
  } catch (error) {
    console.error('❌ Error deactivating ads:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET - Ad statistics
app.get('/admin/ads/stats', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_ads,
        COUNT(*) FILTER (WHERE is_active = true) as active_ads
      FROM ads
    `);

    res.json({ 
      success: true, 
      data: stats.rows[0]
    });
  } catch (error) {
    console.error('❌ Error fetching ad stats:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== UTILITY ROUTES ====================

// Health check route
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Payana Overseas API is running',
    database: 'Connected to Neon PostgreSQL',
    timestamp: new Date().toISOString()
  });
});

// Database test route
app.get('/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as current_time');
    res.json({ 
      success: true, 
      message: 'Database connection successful',
      current_time: result.rows[0].current_time
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Database connection failed',
      error: error.message 
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  res.status(500).json({ 
    success: false, 
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
app.listen(port, () => {
  console.log(`\n🚀 Payana Overseas Server running on port ${port}`);
  console.log(`📍 Health check: http://localhost:${port}/health`);
  console.log(`🗄️  Database test: http://localhost:${port}/test-db`);
  console.log(`📰 News API: http://localhost:${port}/news`);
  console.log(`🔐 Admin API: http://localhost:${port}/admin/news`);
  console.log(`💬 Testimonials: http://localhost:${port}/testimonials`);
  console.log(`📢 Ads: http://localhost:${port}/ads/active\n`);
});

module.exports = app;
